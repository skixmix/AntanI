mod backup;
mod git;
mod git_watcher;
mod ide_bridge;
mod ide_webview;
mod menu;
mod opencode_theme;
mod pty;
mod sound;
mod state;
mod task_brief;
mod updater;
mod vscode_server;
mod window_restore;

use state::{
    AppData, AppState, InjectTarget, Settings, SettingsState, TaskContent, TaskStatus,
    PROJECTS_FILE, SETTINGS_FILE,
};
use std::path::Path;
use tauri::{Manager, RunEvent, State, WindowEvent};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use vscode_server::VscodeServer;

/// Cmd+1..Cmd+9 → switch to the Nth project, paired with that 1-based index.
///
/// Registered as OS-level global shortcuts (only while our window is focused), not
/// as a webview `keydown` listener: the embedded VS Code child webview swallows key
/// events, so a JS listener never sees them. Tradeoff — while the IDE is focused,
/// Cmd+1..9 switch projects, so VS Code's own "focus editor group N" is shadowed.
fn quick_switch_shortcuts() -> Vec<(Shortcut, u32)> {
    [
        Code::Digit1,
        Code::Digit2,
        Code::Digit3,
        Code::Digit4,
        Code::Digit5,
        Code::Digit6,
        Code::Digit7,
        Code::Digit8,
        Code::Digit9,
    ]
    .into_iter()
    .enumerate()
    .map(|(i, code)| (Shortcut::new(Some(Modifiers::SUPER), code), i as u32 + 1))
    .collect()
}

/// Lock the state mutex, run a mutation, persist to disk, and return the new state.
fn mutate<F>(state: &AppState, f: F) -> Result<AppData, String>
where
    F: FnOnce(&mut AppData),
{
    let mut data = state.data.lock().map_err(|e| e.to_string())?;
    f(&mut data);
    state::save(&state.file_path, &*data).map_err(|e| e.to_string())?;
    Ok(data.clone())
}

/// Reap a task's scratch briefs once it lands in Done: the agent reads a brief
/// at dispatch, so a completed task's brief is spent and safe to delete.
fn reap_brief_if_done(data: &AppData, project_id: &str, id: &str) {
    let done_task_id = data
        .projects
        .iter()
        .find(|p| p.id == project_id)
        .and_then(|p| p.tasks.iter().find(|t| t.id == id))
        .filter(|t| t.status == TaskStatus::Done)
        .map(|t| t.task_id.clone());
    if let Some(task_id) = done_task_id {
        task_brief::remove_briefs_for(&task_id);
    }
}

