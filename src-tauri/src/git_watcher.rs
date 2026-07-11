use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::git::{parse_porcelain_status, run_git, status_args, GitStatus};

/// How often the background watcher re-checks `git status` for a watched project.
const POLL_INTERVAL: Duration = Duration::from_secs(2);

/// Frontend event fired whenever a watched project's git status changes.
const GIT_STATUS_CHANGED_EVENT: &str = "git-status-changed";

struct WatcherHandle {
    stop: Arc<AtomicBool>,
}

/// Managed Tauri state: one background poller per watched project, keyed by
/// project id. Mirrors `PtyManager`'s per-key lifecycle (start on demand, stop
/// removes and signals the thread, `stop_all` sweeps everything on app exit).
#[derive(Default)]
pub struct GitWatcherManager {
    watchers: Mutex<HashMap<String, WatcherHandle>>,
}

impl GitWatcherManager {
    pub fn stop_all(&self) {
        if let Ok(mut watchers) = self.watchers.lock() {
            for (_, handle) in watchers.drain() {
                handle.stop.store(true, Ordering::Relaxed);
            }
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitStatusChanged {
    project_id: String,
    status: GitStatus,
}

#[tauri::command]
pub fn git_watch_start(
    manager: State<GitWatcherManager>,
    app: AppHandle,
    project_id: String,
    project_path: String,
) -> Result<(), String> {
    let mut watchers = manager.watchers.lock().map_err(|e| e.to_string())?;
    if watchers.contains_key(&project_id) {
        return Ok(());
    }

    let stop = Arc::new(AtomicBool::new(false));
    let thread_stop = stop.clone();
    let thread_project_id = project_id.clone();
    thread::spawn(move || {
        let mut last: Option<String> = None;
        while !thread_stop.load(Ordering::Relaxed) {
            if let Ok(out) = run_git(&project_path, status_args()) {
                if last.as_deref() != Some(out.as_str()) {
                    let status = parse_porcelain_status(&out);
                    let _ = app.emit(
                        GIT_STATUS_CHANGED_EVENT,
                        GitStatusChanged {
                            project_id: thread_project_id.clone(),
                            status,
                        },
                    );
                    last = Some(out);
                }
            }
            thread::sleep(POLL_INTERVAL);
        }
    });

    watchers.insert(project_id, WatcherHandle { stop });
    Ok(())
}

#[tauri::command]
pub fn git_watch_stop(manager: State<GitWatcherManager>, project_id: String) -> Result<(), String> {
    if let Some(handle) = manager
        .watchers
        .lock()
        .map_err(|e| e.to_string())?
        .remove(&project_id)
    {
        handle.stop.store(true, Ordering::Relaxed);
    }
    Ok(())
}
