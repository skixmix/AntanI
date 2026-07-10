use std::io::{BufRead, BufReader, Read};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpStream};
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdout, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

/// Loopback host the embedded server binds to. Never exposed off-box.
pub const SERVE_WEB_HOST: &str = "127.0.0.1";

/// Fixed port for `code serve-web`. Pinned (not ephemeral) so every project's
/// child webview shares one stable origin — VS Code keys its per-folder state by
/// origin, so a stable port is what lets an editor tab survive app restarts.
pub const SERVE_WEB_PORT: u16 = 51851;

/// Subfolder (under the app-data dir) for the server's own state, kept out of the
/// user's projects so serve-web never writes into a project folder.
const SERVER_DATA_DIR: &str = "vscode-server-data";

/// Crash-only fallback: the server's process-group id, so an orphan left by an
/// app crash can be reclaimed on next launch. The normal teardown path is `stop`.
const PID_FILE: &str = "vscode-server.pid";

/// How long to wait for the port to accept connections. Generous because the very
/// first `serve-web` run downloads and extracts the server before it listens.
const READY_TIMEOUT: Duration = Duration::from_secs(90);

/// Poll cadence while waiting for the port to come up.
const TCP_POLL_INTERVAL: Duration = Duration::from_millis(250);

/// One TCP connect attempt's timeout while polling for readiness.
const TCP_CONNECT_TIMEOUT: Duration = Duration::from_millis(300);

/// Grace period after SIGTERM before we escalate to SIGKILL on the process group.
const TERM_GRACE: Duration = Duration::from_millis(500);

/// Frontend event carrying server lifecycle transitions.
const STATUS_EVENT: &str = "ide-server-status";

/// Fallback login shell when `$SHELL` is unset (apps launched from Finder).
const DEFAULT_SHELL: &str = "/bin/zsh";

/// Server lifecycle. A single shared server backs every project's IDE webview, so
/// this is app-global state, not per project.
#[derive(Clone, PartialEq, Eq)]
enum Phase {
    Stopped,
    Starting,
    Ready,
    Failed,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StatusPayload {
    status: String,
    message: Option<String>,
}

struct Inner {
    phase: Phase,
    /// The serve-web child, kept so we can reap it. `None` once reaped.
    child: Option<Child>,
    /// Process-group id (== child pid, thanks to `setsid`) for group-kill.
    pgid: Option<i32>,
}

/// Managed Tauri state for the lazily-started, shared `code serve-web` process.
pub struct VscodeServer {
    inner: Mutex<Inner>,
    app_data_dir: PathBuf,
}

impl VscodeServer {
    pub fn new(app_data_dir: PathBuf) -> Self {
        Self {
            inner: Mutex::new(Inner {
                phase: Phase::Stopped,
                child: None,
                pgid: None,
            }),
            app_data_dir,
        }
    }

    fn pid_path(&self) -> PathBuf {
        self.app_data_dir.join(PID_FILE)
    }

    fn data_dir(&self) -> PathBuf {
        self.app_data_dir.join(SERVER_DATA_DIR)
    }

    /// The port to load once the server is up, or `None` if it is not ready.
    pub fn ready_port(&self) -> Option<u16> {
        let inner = self.inner.lock().ok()?;
        (inner.phase == Phase::Ready).then_some(SERVE_WEB_PORT)
    }

    /// Ensure the shared server is starting or up. Idempotent: concurrent callers
    /// see `Starting`/`Ready` and return without spawning a second process. The
    /// actual launch + readiness poll runs on a background thread so this returns
    /// immediately; progress is delivered via the `ide-server-status` event, and
    /// the returned status lets a caller that finds it already `Ready` proceed at
    /// once (it would otherwise miss the one-shot event).
    pub fn ensure_started(&self, app: &AppHandle) -> String {
        {
            let mut inner = match self.inner.lock() {
                Ok(inner) => inner,
                Err(_) => return "failed".to_string(),
            };
            match inner.phase {
                Phase::Ready => return "ready".to_string(),
                Phase::Starting => return "starting".to_string(),
                Phase::Stopped | Phase::Failed => inner.phase = Phase::Starting,
            }
        }
        emit_status(app, "starting", None);
        let app = app.clone();
        thread::spawn(move || start_and_wait(app));
        "starting".to_string()
    }

