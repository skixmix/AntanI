use std::collections::HashMap;
use std::path::Path;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

/// How often the background watcher re-checks `git status` for a watched project.
const POLL_INTERVAL: Duration = Duration::from_secs(2);

/// Frontend event fired whenever a watched project's git status changes.
const GIT_STATUS_CHANGED_EVENT: &str = "git-status-changed";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FileChangeKind {
    Added,
    Modified,
    Deleted,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileEntry {
    pub path: String,
    pub kind: FileChangeKind,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub staged: Vec<GitFileEntry>,
    pub unstaged: Vec<GitFileEntry>,
}

fn classify(code: char) -> FileChangeKind {
    match code {
        'A' => FileChangeKind::Added,
        'D' => FileChangeKind::Deleted,
        // Renames/copies/type-changes/unmerged are folded into Modified — this
        // panel only distinguishes new/changed/deleted, not diff detail.
        _ => FileChangeKind::Modified,
    }
}

/// Parse `git status --porcelain=v1 --untracked-files=all -z` output.
///
/// Each entry is `XY<space><path>` NUL-terminated; `X` is the index (staged)
/// status, `Y` is the worktree (unstaged) status. Renames/copies carry an extra
/// NUL-terminated original-path field immediately after, which must be consumed
/// even though we don't use it, or every following entry would parse one field off.
pub fn parse_porcelain_status(text: &str) -> GitStatus {
    let mut staged = Vec::new();
    let mut unstaged = Vec::new();
    let mut parts = text.split('\0').filter(|s| !s.is_empty());

    while let Some(entry) = parts.next() {
        if entry.len() < 3 {
            continue;
        }
        let mut chars = entry.chars();
        let x = chars.next().unwrap();
        let y = chars.next().unwrap();
        let path = &entry[3..];

        if x == 'R' || x == 'C' {
            parts.next(); // consume the unused original-path field
        }

        if x == '?' && y == '?' {
            unstaged.push(GitFileEntry {
                path: path.to_string(),
                kind: FileChangeKind::Added,
            });
            continue;
        }
        if x != ' ' && x != '?' {
            staged.push(GitFileEntry {
                path: path.to_string(),
                kind: classify(x),
            });
        }
        if y != ' ' && y != '?' {
            unstaged.push(GitFileEntry {
                path: path.to_string(),
                kind: classify(y),
            });
        }
    }

    staged.sort_by(|a, b| a.path.cmp(&b.path));
    unstaged.sort_by(|a, b| a.path.cmp(&b.path));
    GitStatus { staged, unstaged }
}

fn run_git(project_path: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(project_path)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

fn status_args() -> &'static [&'static str] {
    &["status", "--porcelain=v1", "--untracked-files=all", "-z"]
}

#[tauri::command]
pub fn git_status(project_path: String) -> Result<GitStatus, String> {
    let out = run_git(&project_path, status_args())?;
    Ok(parse_porcelain_status(&out))
}

#[tauri::command]
pub fn git_stage(project_path: String, paths: Vec<String>) -> Result<(), String> {
    if paths.is_empty() {
        return Ok(());
    }
    let mut args: Vec<&str> = vec!["add", "--"];
    args.extend(paths.iter().map(|s| s.as_str()));
    run_git(&project_path, &args)?;
    Ok(())
}

#[tauri::command]
pub fn git_unstage(project_path: String, paths: Vec<String>) -> Result<(), String> {
    if paths.is_empty() {
        return Ok(());
    }
    let mut args: Vec<&str> = vec!["restore", "--staged", "--"];
    args.extend(paths.iter().map(|s| s.as_str()));
    run_git(&project_path, &args)?;
    Ok(())
}

#[tauri::command]
pub fn git_stage_all(project_path: String) -> Result<(), String> {
    run_git(&project_path, &["add", "-A"])?;
    Ok(())
}

#[tauri::command]
pub fn git_unstage_all(project_path: String) -> Result<(), String> {
    run_git(&project_path, &["restore", "--staged", "."])?;
    Ok(())
}

/// Discard an unstaged change. `kind` is supplied by the caller (it already has
/// the row's status from the last `GitStatus`), so this never needs to re-query
/// git to decide behavior: a new/untracked file is deleted directly, anything
/// else is restored from the index.
#[tauri::command]
pub fn git_revert_file(
    project_path: String,
    path: String,
    kind: FileChangeKind,
) -> Result<(), String> {
    if kind == FileChangeKind::Added {
        let full = Path::new(&project_path).join(&path);
        std::fs::remove_file(&full).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        run_git(&project_path, &["restore", "--", &path])?;
        Ok(())
    }
}

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_input_yields_empty_status() {
        let status = parse_porcelain_status("");
        assert!(status.staged.is_empty());
        assert!(status.unstaged.is_empty());
    }

    #[test]
    fn unstaged_modified() {
        let status = parse_porcelain_status(" M src/main.rs\0");
        assert!(status.staged.is_empty());
        assert_eq!(
            status.unstaged,
            vec![GitFileEntry {
                path: "src/main.rs".into(),
                kind: FileChangeKind::Modified
            }]
        );
    }

    #[test]
    fn staged_added() {
        let status = parse_porcelain_status("A  new_file.rs\0");
        assert!(status.unstaged.is_empty());
        assert_eq!(
            status.staged,
            vec![GitFileEntry {
                path: "new_file.rs".into(),
                kind: FileChangeKind::Added
            }]
        );
    }

    #[test]
    fn untracked_file_is_unstaged_added() {
        let status = parse_porcelain_status("?? untracked.txt\0");
        assert!(status.staged.is_empty());
        assert_eq!(
            status.unstaged,
            vec![GitFileEntry {
                path: "untracked.txt".into(),
                kind: FileChangeKind::Added
            }]
        );
    }

    #[test]
    fn unstaged_deleted() {
        let status = parse_porcelain_status(" D removed.rs\0");
        assert_eq!(
            status.unstaged,
            vec![GitFileEntry {
                path: "removed.rs".into(),
                kind: FileChangeKind::Deleted
            }]
        );
    }

    #[test]
    fn staged_deleted() {
        let status = parse_porcelain_status("D  removed2.rs\0");
        assert_eq!(
            status.staged,
            vec![GitFileEntry {
                path: "removed2.rs".into(),
                kind: FileChangeKind::Deleted
            }]
        );
    }

    #[test]
    fn modified_in_both_index_and_worktree_appears_in_both_sections() {
        let status = parse_porcelain_status("MM both.rs\0");
        assert_eq!(
            status.staged,
            vec![GitFileEntry {
                path: "both.rs".into(),
                kind: FileChangeKind::Modified
            }]
        );
        assert_eq!(
            status.unstaged,
            vec![GitFileEntry {
                path: "both.rs".into(),
                kind: FileChangeKind::Modified
            }]
        );
    }

    #[test]
    fn rename_consumes_original_path_field_without_misaligning_next_entry() {
        let status = parse_porcelain_status("R  new.rs\0old.rs\0?? extra.txt\0");
        assert_eq!(
            status.staged,
            vec![GitFileEntry {
                path: "new.rs".into(),
                kind: FileChangeKind::Modified
            }]
        );
        assert_eq!(
            status.unstaged,
            vec![GitFileEntry {
                path: "extra.txt".into(),
                kind: FileChangeKind::Added
            }]
        );
    }

    #[test]
    fn multiple_entries_are_sorted_by_path() {
        let status = parse_porcelain_status("?? z.txt\0?? a.txt\0A  m.txt\0");
        assert_eq!(status.unstaged[0].path, "a.txt");
        assert_eq!(status.unstaged[1].path, "z.txt");
        assert_eq!(status.staged[0].path, "m.txt");
    }
}
