use std::io::{BufRead, BufReader, Read};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpStream};
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdout, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

/// Loopback host the embedded server binds to. Never exposed off-box.
pub const SERVE_WEB_HOST: &str = "127.0.0.1";

/// Fixed port for `code-server`. Pinned so every project's child webview shares
/// one stable origin — VS Code keys its per-folder state by origin.
pub const SERVE_WEB_PORT: u16 = 51851;

/// Port for a dev build (`ANTANI_DEV`, separate identifier) so it can run beside
/// the installed release — which owns `SERVE_WEB_PORT` — without the two
/// code-servers colliding on the same port.
const SERVE_WEB_PORT_DEV: u16 = 51852;

/// Subfolder (under the app-data dir) for code-server's user data.
const SERVER_DATA_DIR: &str = "vscode-server-data";

/// Subfolder (under the app-data dir) for the isolated extensions store.
const EXTENSIONS_DIR: &str = "extensions";

/// Filename for user-imported VS Code settings, stored in the app-data dir and
/// merged into User settings on every server start.
const IMPORTED_SETTINGS_FILE: &str = "imported-user-settings.json";

/// Crash-only fallback: the server's process-group id, so an orphan left by an
/// app crash can be reclaimed on next launch. The normal teardown path is `stop`.
const PID_FILE: &str = "vscode-server.pid";

/// Subfolder (under the app-data dir) holding one Unix socket per open project,
/// each listened on by the bundled `antani-diff-bridge` extension inside that
/// project's own extension-host process. code-server spawns a separate
/// extension host per open workspace folder, so a single shared socket path
/// would race between them (only one host could bind it); keying the socket
/// name off a hash of the project path lets Rust and the extension agree on
/// the right one independently, with no IPC needed to hand out the name.
const BRIDGE_SOCKET_DIR: &str = "diff-bridge-sockets";

/// Bundled VS Code extension (see `vscode-extension/`) reinstalled with
/// `--force` on every server launch, so it self-heals if the user removes it.
const BRIDGE_EXTENSION_VSIX: &str = "antani-diff-bridge.vsix";

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
    start_generation: u64,
    /// The serve-web child, kept so we can reap it. `None` once reaped.
    child: Option<Child>,
    /// Process-group id (== child pid, thanks to `setsid`) for group-kill.
    pgid: Option<i32>,
    /// Rolling tail of stderr output — last N lines, used in failure messages.
    stderr_tail: Arc<Mutex<Vec<String>>>,
}

/// Managed Tauri state for the lazily-started, shared `code serve-web` process.
pub struct VscodeServer {
    inner: Mutex<Inner>,
    app_data_dir: PathBuf,
    port: u16,
}

impl VscodeServer {
    pub fn new(app_data_dir: PathBuf) -> Self {
        let port = if std::env::var_os("ANTANI_DEV").is_some() {
            SERVE_WEB_PORT_DEV
        } else {
            SERVE_WEB_PORT
        };
        Self {
            inner: Mutex::new(Inner {
                phase: Phase::Stopped,
                start_generation: 0,
                child: None,
                pgid: None,
                stderr_tail: Arc::new(Mutex::new(Vec::new())),
            }),
            app_data_dir,
            port,
        }
    }

    fn pid_path(&self) -> PathBuf {
        self.app_data_dir.join(PID_FILE)
    }

    fn data_dir(&self) -> PathBuf {
        self.app_data_dir.join(SERVER_DATA_DIR)
    }

    fn extensions_dir(&self) -> PathBuf {
        self.app_data_dir.join(EXTENSIONS_DIR)
    }

    fn imported_settings_path(&self) -> PathBuf {
        self.app_data_dir.join(IMPORTED_SETTINGS_FILE)
    }

    fn bridge_socket_dir(&self) -> PathBuf {
        self.app_data_dir.join(BRIDGE_SOCKET_DIR)
    }