    /// Terminate the server and its whole process group so no Node child survives.
    /// Called when the last IDE webview closes and on app exit.
    pub fn stop(&self) {
        let (child, pgid) = {
            let mut inner = match self.inner.lock() {
                Ok(inner) => inner,
                Err(_) => return,
            };
            inner.phase = Phase::Stopped;
            (inner.child.take(), inner.pgid.take())
        };
        if let Some(pgid) = pgid {
            // PID-reuse guard: only signal a group that is still our serve-web.
            if process_is_serve_web(pgid) {
                unsafe {
                    libc::killpg(pgid, libc::SIGTERM);
                }
                let deadline = Instant::now() + TERM_GRACE;
                while Instant::now() < deadline {
                    // killpg(_, 0) probes existence without signalling.
                    if unsafe { libc::killpg(pgid, 0) } != 0 {
                        break;
                    }
                    thread::sleep(Duration::from_millis(50));
                }
                if unsafe { libc::killpg(pgid, 0) } == 0 {
                    unsafe {
                        libc::killpg(pgid, libc::SIGKILL);
                    }
                }
            }
        }
        if let Some(mut child) = child {
            let _ = child.wait();
        }
        let _ = std::fs::remove_file(self.pid_path());
    }

    /// Crash-only recovery: if a PID file survives from a previous run, an app
    /// crash left a serve-web orphan — kill its group before we start fresh.
    pub fn reclaim_orphan(&self) {
        let path = self.pid_path();
        if let Ok(text) = std::fs::read_to_string(&path) {
            if let Ok(pgid) = text.trim().parse::<i32>() {
                if process_is_serve_web(pgid) {
                    unsafe {
                        libc::killpg(pgid, libc::SIGKILL);
                    }
                }
            }
        }
        let _ = std::fs::remove_file(&path);
    }
}

/// Launch serve-web and poll until the port is up (or we time out / it dies).
/// Runs on its own thread; stores the child into managed state and spawns the
/// output-drain threads that also detect a crash.
fn start_and_wait(app: AppHandle) {
    let server = app.state::<VscodeServer>();

    let path = login_path();
    let code = match resolve_code(path.as_deref()) {
        Some(code) => code,
        None => {
            fail(
                &app,
                &server,
                "VS Code `code` CLI not found on your PATH. In VS Code, run \
                 “Shell Command: Install 'code' command in PATH”, then try again.",
            );
            return;
        }
    };

    let data_dir = server.data_dir();
    if let Err(err) = std::fs::create_dir_all(&data_dir) {
        fail(
            &app,
            &server,
            &format!("could not create server data dir: {err}"),
        );
        return;
    }
    seed_machine_settings(&data_dir);

    let mut cmd = Command::new(&code);
    cmd.arg("serve-web")
        .arg("--host")
        .arg(SERVE_WEB_HOST)
        .arg("--port")
        .arg(SERVE_WEB_PORT.to_string())
        .arg("--without-connection-token")
        .arg("--accept-server-license-terms")
        .arg("--server-data-dir")
        .arg(&data_dir)
        .arg("--disable-telemetry")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(path) = &path {
        // GUI-launched apps inherit launchd's minimal PATH, so hand serve-web the
        // login-shell PATH — its own Node subprocess resolution depends on it.
        cmd.env("PATH", path);
    }
    // New session => the child leads a fresh process group whose id equals its
    // pid; killing that group later reaps serve-web AND its Node children.
    unsafe {
        cmd.pre_exec(|| {
            if libc::setsid() == -1 {
                return Err(std::io::Error::last_os_error());
            }
            Ok(())
        });
    }

    let mut child = match cmd.spawn() {
        Ok(child) => child,
        Err(err) => {
            fail(
                &app,
                &server,
                &format!("failed to start VS Code server: {err}"),
            );
            return;
        }
    };
    let pgid = child.id() as i32;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    {
        let mut inner = match server.inner.lock() {
            Ok(inner) => inner,
            Err(_) => return,
        };
        // Stopped while we were spawning (last IDE tab closed): abandon this child.
        if inner.phase != Phase::Starting {
            drop(inner);
            unsafe {
                libc::killpg(pgid, libc::SIGKILL);
            }
            let _ = child.wait();
            return;
        }
        inner.child = Some(child);
        inner.pgid = Some(pgid);
    }
    write_pid_file(&server.pid_path(), pgid);

    // Drain both pipes so a full buffer never blocks the server. stdout also
    // detects an unexpected exit (crash) and marks the server dead.
    if let Some(stderr) = stderr {
        thread::spawn(move || drain(stderr));
    }
    if let Some(stdout) = stdout {
        let app = app.clone();
        thread::spawn(move || watch_for_exit(app, stdout));
    }

    // Readiness = the pinned port accepting connections. The port is fixed, so a
    // successful TCP connect is authoritative; no need to scrape the URL from logs.
    let deadline = Instant::now() + READY_TIMEOUT;
    loop {
        {
            let inner = match server.inner.lock() {
                Ok(inner) => inner,
                Err(_) => return,
            };
            // Resolved by stop() or the crash watcher; nothing left to do.
            if inner.phase != Phase::Starting {
                return;
            }
        }
        if tcp_ready() {
            if let Ok(mut inner) = server.inner.lock() {
                if inner.phase == Phase::Starting {
                    inner.phase = Phase::Ready;
                    drop(inner);
                    emit_status(&app, "ready", None);
                }
            }
            return;
        }
        if Instant::now() >= deadline {
            if let Ok(mut inner) = server.inner.lock() {
                if inner.phase == Phase::Starting {
                    inner.phase = Phase::Failed;
                }
            }
            emit_status(
                &app,
                "failed",
                Some("Timed out waiting for the VS Code server to start.".to_string()),
            );
            return;
        }
        thread::sleep(TCP_POLL_INTERVAL);
    }
}

/// Consume a child pipe to EOF, discarding output (keeps the pipe from filling).
fn drain<R: Read>(pipe: R) {
    let reader = BufReader::new(pipe);
    for _ in reader.lines().map_while(Result::ok) {}
}

/// Drain stdout to EOF; EOF means the process is exiting. Reap it and, if it died
/// while we thought it was starting or ready, mark the server failed and tell the
/// frontend so it can offer a restart.
fn watch_for_exit(app: AppHandle, stdout: ChildStdout) {
    let reader = BufReader::new(stdout);
    for _ in reader.lines().map_while(Result::ok) {}

    let server = app.state::<VscodeServer>();
    let was = {
        let mut inner = match server.inner.lock() {
            Ok(inner) => inner,
            Err(_) => return,
        };
        let was = inner.phase.clone();
        if was == Phase::Starting || was == Phase::Ready {
            inner.phase = Phase::Failed;
        }
        if let Some(mut child) = inner.child.take() {
            let _ = child.wait();
        }
        inner.pgid = None;
        was
    };
    let _ = std::fs::remove_file(server.pid_path());

    match was {
        Phase::Ready => emit_status(
            &app,
            "failed",
            Some("The VS Code server stopped unexpectedly.".to_string()),
        ),
        Phase::Starting => emit_status(
            &app,
            "failed",
            Some("The VS Code server exited before it was ready.".to_string()),
        ),
        // A clean stop() (or an already-recorded failure) needs no event.
        Phase::Stopped | Phase::Failed => {}
    }
}

/// Mark the server failed and notify the frontend. Only downgrades from an
/// in-flight `Starting`, so it never clobbers a concurrent clean stop.
fn fail(app: &AppHandle, server: &VscodeServer, message: &str) {
    if let Ok(mut inner) = server.inner.lock() {
        if inner.phase == Phase::Starting {
            inner.phase = Phase::Failed;
        }
    }
    emit_status(app, "failed", Some(message.to_string()));
}

fn emit_status(app: &AppHandle, status: &str, message: Option<String>) {
    let _ = app.emit(
        STATUS_EVENT,
        StatusPayload {
            status: status.to_string(),
            message,
        },
    );
}

fn tcp_ready() -> bool {
    let addr = SocketAddr::new(IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1)), SERVE_WEB_PORT);
    TcpStream::connect_timeout(&addr, TCP_CONNECT_TIMEOUT).is_ok()
}

