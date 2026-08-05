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
pub fn write_brief(task_id: &str, contents: &str) -> io::Result<PathBuf> {
    let safe: String = task_id
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let stem = if safe.is_empty() { "task" } else { &safe };
    let dir = briefs_dir();
    fs::create_dir_all(&dir)?;
    let path = dir.join(format!("{}-{}.md", stem, uuid::Uuid::new_v4()));
    fs::write(&path, contents)?;
    Ok(path)
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
}