    /// Same hash the extension computes from its workspace folder path
    /// (`vscode-extension/extension.js`) — see `BRIDGE_SOCKET_DIR`.
    pub(crate) fn bridge_socket_path_for(&self, project_path: &str) -> PathBuf {
        self.bridge_socket_dir()
            .join(format!("{:08x}.sock", fnv1a(project_path.as_bytes())))
    }

    /// The port to load once the server is up, or `None` if it is not ready.
    pub fn ready_port(&self) -> Option<u16> {
        let inner = self.inner.lock().ok()?;
        (inner.phase == Phase::Ready).then_some(self.port)
    }

    /// Ensure the shared server is starting or up. Idempotent: concurrent callers
    /// see `Starting`/`Ready` and return without spawning a second process. The
    /// actual launch + readiness poll runs on a background thread so this returns
    /// immediately; progress is delivered via the `ide-server-status` event, and
    /// the returned status lets a caller that finds it already `Ready` proceed at
    /// once (it would otherwise miss the one-shot event).
    pub fn ensure_started(&self, app: &AppHandle) -> String {
        let generation = {
            let mut inner = match self.inner.lock() {
                Ok(inner) => inner,
                Err(_) => return "failed".to_string(),
            };
            match inner.phase {
                Phase::Ready => return "ready".to_string(),
                Phase::Starting => return "starting".to_string(),
                Phase::Stopped | Phase::Failed => inner.phase = Phase::Starting,
            }
            inner.start_generation = inner.start_generation.wrapping_add(1);
            inner.start_generation
        };
        emit_status(app, "starting", None);
        let app = app.clone();
        thread::spawn(move || start_and_wait(app, generation));
        "starting".to_string()
    }

    /// Terminate the server and its whole process group so no Node child survives.
    /// Called when the last IDE webview closes and on app exit.
    pub fn stop(&self) {
        self.stop_inner();
    }

    pub fn stop_for_maintenance(&self) -> bool {
        self.stop_inner()
    }