/// The login shell's `PATH`. Finder-launched apps don't inherit it, so we ask the
/// user's shell for it and pass it to serve-web.
fn login_path() -> Option<String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| DEFAULT_SHELL.to_string());
    let output = Command::new(&shell)
        .args(["-l", "-c", "printf %s \"$PATH\""])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    (!path.is_empty()).then_some(path)
}

/// Resolve the absolute path to the `code` CLI via a login shell (so aliases and
/// PATH additions in the user's shell profile are honoured).
fn resolve_code(path: Option<&str>) -> Option<String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| DEFAULT_SHELL.to_string());
    let mut cmd = Command::new(&shell);
    cmd.args(["-l", "-c", "command -v code"]);
    if let Some(path) = path {
        cmd.env("PATH", path);
    }
    let output = cmd.output().ok()?;
    if !output.status.success() {
        return None;
    }
    let code = String::from_utf8_lossy(&output.stdout).trim().to_string();
    (!code.is_empty()).then_some(code)
}

/// True if the process (group leader) with `pid` is still one of our serve-web
/// processes — the PID-reuse guard before any group signal.
fn process_is_serve_web(pid: i32) -> bool {
    Command::new("ps")
        .args(["-p", &pid.to_string(), "-o", "command="])
        .output()
        .map(|out| String::from_utf8_lossy(&out.stdout).contains("serve-web"))
        .unwrap_or(false)
}