#[tauri::command]
fn get_app_state(state: State<AppState>) -> Result<AppData, String> {
    state
        .data
        .lock()
        .map(|d| d.clone())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn add_project(
    state: State<AppState>,
    path: String,
    name: String,
    color: String,
) -> Result<AppData, String> {
    mutate(&state, |d| {
        d.add_project(path, name, color);
    })
}

#[tauri::command]
fn remove_project(state: State<AppState>, id: String) -> Result<AppData, String> {
    mutate(&state, |d| d.remove_project(&id))
}

#[tauri::command]
fn rename_project(state: State<AppState>, id: String, name: String) -> Result<AppData, String> {
    mutate(&state, |d| d.rename_project(&id, name))
}

#[tauri::command]
fn set_project_color(state: State<AppState>, id: String, color: String) -> Result<AppData, String> {
    mutate(&state, |d| d.set_color(&id, color))
}

#[tauri::command]
fn reorder_projects(state: State<AppState>, ordered_ids: Vec<String>) -> Result<AppData, String> {
    mutate(&state, |d| d.reorder(&ordered_ids))
}

#[tauri::command]
fn add_custom_command(
    state: State<AppState>,
    project_id: String,
    name: String,
    command: String,
    color: String,
) -> Result<AppData, String> {
    mutate(&state, |d| {
        d.add_custom_command(&project_id, name, command, color);
    })
}

#[tauri::command]
fn remove_custom_command(
    state: State<AppState>,
    project_id: String,
    command_id: String,
) -> Result<AppData, String> {
    mutate(&state, |d| {
        d.remove_custom_command(&project_id, &command_id)
    })
}

#[tauri::command]
fn update_custom_command(
    state: State<AppState>,
    project_id: String,
    command_id: String,
    name: String,
    command: String,
    color: String,
) -> Result<AppData, String> {
    mutate(&state, |d| {
        d.update_custom_command(&project_id, &command_id, name, command, color);
    })
}

#[tauri::command]
fn add_injectable(
    state: State<AppState>,
    project_id: String,
    name: String,
    text: String,
    target: InjectTarget,
    color: String,
) -> Result<AppData, String> {
    mutate(&state, |d| {
        d.add_injectable(&project_id, name, text, target, color);
    })
}

#[tauri::command]
fn remove_injectable(
    state: State<AppState>,
    project_id: String,
    injectable_id: String,
) -> Result<AppData, String> {
    mutate(&state, |d| d.remove_injectable(&project_id, &injectable_id))
}

#[tauri::command]
fn update_injectable(
    state: State<AppState>,
    project_id: String,
    injectable_id: String,
    name: String,
    text: String,
    target: InjectTarget,
    color: String,
) -> Result<AppData, String> {
    mutate(&state, |d| {
        d.update_injectable(&project_id, &injectable_id, name, text, target, color);
    })
}

#[tauri::command]
fn set_active_project(state: State<AppState>, id: Option<String>) -> Result<AppData, String> {
    mutate(&state, |d| d.set_active(id))
}

#[tauri::command]
fn add_task(
    state: State<AppState>,
    project_id: String,
    content: TaskContent,
    task_id: Option<String>,
    status: TaskStatus,
) -> Result<AppData, String> {
    mutate(&state, |d| {
        d.add_task(&project_id, content, task_id, status);
    })
}

#[tauri::command]
fn update_task(
    state: State<AppState>,
    project_id: String,
    id: String,
    content: TaskContent,
    task_id: String,
) -> Result<AppData, String> {
    mutate(&state, |d| {
        d.update_task(&project_id, &id, content, task_id);
    })
}

#[tauri::command]
fn set_task_status(
    state: State<AppState>,
    project_id: String,
    id: String,
    status: TaskStatus,
) -> Result<AppData, String> {
    let data = mutate(&state, |d| d.set_task_status(&project_id, &id, status))?;
    reap_brief_if_done(&data, &project_id, &id);
    Ok(data)
}

#[tauri::command]
fn reorder_task(
    state: State<AppState>,
    project_id: String,
    id: String,
    status: TaskStatus,
    before_id: Option<String>,
) -> Result<AppData, String> {
    let data = mutate(&state, |d| {
        d.reorder_task(&project_id, &id, status, before_id.as_deref());
    })?;
    reap_brief_if_done(&data, &project_id, &id);
    Ok(data)
}

#[tauri::command]
fn remove_task(state: State<AppState>, project_id: String, id: String) -> Result<AppData, String> {
    let mut removed = None;
    let data = mutate(&state, |d| {
        removed = d.remove_task(&project_id, &id);
    })?;
    if let Some(task_id) = removed {
        task_brief::remove_briefs_for(&task_id);
    }
    Ok(data)
}

#[tauri::command]
fn clear_done_tasks(state: State<AppState>, project_id: String) -> Result<AppData, String> {
    let mut removed = Vec::new();
    let data = mutate(&state, |d| {
        removed = d.clear_done_tasks(&project_id);
    })?;
    for task_id in &removed {
        task_brief::remove_briefs_for(task_id);
    }
    Ok(data)
}

#[tauri::command]
fn set_task_prefix(
    state: State<AppState>,
    project_id: String,
    prefix: String,
) -> Result<AppData, String> {
    mutate(&state, |d| d.set_task_prefix(&project_id, prefix))
}

/// Write a task's full brief to a temp file (see `task_brief`) and return its
/// path, so a huge description reaches the agent by file reference rather than a
/// fragile PTY paste. Not persisted state, so it does not go through `mutate`.
#[tauri::command]
fn write_task_brief(task_id: String, contents: String) -> Result<String, String> {
    task_brief::write_brief(&task_id, &contents)
        .map(|path| path.to_string_lossy().into_owned())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn get_settings(settings: State<SettingsState>) -> Result<Settings, String> {
    settings
        .data
        .lock()
        .map(|s| s.clone())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn update_settings(state: State<SettingsState>, settings: Settings) -> Result<Settings, String> {
    let mut data = state.data.lock().map_err(|e| e.to_string())?;
    *data = settings;
    state::save(&state.file_path, &*data).map_err(|e| e.to_string())?;
    Ok(data.clone())
}

#[tauri::command]
fn export_backup(
    app: tauri::AppHandle,
    path: String,
    selection: backup::BackupSelection,
) -> Result<(), String> {
    let maintenance = app.state::<backup::BackupMaintenance>();
    let _maintenance_guard = maintenance.lock()?;
    let state = app.state::<AppState>();
    let settings = app.state::<SettingsState>();
    let server = app.state::<VscodeServer>();
    let app_data = state.data.lock().map_err(|error| error.to_string())?;
    let app_settings = settings.data.lock().map_err(|error| error.to_string())?;
    let app_data_dir = state
        .file_path
        .parent()
        .ok_or_else(|| "AntanI data directory is unavailable".to_string())?;
    let restart_server = selection.includes_vscode() && server.stop_for_maintenance();
    let result = backup::export_backup(app_data_dir, Path::new(&path), selection)
        .map_err(|error| error.to_string());
    drop(app_data);
    drop(app_settings);
    if restart_server {
        server.ensure_started(&app);
    }
    result
}

#[tauri::command]
fn import_backup(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let archive_path = Path::new(&path);
    backup::validate_backup(archive_path).map_err(|error| error.to_string())?;
    let maintenance = app.state::<backup::BackupMaintenance>();
    let _maintenance_guard = maintenance.lock()?;
    let state = app.state::<AppState>();
    let settings = app.state::<SettingsState>();
    let server = app.state::<VscodeServer>();
    let mut app_data = state.data.lock().map_err(|error| error.to_string())?;
    let mut app_settings = settings.data.lock().map_err(|error| error.to_string())?;
    let app_data_dir = state
        .file_path
        .parent()
        .ok_or_else(|| "AntanI data directory is unavailable".to_string())?;

    let restart_server = server.stop_for_maintenance();
    let imported = match backup::import_backup(app_data_dir, archive_path) {
        Ok(imported) => imported,
        Err(error) => {
            drop(app_data);
            drop(app_settings);
            if restart_server {
                server.ensure_started(&app);
            }
            return Err(error.to_string());
        }
    };
    *app_data = imported.app_data;
    *app_settings = imported.settings;
    drop(app_data);
    drop(app_settings);
    app.restart()
}

/// One-click adoption of the matching OpenCode theme for users who installed
/// AntanI via Homebrew and have no repo checkout. Returns the path written.
#[tauri::command]
fn install_opencode_theme(app: tauri::AppHandle) -> Result<String, String> {
    let config_root = match std::env::var_os("XDG_CONFIG_HOME") {
        Some(value) if !value.is_empty() => std::path::PathBuf::from(value),
        _ => app
            .path()
            .home_dir()
            .map_err(|error| error.to_string())?
            .join(".config"),
    };
    let dest = opencode_theme::install_theme(&config_root)?;
    Ok(dest.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .skip_initial_state("main")
                .build(),
        )
        .setup(|app| {
            app.set_menu(menu::build(app.handle())?)?;
            window_restore::restore_main_window(app);

            let dir = app.path().app_data_dir()?;
            backup::recover_interrupted_import(&dir)?;
            task_brief::clear_briefs();
            app.manage(backup::BackupMaintenance::default());
            app.manage(AppState::new(dir.join(PROJECTS_FILE)));
            app.manage(SettingsState::new(dir.join(SETTINGS_FILE)));
            app.manage(pty::PtyManager::default());
            app.manage(git_watcher::GitWatcherManager::default());

            let server = VscodeServer::new(dir);
            server.reclaim_orphan();
            app.manage(server);
            app.manage(ide_webview::IdeWebviews::default());

            let shortcuts = quick_switch_shortcuts();
            let handler_shortcuts = shortcuts.clone();
            app.handle().plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_handler(move |app, shortcut, event| {
                        if event.state() != ShortcutState::Pressed {
                            return;
                        }
                        if let Some((_, n)) = handler_shortcuts.iter().find(|(s, _)| s == shortcut) {
                            if let Some(main) = app.get_webview_window("main") {
                                let _ = main.eval(format!(
                                    "window.dispatchEvent(new CustomEvent('antani:quick-switch',{{detail:{n}}}))"
                                ));
                            }
                        }
                    })
                    .build(),
            )?;
            let global = app.global_shortcut();
            for (shortcut, _) in &shortcuts {
                let _ = global.register(*shortcut);
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::Focused(focused) = event {
                let global = window.app_handle().global_shortcut();
                if *focused {
                    for (shortcut, _) in quick_switch_shortcuts() {
                        let _ = global.register(shortcut);
                    }
                } else {
                    let _ = global.unregister_all();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_app_state,
            add_project,
            remove_project,
            rename_project,
            set_project_color,
            reorder_projects,
            add_custom_command,
            remove_custom_command,
            update_custom_command,
            add_injectable,
            remove_injectable,
            update_injectable,
            set_active_project,
            add_task,
            update_task,
            set_task_status,
            reorder_task,
            remove_task,
            clear_done_tasks,
            set_task_prefix,
            write_task_brief,
            get_settings,
            update_settings,
            export_backup,
            import_backup,
            install_opencode_theme,
            sound::play_system_sound,
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            git::git_status,
            git::git_stage,
            git::git_unstage,
            git::git_stage_all,
            git::git_unstage_all,
            git::git_revert_file,
            git::git_revert_all,
            git_watcher::git_watch_start,
            git_watcher::git_watch_stop,
            vscode_server::ensure_ide_server,
            vscode_server::import_from_vscode,
            ide_bridge::resolve_terminal_file_link,
            ide_bridge::open_diff_in_ide,
            ide_bridge::open_file_in_ide,
            ide_webview::create_ide_webview,
            ide_webview::set_ide_bounds,
            ide_webview::show_ide_webview,
            ide_webview::hide_ide_webview,
            ide_webview::close_ide_webview,
            updater::run_brew_upgrade
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let RunEvent::Exit = event {
                if let Some(manager) = app_handle.try_state::<pty::PtyManager>() {
                    manager.kill_all();
                }
                if let Some(manager) = app_handle.try_state::<git_watcher::GitWatcherManager>() {
                    manager.stop_all();
                }
                if let Some(server) = app_handle.try_state::<VscodeServer>() {
                    server.stop();
                }
            }
        });
}
