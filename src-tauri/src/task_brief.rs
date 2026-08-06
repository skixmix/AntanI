use std::fs;
use std::io;
use std::path::PathBuf;

/// A dedicated subdir of the OS temp dir (on macOS the per-user `$TMPDIR`,
/// `/var/folders/.../T/`) holding task briefs. Kept separate so `clear_briefs`
/// can wipe the whole set without touching anything else in temp.
fn briefs_dir() -> PathBuf {
    std::env::temp_dir().join("antani-task-briefs")
}

/// Write a task's full brief to a temp file and return its path. A huge
/// (AI-written) description is handed to the agent *by reference* — the agent
/// reads this file — instead of being pasted through the PTY, which has
/// paste-size and TUI-composer limits. Briefs are scratch, never persisted app
/// state; `clear_briefs` reaps them at startup.
const MAX_STEM_LEN: usize = 64;

/// Filesystem-safe filename stem for a task id. `write_brief` and
/// `remove_briefs_for` must derive it identically or cleanup can't match.
fn safe_stem(task_id: &str) -> String {
    let mut safe: String = task_id
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    safe.truncate(MAX_STEM_LEN);
    if safe.is_empty() {
        "task".to_string()
    } else {
        safe
    }
}

pub fn write_brief(task_id: &str, contents: &str) -> io::Result<PathBuf> {
    let stem = safe_stem(task_id);
    let dir = briefs_dir();
    fs::create_dir_all(&dir)?;
    let path = dir.join(format!("{}-{}.md", stem, uuid::Uuid::new_v4()));
    fs::write(&path, contents)?;
    Ok(path)
}

/// Delete every scratch brief for `task_id` (each "Send to AI" adds one
/// `<stem>-<uuid>.md`). The trailing `-` in the match prefix stops `OE-1` from
/// also matching `OE-15`. Best-effort. Two projects sharing an identical task
/// id would clear each other's briefs, which is harmless and self-corrects on
/// the next send.
pub fn remove_briefs_for(task_id: &str) {
    let prefix = format!("{}-", safe_stem(task_id));
    let Ok(entries) = fs::read_dir(briefs_dir()) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.starts_with(&prefix) && name.ends_with(".md") {
            let _ = fs::remove_file(entry.path());
        }
    }
}

/// Delete every task brief. Called once at startup: a brief is read by the agent
/// right after it's written, so anything still on disk at launch is a leftover
/// (from a normal quit or a crash) and safe to remove.
pub fn clear_briefs() {
    let _ = fs::remove_dir_all(briefs_dir());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_full_contents_and_keeps_task_id_in_name() {
        let contents = "x".repeat(300_000);
        let path = write_brief("OE-3", &contents).unwrap();
        assert!(path.file_name().unwrap().to_string_lossy().contains("OE-3"));
        assert_eq!(fs::read_to_string(&path).unwrap(), contents);
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn sanitizes_unsafe_task_id_into_filename() {
        let path = write_brief("../../etc/passwd", "hi").unwrap();
        let name = path.file_name().unwrap().to_string_lossy().into_owned();
        assert!(!name.contains('/'));
        assert!(!name.contains(".."));
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn truncates_long_task_id_stem() {
        let long_id = "a".repeat(300);
        let path = write_brief(&long_id, "hi").unwrap();
        let name = path.file_name().unwrap().to_string_lossy().into_owned();
        assert!(name.starts_with(&"a".repeat(MAX_STEM_LEN)));
        assert!(!name.starts_with(&"a".repeat(MAX_STEM_LEN + 1)));
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn remove_briefs_for_deletes_matching_stems_only() {
        let a = write_brief("REAPTEST-3", "one").unwrap();
        let b = write_brief("REAPTEST-3", "two").unwrap();
        let sibling = write_brief("REAPTEST-30", "keep").unwrap();
        remove_briefs_for("REAPTEST-3");
        assert!(!a.exists());
        assert!(!b.exists());
        assert!(
            sibling.exists(),
            "sibling stem must not be reaped by prefix"
        );
        let _ = fs::remove_file(&sibling);
    }
}