fn write_pid_file(path: &Path, pgid: i32) {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(path, pgid.to_string());
}

/// Machine-level defaults for the embedded editor, seeded before the server
/// starts. `serve-web` reads these from `<server-data-dir>/data/Machine/settings.json`
/// (user settings live in the browser and cannot be seeded from disk). They are
/// only first-load defaults — anything the user changes in the editor is stored
/// per-origin in the browser and overrides these, so re-writing them each launch
/// is safe.
const MACHINE_SETTINGS: &str = r#"{
  "workbench.colorTheme": "Default Dark Modern",
  "workbench.secondarySideBar.defaultVisibility": "hidden",
  "chat.disableAIFeatures": true,
  "chat.commandCenter.enabled": false,
  "chat.agent.enabled": false,
  "github.copilot.enable": { "*": false },
  "github.copilot.inlineSuggest.enable": false
}
"#;

/// Seed `<server-data-dir>/data/Machine/settings.json` so the embedded editor
/// opens dark and has Copilot/Chat and its side panel disabled. Workspace trust is
/// application-scoped and cannot be seeded here — it is disabled browser-side (see
/// `ide_webview`).
fn seed_machine_settings(data_dir: &Path) {
    let machine_dir = data_dir.join("data").join("Machine");
    if std::fs::create_dir_all(&machine_dir).is_ok() {
        let _ = std::fs::write(machine_dir.join("settings.json"), MACHINE_SETTINGS);
    }
}

/// Kick off (or join) the shared server. Returns the current status so a caller
/// that finds it already `ready` can proceed without waiting for an event.
#[tauri::command]
pub fn ensure_ide_server(app: AppHandle) -> Result<String, String> {
    let server = app.state::<VscodeServer>();
    Ok(server.ensure_started(&app))
}
