use std::path::Path;
use std::process::Command;

use serde::{Deserialize, Serialize};

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

pub(crate) fn run_git(project_path: &str, args: &[&str]) -> Result<String, String> {
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

pub(crate) fn status_args() -> &'static [&'static str] {
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

    /// Creates a throwaway git repo under the OS temp dir with one committed
    /// file, so the `git_*` command wrappers can be exercised against real git.
    fn init_repo() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("antani-git-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.to_str().unwrap();
        run_git(path, &["init", "-q"]).unwrap();
        run_git(path, &["config", "user.email", "test@example.com"]).unwrap();
        run_git(path, &["config", "user.name", "Test"]).unwrap();
        std::fs::write(dir.join("tracked.txt"), "original\n").unwrap();
        run_git(path, &["add", "tracked.txt"]).unwrap();
        run_git(path, &["commit", "-q", "-m", "init"]).unwrap();
        dir
    }

    #[test]
    fn git_status_reports_untracked_and_modified_files() {
        let dir = init_repo();
        let path = dir.to_str().unwrap().to_string();
        std::fs::write(dir.join("tracked.txt"), "changed\n").unwrap();
        std::fs::write(dir.join("new.txt"), "new\n").unwrap();

        let status = git_status(path).unwrap();
        assert_eq!(status.unstaged.len(), 2);
        assert!(status.staged.is_empty());
    }

    #[test]
    fn git_stage_moves_paths_into_index() {
        let dir = init_repo();
        let path = dir.to_str().unwrap().to_string();
        std::fs::write(dir.join("new.txt"), "new\n").unwrap();

        git_stage(path.clone(), vec!["new.txt".into()]).unwrap();

        let status = git_status(path).unwrap();
        assert_eq!(
            status.staged,
            vec![GitFileEntry {
                path: "new.txt".into(),
                kind: FileChangeKind::Added
            }]
        );
        assert!(status.unstaged.is_empty());
    }

    #[test]
    fn git_stage_with_no_paths_is_a_noop() {
        let dir = init_repo();
        let path = dir.to_str().unwrap().to_string();
        git_stage(path, vec![]).unwrap();
    }

    #[test]
    fn git_unstage_moves_paths_back_out_of_index() {
        let dir = init_repo();
        let path = dir.to_str().unwrap().to_string();
        std::fs::write(dir.join("new.txt"), "new\n").unwrap();
        git_stage(path.clone(), vec!["new.txt".into()]).unwrap();

        git_unstage(path.clone(), vec!["new.txt".into()]).unwrap();

        let status = git_status(path).unwrap();
        assert!(status.staged.is_empty());
        assert_eq!(status.unstaged[0].path, "new.txt");
    }

    #[test]
    fn git_unstage_with_no_paths_is_a_noop() {
        let dir = init_repo();
        let path = dir.to_str().unwrap().to_string();
        git_unstage(path, vec![]).unwrap();
    }

    #[test]
    fn git_stage_all_stages_every_pending_change() {
        let dir = init_repo();
        let path = dir.to_str().unwrap().to_string();
        std::fs::write(dir.join("tracked.txt"), "changed\n").unwrap();
        std::fs::write(dir.join("new.txt"), "new\n").unwrap();

        git_stage_all(path.clone()).unwrap();

        let status = git_status(path).unwrap();
        assert_eq!(status.staged.len(), 2);
        assert!(status.unstaged.is_empty());
    }

    #[test]
    fn git_unstage_all_clears_the_index() {
        let dir = init_repo();
        let path = dir.to_str().unwrap().to_string();
        std::fs::write(dir.join("tracked.txt"), "changed\n").unwrap();
        git_stage_all(path.clone()).unwrap();

        git_unstage_all(path.clone()).unwrap();

        let status = git_status(path).unwrap();
        assert!(status.staged.is_empty());
        assert_eq!(status.unstaged[0].path, "tracked.txt");
    }

    #[test]
    fn git_revert_file_deletes_added_files() {
        let dir = init_repo();
        let path = dir.to_str().unwrap().to_string();
        std::fs::write(dir.join("new.txt"), "new\n").unwrap();

        git_revert_file(path, "new.txt".into(), FileChangeKind::Added).unwrap();

        assert!(!dir.join("new.txt").exists());
    }

    #[test]
    fn git_revert_file_restores_modified_tracked_files() {
        let dir = init_repo();
        let path = dir.to_str().unwrap().to_string();
        std::fs::write(dir.join("tracked.txt"), "changed\n").unwrap();

        git_revert_file(path, "tracked.txt".into(), FileChangeKind::Modified).unwrap();

        assert_eq!(
            std::fs::read_to_string(dir.join("tracked.txt")).unwrap(),
            "original\n"
        );
    }
}
