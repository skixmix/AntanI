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

/// A user-defined quick-access command, scoped to a single project. Opening it
/// spawns a terminal-kind tab that runs `command` as its startup shell command.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CustomCommand {
    pub id: String,
    pub name: String,
    pub command: String,
    /// Hex color string chosen from the frontend palette; tints the shared
    /// custom-command icon in the quick-access bar.
    pub color: String,
}

/// A project is a local folder the user has added to the sidebar.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    /// Hex color string chosen from the frontend palette (single source of truth).
    pub color: String,
    /// `serde(default)` so a `projects.json` from before this field existed
    /// still loads fine — every existing project just gets an empty list.
    #[serde(default)]
    pub custom_commands: Vec<CustomCommand>,
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
            custom_commands: Vec::new(),
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

    /// Add a custom command to a project. No-op (returns `None`) if the
    /// project id is unknown.
    pub fn add_custom_command(
        &mut self,
        project_id: &str,
        name: String,
        command: String,
        color: String,
    ) -> Option<CustomCommand> {
        let project = self.projects.iter_mut().find(|p| p.id == project_id)?;
        let cmd = CustomCommand {
            id: uuid::Uuid::new_v4().to_string(),
            name,
            command,
            color,
        };
        project.custom_commands.push(cmd.clone());
        Some(cmd)
    }

    /// Remove a custom command by id. No-op if the project or command id is unknown.
    pub fn remove_custom_command(&mut self, project_id: &str, command_id: &str) {
        if let Some(project) = self.projects.iter_mut().find(|p| p.id == project_id) {
            project.custom_commands.retain(|c| c.id != command_id);
        }
    }

    /// Update a custom command's name/command/color. No-op if the project or
    /// command id is unknown.
    pub fn update_custom_command(
        &mut self,
        project_id: &str,
        command_id: &str,
        name: String,
        command: String,
        color: String,
    ) {
        if let Some(project) = self.projects.iter_mut().find(|p| p.id == project_id) {
            if let Some(cmd) = project
                .custom_commands
                .iter_mut()
                .find(|c| c.id == command_id)
            {
                cmd.name = name;
                cmd.command = command;
                cmd.color = color;
            }
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

/// User-configurable settings, persisted to `settings.json`. `#[serde(default)]`
/// fills any missing field from `Default`, so a partially hand-edited or older
/// file still loads with sane values — this is also how a fresh field (like
/// `vscode_import_prompted`) rolls out to existing users across an app update:
/// it's simply absent from their file until first written, and defaults to
/// `false` until then.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub claude_command: String,
    pub opencode_command: String,
    pub notifications_enabled: bool,
    /// Whether the one-time "import your VS Code setup?" prompt has already
    /// been shown (regardless of the user's answer). Must only ever flip
    /// false -> true, exactly once per install, so the prompt never repeats.
    pub vscode_import_prompted: bool,
    pub sound_enabled: bool,
    pub sound_ready: String,
    pub sound_waiting: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            claude_command: DEFAULT_CLAUDE_COMMAND.to_string(),
            opencode_command: DEFAULT_OPENCODE_COMMAND.to_string(),
            notifications_enabled: true,
            vscode_import_prompted: false,
            sound_enabled: true,
            sound_ready: "Glass".to_string(),
            sound_waiting: "Ping".to_string(),
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
    fn set_active_none_clears_active() {
        let mut d = with_three();
        d.set_active(None);
        assert_eq!(d.active_project_id, None);
    }

    #[test]
    fn load_malformed_json_returns_default() {
        let path =
            std::env::temp_dir().join(format!("antani-malformed-{}.json", uuid::Uuid::new_v4()));
        fs::write(&path, b"not json").unwrap();
        assert_eq!(load::<AppData>(&path), AppData::default());
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn app_state_new_loads_from_disk() {
        let path =
            std::env::temp_dir().join(format!("antani-appstate-{}.json", uuid::Uuid::new_v4()));
        let d = with_three();
        save(&path, &d).unwrap();
        let state = AppState::new(path.clone());
        assert_eq!(*state.data.lock().unwrap(), d);
        assert_eq!(state.file_path, path);
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn settings_state_new_loads_from_disk() {
        let path = std::env::temp_dir().join(format!(
            "antani-settingsstate-{}.json",
            uuid::Uuid::new_v4()
        ));
        let s = Settings {
            claude_command: "custom".into(),
            opencode_command: "oc".into(),
            notifications_enabled: false,
            vscode_import_prompted: true,
            sound_enabled: false,
            sound_ready: "Hero".into(),
            sound_waiting: "Frog".into(),
        };
        save(&path, &s).unwrap();
        let state = SettingsState::new(path.clone());
        assert_eq!(*state.data.lock().unwrap(), s);
        let _ = fs::remove_file(&path);
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
        assert!(s.notifications_enabled);
        assert!(!s.vscode_import_prompted);
        assert!(s.sound_enabled);
        assert_eq!(s.sound_ready, "Glass");
        assert_eq!(s.sound_waiting, "Ping");
    }

    #[test]
    fn settings_save_then_load_round_trips() {
        let s = Settings {
            claude_command: "my-claude --flag".into(),
            opencode_command: "oc".into(),
            notifications_enabled: false,
            vscode_import_prompted: true,
            sound_enabled: false,
            sound_ready: "Hero".into(),
            sound_waiting: "Frog".into(),
        };
        let path =
            std::env::temp_dir().join(format!("antani-settings-{}.json", uuid::Uuid::new_v4()));
        save(&path, &s).unwrap();
        let loaded: Settings = load(&path);
        assert_eq!(loaded, s);
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn add_custom_command_appends_and_returns_it() {
        let mut d = with_three();
        let id = d.projects[0].id.clone();
        let cmd = d
            .add_custom_command(&id, "Build".into(), "make build".into(), "#3b82f6".into())
            .unwrap();
        assert_eq!(d.projects[0].custom_commands.len(), 1);
        assert_eq!(d.projects[0].custom_commands[0], cmd);
        assert_eq!(cmd.name, "Build");
        assert_eq!(cmd.command, "make build");
        assert_eq!(cmd.color, "#3b82f6");
    }

    #[test]
    fn add_custom_command_unknown_project_returns_none() {
        let mut d = with_three();
        let result = d.add_custom_command("bogus", "Build".into(), "make".into(), "#fff".into());
        assert!(result.is_none());
    }

    #[test]
    fn remove_custom_command_removes_only_target() {
        let mut d = with_three();
        let id = d.projects[0].id.clone();
        let a = d
            .add_custom_command(&id, "A".into(), "a".into(), "#fff".into())
            .unwrap();
        let b = d
            .add_custom_command(&id, "B".into(), "b".into(), "#000".into())
            .unwrap();
        d.remove_custom_command(&id, &a.id);
        assert_eq!(d.projects[0].custom_commands, vec![b]);
    }

    #[test]
    fn remove_custom_command_unknown_ids_are_no_ops() {
        let mut d = with_three();
        let id = d.projects[0].id.clone();
        d.add_custom_command(&id, "A".into(), "a".into(), "#fff".into());
        d.remove_custom_command("bogus-project", "bogus-command");
        d.remove_custom_command(&id, "bogus-command");
        assert_eq!(d.projects[0].custom_commands.len(), 1);
    }

    #[test]
    fn update_custom_command_changes_target_only() {
        let mut d = with_three();
        let id = d.projects[0].id.clone();
        let a = d
            .add_custom_command(&id, "A".into(), "a".into(), "#fff".into())
            .unwrap();
        let b = d
            .add_custom_command(&id, "B".into(), "b".into(), "#000".into())
            .unwrap();
        d.update_custom_command(&id, &a.id, "A2".into(), "a2".into(), "#111".into());
        assert_eq!(d.projects[0].custom_commands[0].name, "A2");
        assert_eq!(d.projects[0].custom_commands[0].command, "a2");
        assert_eq!(d.projects[0].custom_commands[0].color, "#111");
        assert_eq!(d.projects[0].custom_commands[1], b);
    }

    #[test]
    fn update_custom_command_unknown_ids_are_no_ops() {
        let mut d = with_three();
        let id = d.projects[0].id.clone();
        let a = d
            .add_custom_command(&id, "A".into(), "a".into(), "#fff".into())
            .unwrap();
        d.update_custom_command(
            "bogus-project",
            &a.id,
            "X".into(),
            "x".into(),
            "#000".into(),
        );
        d.update_custom_command(&id, "bogus-command", "X".into(), "x".into(), "#000".into());
        assert_eq!(d.projects[0].custom_commands[0], a);
    }

    #[test]
    fn custom_commands_save_then_load_round_trip() {
        let mut d = with_three();
        let id = d.projects[0].id.clone();
        d.add_custom_command(&id, "Build".into(), "make build".into(), "#3b82f6".into());
        let path =
            std::env::temp_dir().join(format!("antani-customcmd-{}.json", uuid::Uuid::new_v4()));
        save(&path, &d).unwrap();
        let loaded: AppData = load(&path);
        assert_eq!(loaded, d);
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn project_json_without_custom_commands_field_loads_as_empty() {
        let path = std::env::temp_dir().join(format!(
            "antani-legacy-project-{}.json",
            uuid::Uuid::new_v4()
        ));
        fs::write(
            &path,
            br##"{"projects":[{"id":"a","name":"A","path":"/a","color":"#ef4444"}],"activeProjectId":"a"}"##,
        )
        .unwrap();
        let loaded: AppData = load(&path);
        assert_eq!(loaded.projects[0].custom_commands, Vec::new());
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
        assert!(loaded.notifications_enabled);
        assert!(!loaded.vscode_import_prompted);
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn settings_upgrade_from_file_without_import_prompt_field_defaults_unprompted() {
        // Simulates an existing user's settings.json from before this field
        // existed — it must load as "not yet prompted", not error or panic.
        let path =
            std::env::temp_dir().join(format!("antani-upgrade-{}.json", uuid::Uuid::new_v4()));
        fs::write(
            &path,
            br#"{"claudeCommand":"claude","opencodeCommand":"opencode"}"#,
        )
        .unwrap();
        let loaded: Settings = load(&path);
        assert!(!loaded.vscode_import_prompted);
        assert!(loaded.notifications_enabled);
        let _ = fs::remove_file(&path);
    }
}
