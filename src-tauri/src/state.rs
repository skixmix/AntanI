use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// Filename (inside the OS app-data dir) where the project list is persisted.
pub const PROJECTS_FILE: &str = "projects.json";

/// Filename (inside the OS app-data dir) where user settings are persisted.
pub const SETTINGS_FILE: &str = "settings.json";

/// Default launch command for a Claude tab (overridable in settings).
pub const DEFAULT_CLAUDE_COMMAND: &str = "claude";

/// Default launch command for an opencode tab (overridable in settings).
pub const DEFAULT_OPENCODE_COMMAND: &str = "opencode";

/// A project is a local folder the user has added to the sidebar.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    /// Hex color string chosen from the frontend palette (single source of truth).
    pub color: String,
}

/// The full persisted application state (Phase 1: projects + last active project).
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default, rename_all = "camelCase")]
pub struct AppData {
    pub projects: Vec<Project>,
    pub active_project_id: Option<String>,
}

impl AppData {
    /// Append a new project. The first project added becomes the active one.
    pub fn add_project(&mut self, path: String, name: String, color: String) -> Project {
        let project = Project {
            id: uuid::Uuid::new_v4().to_string(),
            name,
            path,
            color,
        };
        self.projects.push(project.clone());
        if self.active_project_id.is_none() {
            self.active_project_id = Some(project.id.clone());
        }
        project
    }

    /// Remove a project by id. If it was active, fall back to the first remaining.
    pub fn remove_project(&mut self, id: &str) {
        self.projects.retain(|p| p.id != id);
        if self.active_project_id.as_deref() == Some(id) {
            self.active_project_id = self.projects.first().map(|p| p.id.clone());
        }
    }

    pub fn rename_project(&mut self, id: &str, name: String) {
        if let Some(p) = self.projects.iter_mut().find(|p| p.id == id) {
            p.name = name;
        }
    }

    pub fn set_color(&mut self, id: &str, color: String) {
        if let Some(p) = self.projects.iter_mut().find(|p| p.id == id) {
            p.color = color;
        }
    }

    /// Reorder projects to match `ordered_ids`. Unknown ids are ignored; any
    /// existing project missing from `ordered_ids` is appended in its original
    /// relative order, so a reorder can never drop a project.
    pub fn reorder(&mut self, ordered_ids: &[String]) {
        let mut remaining = std::mem::take(&mut self.projects);
        let mut reordered: Vec<Project> = Vec::with_capacity(remaining.len());
        for id in ordered_ids {
            if let Some(pos) = remaining.iter().position(|p| &p.id == id) {
                reordered.push(remaining.remove(pos));
            }
        }
        reordered.extend(remaining);
        self.projects = reordered;
    }

    /// Set the active project. `Some(id)` for an unknown id is ignored.
    pub fn set_active(&mut self, id: Option<String>) {
        match &id {
            Some(target) if self.projects.iter().any(|p| &p.id == target) => {
                self.active_project_id = id;
            }
            None => self.active_project_id = None,
            _ => {}
        }
    }
}

/// Load JSON state from `path`. A missing or unparseable file yields defaults —
/// we never crash on a bad file; the next save rewrites it cleanly.
pub fn load<T: DeserializeOwned + Default>(path: &Path) -> T {
    let Ok(bytes) = fs::read(path) else {
        return T::default();
    };
    match serde_json::from_slice::<T>(&bytes) {
        Ok(data) => data,
        Err(err) => {
            eprintln!("antani: failed to parse {}: {err}", path.display());
            T::default()
        }
    }
}

/// Persist JSON state to `path` atomically (write to a temp file, then rename).
pub fn save<T: Serialize>(path: &Path, data: &T) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_vec_pretty(data)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, &json)?;
    fs::rename(&tmp, path)?;
    Ok(())
}

/// Managed Tauri state: in-memory data guarded by a mutex + the file to persist to.
pub struct AppState {
    pub data: Mutex<AppData>,
    pub file_path: PathBuf,
}

impl AppState {
    pub fn new(file_path: PathBuf) -> Self {
        let data: AppData = load(&file_path);
        Self {
            data: Mutex::new(data),
            file_path,
        }
    }
}

/// User-configurable settings, persisted to `settings.json`. Currently just the
/// launch commands for the Claude and opencode tab types (for users with aliases
/// or wrappers). `#[serde(default)]` fills any missing field from `Default`, so a
/// partially hand-edited or older file still loads with sane values.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub claude_command: String,
    pub opencode_command: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            claude_command: DEFAULT_CLAUDE_COMMAND.to_string(),
            opencode_command: DEFAULT_OPENCODE_COMMAND.to_string(),
        }
    }
}

/// Managed Tauri state for user settings (mirrors `AppState`).
pub struct SettingsState {
    pub data: Mutex<Settings>,
    pub file_path: PathBuf,
}