    fn stop_inner(&self) -> bool {
        let (was_active, child, pgid) = {
            let mut inner = match self.inner.lock() {
                Ok(inner) => inner,
                Err(_) => return false,
            };
            let was_active = matches!(inner.phase, Phase::Starting | Phase::Ready);
            inner.phase = Phase::Stopped;
            inner.start_generation = inner.start_generation.wrapping_add(1);
            (was_active, inner.child.take(), inner.pgid.take())
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
        let _ = std::fs::remove_dir_all(self.bridge_socket_dir());
        was_active
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

/// Launch code-server and poll until the port is up (or we time out / it dies).
/// Runs on its own thread; stores the child into managed state and spawns the
/// output-drain threads that also detect a crash.
fn start_and_wait(app: AppHandle, generation: u64) {
    let server = app.state::<VscodeServer>();
    let maintenance = app.state::<crate::backup::BackupMaintenance>();
    let _maintenance_guard = match maintenance.lock() {
        Ok(guard) => guard,
        Err(error) => {
            fail(&app, &server, generation, &error);
            return;
        }
    };
    let is_current = server
        .inner
        .lock()
        .is_ok_and(|inner| inner.phase == Phase::Starting && inner.start_generation == generation);
    if !is_current {
        return;
    }

    let path = login_path();
    let code_server = match resolve_code_server(path.as_deref()) {
        Some(p) => p,
        None => {
            fail(
                &app,
                &server,
                generation,
                "`code-server` not found on your PATH. Install it with:\n  brew install code-server\nor see https://coder.com/docs/code-server/install",
            );
            return;
        }
    };

    let data_dir = server.data_dir();
    let ext_dir = server.extensions_dir();
    let imported_settings = server.imported_settings_path();
    let bridge_socket_dir = server.bridge_socket_dir();

    for dir in [&data_dir, &ext_dir, &bridge_socket_dir] {
        if let Err(err) = std::fs::create_dir_all(dir) {
            fail(
                &app,
                &server,
                generation,
                &format!("could not create dir {}: {err}", dir.display()),
            );
            return;
        }
    }
    seed_user_settings(&data_dir, &imported_settings);
    install_bridge_extension(&app, &code_server, &data_dir, &ext_dir, path.as_deref());

    let mut cmd = Command::new(&code_server);
    cmd.arg("--host")
        .arg(SERVE_WEB_HOST)
        .arg("--port")
        .arg(server.port.to_string())
        .arg("--auth")
        .arg("none")
        .arg("--user-data-dir")
        .arg(&data_dir)
        .arg("--extensions-dir")
        .arg(&ext_dir)
        .arg("--disable-telemetry")
        .arg("--disable-update-check")
        .env("ANTANI_BRIDGE_SOCKET_DIR", &bridge_socket_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(path) = &path {
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
                generation,
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
        if inner.phase != Phase::Starting || inner.start_generation != generation {
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
    // Reset the tail buffer for this fresh run (outside the lock above).
    if let Ok(inner) = server.inner.lock() {
        if let Ok(mut tail) = inner.stderr_tail.lock() {
            tail.clear();
        }
    }
    write_pid_file(&server.pid_path(), pgid);

    // Capture stderr into a rolling tail so crash messages are visible in the UI.
    let stderr_tail = { server.inner.lock().ok().map(|g| Arc::clone(&g.stderr_tail)) };
    if let (Some(stderr_pipe), Some(tail)) = (stderr, stderr_tail) {
        thread::spawn(move || capture_stderr(stderr_pipe, tail));
    }
    if let Some(stdout) = stdout {
        let app = app.clone();
        thread::spawn(move || watch_for_exit(app, stdout, generation, pgid));
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
            if inner.phase != Phase::Starting || inner.start_generation != generation {
                return;
            }
        }
        if tcp_ready(server.port) {
            if let Ok(mut inner) = server.inner.lock() {
                if inner.phase == Phase::Starting && inner.start_generation == generation {
                    inner.phase = Phase::Ready;
                    drop(inner);
                    emit_status(&app, "ready", None);
                }
            }
            return;
        }
        if Instant::now() >= deadline {
            let timed_out = if let Ok(mut inner) = server.inner.lock() {
                if inner.phase == Phase::Starting && inner.start_generation == generation {
                    inner.phase = Phase::Failed;
                    true
                } else {
                    false
                }
            } else {
                false
            };
            if timed_out {
                emit_status(
                    &app,
                    "failed",
                    Some("Timed out waiting for the VS Code server to start.".to_string()),
                );
            }
            return;
        }
        thread::sleep(TCP_POLL_INTERVAL);
    }
}

/// Capture stderr into a rolling tail (last 20 lines), replacing the silent drain.
fn capture_stderr<R: Read>(pipe: R, tail: Arc<Mutex<Vec<String>>>) {
    const MAX_LINES: usize = 20;
    let reader = BufReader::new(pipe);
    for line in reader.lines().map_while(Result::ok) {
        if let Ok(mut t) = tail.lock() {
            t.push(line);
            if t.len() > MAX_LINES {
                t.remove(0);
            }
        }
    }
}

/// Drain stdout to EOF; EOF means the process is exiting. Reap it and, if it died
/// while we thought it was starting or ready, mark the server failed and tell the
/// frontend so it can offer a restart, including the last stderr lines.
fn watch_for_exit(app: AppHandle, stdout: ChildStdout, generation: u64, pgid: i32) {
    let reader = BufReader::new(stdout);
    for _ in reader.lines().map_while(Result::ok) {}

    let server = app.state::<VscodeServer>();
    let (was, child, tail_lines) = {
        let mut inner = match server.inner.lock() {
            Ok(inner) => inner,
            Err(_) => return,
        };
        if inner.start_generation != generation || inner.pgid != Some(pgid) {
            return;
        }
        let was = inner.phase.clone();
        if was == Phase::Starting || was == Phase::Ready {
            inner.phase = Phase::Failed;
        }
        let child = inner.child.take();
        inner.pgid = None;
        let tail = inner
            .stderr_tail
            .lock()
            .ok()
            .map(|t| t.join("\n"))
            .unwrap_or_default();
        (was, child, tail)
    };
    if let Some(mut child) = child {
        let _ = child.wait();
    }
    let _ = std::fs::remove_file(server.pid_path());

    let detail = |prefix: &str| -> String {
        if tail_lines.trim().is_empty() {
            prefix.to_string()
        } else {
            format!("{prefix}\n\n{tail_lines}")
        }
    };

    match was {
        Phase::Ready => emit_status(
            &app,
            "failed",
            Some(detail("The VS Code server stopped unexpectedly.")),
        ),
        Phase::Starting => emit_status(
            &app,
            "failed",
            Some(detail("The VS Code server exited before it was ready.")),
        ),
        Phase::Stopped | Phase::Failed => {}
    }
}

/// Mark the server failed and notify the frontend. Only downgrades from an
/// in-flight `Starting`, so it never clobbers a concurrent clean stop.
fn fail(app: &AppHandle, server: &VscodeServer, generation: u64, message: &str) {
    let failed = if let Ok(mut inner) = server.inner.lock() {
        if inner.phase == Phase::Starting && inner.start_generation == generation {
            inner.phase = Phase::Failed;
            true
        } else {
            false
        }
    } else {
        false
    };
    if failed {
        emit_status(app, "failed", Some(message.to_string()));
    }
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

/// Reinstall the bundled diff-bridge extension via code-server's own
/// `--install-extension --force`, rather than hand-writing its internal
/// `extensions.json`/`.obsolete` bookkeeping (see `sync_extensions_manifest`,
/// which already shows how fragile that format is to reproduce by hand).
/// Runs before every server launch so it self-heals if the user deletes the
/// extension — a short-lived subprocess, not part of the running server.
fn install_bridge_extension(
    app: &AppHandle,
    code_server: &str,
    data_dir: &Path,
    ext_dir: &Path,
    path_env: Option<&str>,
) {
    let Ok(resource_dir) = app.path().resource_dir() else {
        eprintln!("antani: could not resolve resource dir, skipping diff-bridge install");
        return;
    };
    let vsix = resource_dir
        .join("vscode-extension")
        .join(BRIDGE_EXTENSION_VSIX);
    if !vsix.is_file() {
        eprintln!(
            "antani: bundled diff-bridge extension not found at {}",
            vsix.display()
        );
        return;
    }

    let mut cmd = Command::new(code_server);
    cmd.arg("--user-data-dir")
        .arg(data_dir)
        .arg("--extensions-dir")
        .arg(ext_dir)
        .arg("--install-extension")
        .arg(&vsix)
        .arg("--force")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    if let Some(path) = path_env {
        cmd.env("PATH", path);
    }
    match cmd.output() {
        Ok(out) if !out.status.success() => eprintln!(
            "antani: failed to install diff-bridge extension: {}",
            String::from_utf8_lossy(&out.stderr)
        ),
        Err(err) => eprintln!("antani: failed to run code-server --install-extension: {err}"),
        _ => {}
    }
}

/// FNV-1a, 32-bit. Deterministic, dependency-free, and mirrored byte-for-byte
/// in `vscode-extension/extension.js` — see `BRIDGE_SOCKET_DIR`.
fn fnv1a(bytes: &[u8]) -> u32 {
    let mut hash: u32 = 0x811c9dc5;
    for &b in bytes {
        hash ^= b as u32;
        hash = hash.wrapping_mul(0x0100_0193);
    }
    hash
}

fn tcp_ready(port: u16) -> bool {
    let addr = SocketAddr::new(IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1)), port);
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

/// Resolve the absolute path to the `code-server` binary via a login shell.
fn resolve_code_server(path: Option<&str>) -> Option<String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| DEFAULT_SHELL.to_string());
    let mut cmd = Command::new(&shell);
    cmd.args(["-l", "-c", "command -v code-server"]);
    if let Some(path) = path {
        cmd.env("PATH", path);
    }
    let output = cmd.output().ok()?;
    if !output.status.success() {
        return None;
    }
    let bin = String::from_utf8_lossy(&output.stdout).trim().to_string();
    (!bin.is_empty()).then_some(bin)
}

/// True if the process with `pid` is our code-server — PID-reuse guard.
fn process_is_serve_web(pid: i32) -> bool {
    Command::new("ps")
        .args(["-p", &pid.to_string(), "-o", "command="])
        .output()
        .map(|out| String::from_utf8_lossy(&out.stdout).contains("code-server"))
        .unwrap_or(false)
}

fn write_pid_file(path: &Path, pgid: i32) {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(path, pgid.to_string());
}

/// Default user settings for the embedded editor. code-server reads these from
/// `<user-data-dir>/User/settings.json` as a plain file — no browser store needed.
/// Written once before the server starts; user changes made inside the editor are
/// persisted to the same file and survive restarts.
const MACHINE_SETTINGS: &str = r#"{
  "workbench.colorTheme": "Default Dark+",
  "workbench.iconTheme": "material-icon-theme",
  "workbench.startupEditor": "none",
  "workbench.secondarySideBar.defaultVisibility": "hidden",
  "workbench.editor.dragToOpenWindow": false,
  "window.commandCenter": false,
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "biomejs.biome",
  "editor.accessibilitySupport": "off",
  "editor.codeActionsOnSave": {
    "source.organizeImports.biome": "explicit",
    "source.removeUnusedImports": "explicit"
  },
  "[javascript]": { "editor.defaultFormatter": "biomejs.biome" },
  "[typescript]": { "editor.defaultFormatter": "biomejs.biome", "editor.formatOnSave": true },
  "[typescriptreact]": { "editor.defaultFormatter": "biomejs.biome" },
  "[markdown]": { "editor.defaultFormatter": "DavidAnson.vscode-markdownlint" },
  "diffEditor.ignoreTrimWhitespace": false,
  "javascript.updateImportsOnFileMove.enabled": "always",
  "typescript.updateImportsOnFileMove.enabled": "always",
  "typescript.preferences.importModuleSpecifier": "relative",
  "typescript.preferences.quoteStyle": "single",
  "git.suggestSmartCommit": false,
  "explorer.fileNesting.patterns": {
    "*.ts": "${capture}.js",
    "*.js": "${capture}.js.map, ${capture}.min.js, ${capture}.d.ts",
    "*.jsx": "${capture}.js",
    "*.tsx": "${capture}.ts",
    "tsconfig.json": "tsconfig.*.json",
    "package.json": "package-lock.json, yarn.lock, pnpm-lock.yaml, bun.lockb, bun.lock"
  },
  "makefile.configureOnOpen": false,
  "redhat.telemetry.enabled": false,
  "gitlens.codeLens.enabled": false,
  "terminal.integrated.suggest.enabled": false,
  "chat.disableAIFeatures": true,
  "chat.commandCenter.enabled": false,
  "chat.agent.enabled": false,
  "github.copilot.enable": { "*": false },
  "github.copilot.inlineSuggest.enable": false,
  "security.workspace.trust.enabled": false
}
"#;

/// Write `<user-data-dir>/User/settings.json` for code-server (plain file,
/// not a browser store). Only written once — if the file already exists the
/// user may have customised it inside the editor, so we leave it alone.
/// Imported settings (copied from desktop VS Code) are merged in on first write.
fn seed_user_settings(data_dir: &Path, imported_settings_path: &Path) {
    let settings_path = data_dir.join("User").join("settings.json");

    if !settings_path.exists() {
        // Fresh install: start from defaults, then layer imported settings on top.
        merge_imported_settings(data_dir, imported_settings_path);
        return;
    }

    // File already exists — only fix keys that are known-broken defaults.
    // "Dark+" was the old name; code-server only ships "Default Dark+".
    let Some(mut existing) = std::fs::read_to_string(&settings_path)
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
    else {
        return;
    };
    if existing
        .get("workbench.colorTheme")
        .and_then(|v| v.as_str())
        == Some("Dark+")
    {
        if let Some(obj) = existing.as_object_mut() {
            obj.insert(
                "workbench.colorTheme".to_string(),
                serde_json::json!("Default Dark+"),
            );
        }
    }

    // Detaching an editor into a new window uses `window.open()`, which a child
    // WKWebView can't honor; force it off so dragging a tab isn't a dead end.
    if let Some(obj) = existing.as_object_mut() {
        obj.insert(
            "workbench.editor.dragToOpenWindow".to_string(),
            serde_json::json!(false),
        );
    }

    if let Ok(text) = serde_json::to_string_pretty(&existing) {
        let _ = std::fs::write(&settings_path, text);
    }
}

fn merge_overrides_from_file(base: &mut serde_json::Value, overrides_path: &Path) {
    if let Ok(text) = std::fs::read_to_string(overrides_path) {
        if let Ok(overrides) = serde_json::from_str::<serde_json::Value>(&text) {
            if let (Some(base_obj), Some(overrides_obj)) =
                (base.as_object_mut(), overrides.as_object())
            {
                for (k, v) in overrides_obj {
                    base_obj.insert(k.clone(), v.clone());
                }
            }
        }
    }
}

/// Merge freshly-imported desktop VS Code settings into the live
/// `User/settings.json`, even if that file already exists (e.g. the embedded
/// IDE was opened before the user ran Import). Without this, imported
/// settings only ever land in the fresh-install path handled above and are
/// silently orphaned otherwise.
fn merge_imported_settings(data_dir: &Path, imported_settings_path: &Path) {
    let user_dir = data_dir.join("User");
    if std::fs::create_dir_all(&user_dir).is_err() {
        return;
    }
    let settings_path = user_dir.join("settings.json");

    let mut existing: serde_json::Value = if settings_path.exists() {
        std::fs::read_to_string(&settings_path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or(serde_json::json!({}))
    } else {
        serde_json::from_str(MACHINE_SETTINGS).unwrap_or(serde_json::json!({}))
    };

    merge_overrides_from_file(&mut existing, imported_settings_path);

    if let Ok(text) = serde_json::to_string_pretty(&existing) {
        let _ = std::fs::write(&settings_path, text);
    }
}

/// Register copied extension folders in the embedded server's own
/// `extensions.json`/`.obsolete` bookkeeping. Copying the folders alone isn't
/// enough: code-server's extension scanner only lists what's recorded in
/// `extensions.json`, and treats any folder named in `.obsolete` as
/// uninstalled regardless of whether it's on disk — so a bare folder copy
/// shows up as "0 installed" in the Extensions view.
fn sync_extensions_manifest(vscode_ext_dir: &Path, dest_ext_dir: &Path) {
    let src_manifest_path = vscode_ext_dir.join("extensions.json");
    let Ok(src_text) = std::fs::read_to_string(&src_manifest_path) else {
        eprintln!(
            "antani: no extensions.json at {}, skipping manifest sync",
            src_manifest_path.display()
        );
        return;
    };
    let Ok(serde_json::Value::Array(src_entries)) = serde_json::from_str(&src_text) else {
        eprintln!(
            "antani: failed to parse {} as a JSON array, skipping manifest sync",
            src_manifest_path.display()
        );
        return;
    };

    let dest_manifest_path = dest_ext_dir.join("extensions.json");
    let mut dest_entries: Vec<serde_json::Value> = std::fs::read_to_string(&dest_manifest_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    let existing_ids: std::collections::HashSet<String> = dest_entries
        .iter()
        .filter_map(|e| e.get("identifier")?.get("id")?.as_str().map(String::from))
        .collect();

    let mut installed_rel_locations = Vec::new();
    for mut entry in src_entries {
        let Some(rel) = entry
            .get("relativeLocation")
            .and_then(|v| v.as_str())
            .map(String::from)
        else {
            continue;
        };
        if !dest_ext_dir.join(&rel).is_dir() {
            continue;
        }
        installed_rel_locations.push(rel.clone());

        let id = entry
            .get("identifier")
            .and_then(|i| i.get("id"))
            .and_then(|v| v.as_str())
            .map(String::from);
        if id.is_some_and(|id| existing_ids.contains(&id)) {
            continue;
        }
        if let Some(location) = entry.get_mut("location").and_then(|l| l.as_object_mut()) {
            location.insert(
                "path".to_string(),
                serde_json::json!(dest_ext_dir.join(&rel).to_string_lossy()),
            );
        }
        dest_entries.push(entry);
    }

    if let Ok(text) = serde_json::to_string(&dest_entries) {
        let _ = std::fs::write(&dest_manifest_path, text);
    }

    let obsolete_path = dest_ext_dir.join(".obsolete");
    if let Ok(text) = std::fs::read_to_string(&obsolete_path) {
        if let Ok(serde_json::Value::Object(mut obj)) = serde_json::from_str(&text) {
            for rel in &installed_rel_locations {
                obj.remove(rel);
            }
            if let Ok(text) = serde_json::to_string(&serde_json::Value::Object(obj)) {
                let _ = std::fs::write(&obsolete_path, text);
            }
        }
    }
}

#[tauri::command]
pub fn import_from_vscode(app: AppHandle) -> Result<String, String> {
    let maintenance = app.state::<crate::backup::BackupMaintenance>();
    let _maintenance_guard = maintenance.lock()?;
    let server = app.state::<VscodeServer>();
    let home = std::env::var("HOME").map_err(|_| "HOME not set".to_string())?;

    let vscode_ext_dir = PathBuf::from(&home).join(".vscode").join("extensions");
    let dest_ext_dir = server.extensions_dir();
    if let Err(e) = std::fs::create_dir_all(&dest_ext_dir) {
        return Err(format!("could not create extensions dir: {e}"));
    }

    let mut ext_copied = 0usize;
    let mut ext_skipped = 0usize;
    if vscode_ext_dir.is_dir() {
        let entries = std::fs::read_dir(&vscode_ext_dir).map_err(|e| e.to_string())?;
        for entry in entries.filter_map(|e| e.ok()) {
            let src = entry.path();
            if !src.is_dir() {
                continue;
            }
            let dest = dest_ext_dir.join(entry.file_name());
            if dest.exists() {
                ext_skipped += 1;
                continue;
            }
            copy_dir_recursive(&src, &dest).map_err(|e| format!("copy {}: {e}", src.display()))?;
            ext_copied += 1;
        }
        sync_extensions_manifest(&vscode_ext_dir, &dest_ext_dir);
    }

    let src_settings = PathBuf::from(&home)
        .join("Library")
        .join("Application Support")
        .join("Code")
        .join("User")
        .join("settings.json");
    let settings_imported = if src_settings.is_file() {
        std::fs::copy(&src_settings, server.imported_settings_path()).map_err(|e| e.to_string())?;
        merge_imported_settings(&server.data_dir(), &server.imported_settings_path());
        true
    } else {
        false
    };

    server.stop();

    let mut parts = Vec::new();
    if ext_copied > 0 || ext_skipped > 0 {
        let mut s = format!(
            "{ext_copied} extension{} copied",
            if ext_copied == 1 { "" } else { "s" }
        );
        if ext_skipped > 0 {
            s.push_str(&format!(", {ext_skipped} already present"));
        }
        parts.push(s);
    } else {
        parts.push("no VS Code extensions found".to_string());
    }
    parts.push(if settings_imported {
        "settings imported".to_string()
    } else {
        "no settings.json found".to_string()
    });

    Ok(parts.join("; "))
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let target = dst.join(entry.file_name());
        let ft = entry.file_type()?;
        if ft.is_dir() {
            copy_dir_recursive(&entry.path(), &target)?;
        } else {
            std::fs::copy(entry.path(), &target)?;
        }
    }
    Ok(())
}

/// Kick off (or join) the shared server. Returns the current status so a caller
/// that finds it already `ready` can proceed without waiting for an event.
#[tauri::command]
pub fn ensure_ide_server(app: AppHandle) -> Result<String, String> {
    let server = app.state::<VscodeServer>();
    Ok(server.ensure_started(&app))
}
