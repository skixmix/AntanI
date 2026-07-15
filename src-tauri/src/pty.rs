use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use tauri::ipc::{Channel, Response};
use tauri::{AppHandle, Emitter, State};

/// Read chunk size for draining PTY output. 16 KiB matches typical pipe buffers.
const READ_BUF_SIZE: usize = 16 * 1024;

/// Fallback when neither `$SHELL` nor the passwd database yields a login shell.
const DEFAULT_SHELL: &str = "/bin/zsh";

/// Frontend event fired once when a PTY's process exits (normal exit or kill).
const PTY_EXIT_EVENT: &str = "pty-exit";

/// Frontend event fired whenever a PTY's foreground process group flips
/// between the login shell itself and a job it launched (e.g. `bun run dev`).
const PTY_RUNNING_EVENT: &str = "pty-running-changed";

/// How often to poll the pty's foreground process group. This only drives a
/// UI dot, not anything latency-sensitive, so a coarse interval keeps the
/// poll thread's cost negligible.
const RUNNING_POLL_INTERVAL: Duration = Duration::from_millis(300);

/// The handles we keep for a live PTY so we can write to it, resize it, and kill
/// it. The reader thread owns the read side and the child separately, so it is
/// not represented here.
struct PtySession {
    writer: Mutex<Box<dyn Write + Send>>,
    master: Mutex<Box<dyn MasterPty + Send>>,
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
    /// Signals the foreground-process-group poll thread to stop. Set on drop
    /// so a closed tab's poll thread exits within one `RUNNING_POLL_INTERVAL`
    /// tick instead of lingering on a stale fd.
    stop_running_poll: Arc<AtomicBool>,
}

impl Drop for PtySession {
    fn drop(&mut self) {
        self.stop_running_poll.store(true, Ordering::Relaxed);
        // Killing the shell and then dropping the master (which closes the PTY)
        // makes the kernel send SIGHUP to the whole foreground process group, so
        // children such as `htop` die too. This is the zero-orphan guarantee for
        // tab close, app exit, and any unexpected drop.
        if let Ok(mut killer) = self.killer.lock() {
            let _ = killer.kill();
        }
    }
}

/// Managed Tauri state: every live PTY keyed by its frontend tab id.
#[derive(Default)]
pub struct PtyManager {
    sessions: Mutex<HashMap<String, PtySession>>,
}

impl PtyManager {
    /// Terminate every live PTY. Called on app exit so no shell survives us.
    pub fn kill_all(&self) {
        if let Ok(mut sessions) = self.sessions.lock() {
            sessions.clear();
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PtyExit {
    tab_id: String,
    exit_code: u32,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PtyRunning {
    tab_id: String,
    running: bool,
}

/// Resolve the user's login shell. `$SHELL` is unset for apps launched from
/// Finder (they inherit launchd's environment, not a shell's), so fall back to
/// the passwd database before the hard-coded default.
fn login_shell() -> String {
    if let Ok(shell) = std::env::var("SHELL") {
        if !shell.is_empty() {
            return shell;
        }
    }
    // SAFETY: getpwuid returns a pointer into a static buffer owned by libc; we
    // only read it synchronously here and copy the string out before returning.
    unsafe {
        let pw = libc::getpwuid(libc::getuid());
        if !pw.is_null() {
            let shell_ptr = (*pw).pw_shell;
            if !shell_ptr.is_null() {
                if let Ok(shell) = std::ffi::CStr::from_ptr(shell_ptr).to_str() {
                    if !shell.is_empty() {
                        return shell.to_string();
                    }
                }
            }
        }
    }
    DEFAULT_SHELL.to_string()
}

/// Options for spawning a PTY, sent as one object from the frontend (grouped so
/// the command stays within a sane argument count).
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnOptions {
    tab_id: String,
    cwd: String,
    cols: u16,
    rows: u16,
    startup_command: Option<String>,
}

/// Spawn a login shell in `cwd`, wired to a new PTY. Output is streamed to the
/// frontend over `on_data`; `startup_command`, if given, is typed into the shell
/// (used by agent tab types to launch their CLI).
#[tauri::command]
pub fn pty_spawn(
    manager: State<PtyManager>,
    app: AppHandle,
    options: SpawnOptions,
    on_data: Channel<Response>,
) -> Result<(), String> {
    let SpawnOptions {
        tab_id,
        cwd,
        cols,
        rows,
        startup_command,
    } = options;

    let pty_system = native_pty_system();
    let size = PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    };
    let pair = pty_system.openpty(size).map_err(|e| e.to_string())?;

    let mut cmd = CommandBuilder::new(login_shell());
    cmd.arg("-l");
    cmd.cwd(&cwd);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    if std::env::var_os("LANG").is_none() {
        cmd.env("LANG", "en_US.UTF-8");
    }

    let mut child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    // The slave fd must be dropped after spawn, otherwise the shell never sees
    // EOF on the PTY and the reader thread would hang forever on exit.
    drop(pair.slave);

    let killer = child.clone_killer();
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let mut writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    // Captured before the master moves into the session below. The shell is
    // its own session/process-group leader when spawned into a fresh pty, so
    // its pid doubles as its pgid — the baseline "nothing else has the
    // foreground" value.
    let shell_pgid = child.process_id().map(|pid| pid as libc::pid_t);
    let running_fd = pair.master.as_raw_fd();

    if let Some(command) = startup_command {
        if !command.trim().is_empty() {
            writer
                .write_all(format!("{command}\n").as_bytes())
                .map_err(|e| e.to_string())?;
        }
    }

    let exit_tab_id = tab_id.clone();
    let exit_app = app.clone();
    thread::spawn(move || {
        let mut buf = [0u8; READ_BUF_SIZE];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if on_data.send(Response::new(buf[..n].to_vec())).is_err() {
                        break;
                    }
                }
            }
        }
        let exit_code = child.wait().map(|status| status.exit_code()).unwrap_or(0);
        let _ = exit_app.emit(
            PTY_EXIT_EVENT,
            PtyExit {
                tab_id: exit_tab_id,
                exit_code,
            },
        );
    });