impl SettingsState {
    pub fn new(file_path: PathBuf) -> Self {
        let data: Settings = load(&file_path);
        Self {
            data: Mutex::new(data),
            file_path,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn with_three() -> AppData {
        let mut d = AppData::default();
        d.add_project("/a".into(), "A".into(), "#ef4444".into());
        d.add_project("/b".into(), "B".into(), "#22c55e".into());
        d.add_project("/c".into(), "C".into(), "#3b82f6".into());
        d
    }

    fn ids(d: &AppData) -> Vec<String> {
        d.projects.iter().map(|p| p.id.clone()).collect()
    }

    #[test]
    fn first_added_project_becomes_active() {
        let mut d = AppData::default();
        let p = d.add_project("/a".into(), "A".into(), "#ef4444".into());
        assert_eq!(d.active_project_id.as_deref(), Some(p.id.as_str()));
        let q = d.add_project("/b".into(), "B".into(), "#22c55e".into());
        // active should not change when adding a second project
        assert_eq!(d.active_project_id.as_deref(), Some(p.id.as_str()));
        assert_ne!(p.id, q.id);
    }

    #[test]
    fn remove_active_falls_back_to_first_remaining() {
        let mut d = with_three();
        let first = d.projects[0].id.clone();
        d.set_active(Some(first.clone()));
        d.remove_project(&first);
        assert_eq!(d.projects.len(), 2);
        assert_eq!(d.active_project_id.as_ref(), Some(&d.projects[0].id));
    }

    #[test]
    fn remove_last_project_clears_active() {
        let mut d = AppData::default();
        let p = d.add_project("/a".into(), "A".into(), "#ef4444".into());
        d.remove_project(&p.id);
        assert!(d.projects.is_empty());
        assert_eq!(d.active_project_id, None);
    }

    #[test]
    fn rename_and_recolor_target_only() {
        let mut d = with_three();
        let id = d.projects[1].id.clone();
        d.rename_project(&id, "Renamed".into());
        d.set_color(&id, "#a855f7".into());
        assert_eq!(d.projects[1].name, "Renamed");
        assert_eq!(d.projects[1].color, "#a855f7");
        assert_eq!(d.projects[0].name, "A");
        assert_eq!(d.projects[2].name, "C");
    }

    #[test]
    fn reorder_respects_ids_and_keeps_all() {
        let mut d = with_three();
        let [a, b, c]: [String; 3] = ids(&d).try_into().unwrap();
        d.reorder(&[c.clone(), a.clone(), b.clone()]);
        assert_eq!(ids(&d), vec![c, a, b]);
    }

    #[test]
    fn reorder_ignores_unknown_and_appends_missing() {
        let mut d = with_three();
        let [a, b, c]: [String; 3] = ids(&d).try_into().unwrap();
        // only mention c + a bogus id; b and a must survive, appended in order
        d.reorder(&[c.clone(), "bogus".into()]);
        assert_eq!(d.projects.len(), 3);
        assert_eq!(d.projects[0].id, c);
        assert!(ids(&d).contains(&a));
        assert!(ids(&d).contains(&b));
    }

    #[test]
    fn set_active_ignores_unknown_id() {
        let mut d = with_three();
        let original = d.active_project_id.clone();
        d.set_active(Some("nope".into()));
        assert_eq!(d.active_project_id, original);
    }

    #[test]
    fn save_then_load_round_trips() {
        let mut d = with_three();
        d.set_active(Some(d.projects[2].id.clone()));
        let path = std::env::temp_dir().join(format!("antani-test-{}.json", uuid::Uuid::new_v4()));
        save(&path, &d).unwrap();
        let loaded: AppData = load(&path);
        assert_eq!(loaded, d);
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn load_missing_file_returns_default() {
        let path =
            std::env::temp_dir().join(format!("antani-missing-{}.json", uuid::Uuid::new_v4()));
        assert_eq!(load::<AppData>(&path), AppData::default());
    }

    #[test]
    fn settings_default_are_the_bare_commands() {
        let s = Settings::default();
        assert_eq!(s.claude_command, "claude");
        assert_eq!(s.opencode_command, "opencode");
    }

    #[test]
    fn settings_save_then_load_round_trips() {
        let s = Settings {
            claude_command: "my-claude --flag".into(),
            opencode_command: "oc".into(),
        };
        let path =
            std::env::temp_dir().join(format!("antani-settings-{}.json", uuid::Uuid::new_v4()));
        save(&path, &s).unwrap();
        let loaded: Settings = load(&path);
        assert_eq!(loaded, s);
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn settings_partial_json_fills_missing_field_from_default() {
        let path =
            std::env::temp_dir().join(format!("antani-partial-{}.json", uuid::Uuid::new_v4()));
        fs::write(&path, br#"{"claudeCommand":"oc-claude"}"#).unwrap();
        let loaded: Settings = load(&path);
        assert_eq!(loaded.claude_command, "oc-claude");
        assert_eq!(loaded.opencode_command, "opencode");
        let _ = fs::remove_file(&path);
    }
}
