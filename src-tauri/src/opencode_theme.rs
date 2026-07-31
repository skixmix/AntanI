use std::fs;
use std::path::{Path, PathBuf};

/// The Antani OpenCode theme, embedded at compile time from the committed
/// source in `src-tauri/opencode-theme/`. Embedded rather than bundled as a
/// Tauri resource because a tiny static file needs no runtime `resource_dir()`
/// resolution, and embedding makes install behave identically in `tauri dev`
/// and the packaged app. Editing the theme requires a rebuild, which is fine
/// for a static asset.
const THEME_JSON: &str = include_str!("../opencode-theme/antani.json");

const THEME_FILE_NAME: &str = "antani.json";

/// Write the bundled theme into OpenCode's themes directory under `config_root`,
/// creating the directory if missing and overwriting any previous install so it
/// always refreshes to the current version. Returns the path written.
///
/// `config_root` is `$XDG_CONFIG_HOME` (when set) or `~/.config`: OpenCode reads
/// themes from `<config>/opencode/themes/` on every platform, macOS included.
/// It follows the XDG layout, not `~/Library/Application Support`.
pub fn install_theme(config_root: &Path) -> Result<PathBuf, String> {
    let themes_dir = config_root.join("opencode").join("themes");
    fs::create_dir_all(&themes_dir)
        .map_err(|error| format!("failed to create themes directory {}: {}", themes_dir.display(), error))?;
    let dest = themes_dir.join(THEME_FILE_NAME);
    fs::write(&dest, THEME_JSON)
        .map_err(|error| format!("failed to write theme file {}: {}", dest.display(), error))?;
    Ok(dest)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root() -> PathBuf {
        std::env::temp_dir().join(format!("antani-theme-{}", uuid::Uuid::new_v4()))
    }

    #[test]
    fn embedded_theme_is_valid_json() {
        assert!(serde_json::from_str::<serde_json::Value>(THEME_JSON).is_ok());
    }

    #[test]
    fn writes_theme_into_opencode_themes_dir() {
        let root = temp_root();
        let dest = install_theme(&root).unwrap();

        assert_eq!(
            dest,
            root.join("opencode").join("themes").join("antani.json")
        );
        assert_eq!(fs::read_to_string(&dest).unwrap(), THEME_JSON);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn overwrites_an_existing_theme() {
        let root = temp_root();
        let themes_dir = root.join("opencode").join("themes");
        fs::create_dir_all(&themes_dir).unwrap();
        fs::write(themes_dir.join("antani.json"), "stale contents").unwrap();

        let dest = install_theme(&root).unwrap();

        assert_eq!(fs::read_to_string(&dest).unwrap(), THEME_JSON);

        let _ = fs::remove_dir_all(&root);
    }
}
