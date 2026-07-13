mod git;
mod git_watcher;
mod ide_webview;
mod menu;
mod pty;
mod sound;
mod state;
mod vscode_server;

use state::{
    AppData, AppState, InjectTarget, Settings, SettingsState, PROJECTS_FILE, SETTINGS_FILE,
};
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            app.set_menu(menu::build(app.handle())?)?;

            let dir = app.path().app_data_dir()?;
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
            get_settings,
            update_settings,
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
            vscode_server::get_vscode_memory_mb,
            vscode_server::import_from_vscode,
            vscode_server::open_diff_in_ide,
            ide_webview::create_ide_webview,
            ide_webview::set_ide_bounds,
            ide_webview::show_ide_webview,
            ide_webview::hide_ide_webview,
            ide_webview::close_ide_webview,
            ide_webview::close_all_ide_webviews
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