    let stop_running_poll = Arc::new(AtomicBool::new(false));
    if let (Some(fd), Some(shell_pgid)) = (running_fd, shell_pgid) {
        let stop = stop_running_poll.clone();
        let app = app.clone();
        let poll_tab_id = tab_id.clone();
        thread::spawn(move || {
            let mut last_running = false;
            while !stop.load(Ordering::Relaxed) {
                thread::sleep(RUNNING_POLL_INTERVAL);
                if stop.load(Ordering::Relaxed) {
                    break;
                }
                // SAFETY: fd stays open for the pty's lifetime, which this
                // thread is bounded by via `stop` (set on PtySession::drop,
                // itself set before the master is dropped and the fd closed).
                let pgrp = unsafe { libc::tcgetpgrp(fd) };
                if pgrp <= 0 {
                    break;
                }
                let running = pgrp != shell_pgid;
                if running != last_running {
                    last_running = running;
                    let _ = app.emit(
                        PTY_RUNNING_EVENT,
                        PtyRunning {
                            tab_id: poll_tab_id.clone(),
                            running,
                        },
                    );
                }
            }
        });
    }

    let session = PtySession {
        writer: Mutex::new(writer),
        master: Mutex::new(pair.master),
        killer: Mutex::new(killer),
        stop_running_poll,
    };
    manager
        .sessions
        .lock()
        .map_err(|e| e.to_string())?
        .insert(tab_id, session);
    Ok(())
}

#[tauri::command]
pub fn pty_write(manager: State<PtyManager>, tab_id: String, data: String) -> Result<(), String> {
    let sessions = manager.sessions.lock().map_err(|e| e.to_string())?;
    let session = sessions
        .get(&tab_id)
        .ok_or_else(|| format!("no pty for tab {tab_id}"))?;
    let mut writer = session.writer.lock().map_err(|e| e.to_string())?;
    writer.write_all(data.as_bytes()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_resize(
    manager: State<PtyManager>,
    tab_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let sessions = manager.sessions.lock().map_err(|e| e.to_string())?;
    let session = sessions
        .get(&tab_id)
        .ok_or_else(|| format!("no pty for tab {tab_id}"))?;
    let master = session.master.lock().map_err(|e| e.to_string())?;
    master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_kill(manager: State<PtyManager>, tab_id: String) -> Result<(), String> {
    // Removing the session drops it; the Drop impl kills the child and closes
    // the master. A missing tab id is a no-op (already gone).
    manager
        .sessions
        .lock()
        .map_err(|e| e.to_string())?
        .remove(&tab_id);
    Ok(())
}
