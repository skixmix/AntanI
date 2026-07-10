mod state;

use state::{AppData, AppState, PROJECTS_FILE};
use tauri::{Manager, State};

/// Lock the state mutex, run a mutation, persist to disk, and return the new state.
fn mutate<F>(state: &AppState, f: F) -> Result<AppData, String>
where
    F: FnOnce(&mut AppData),
{
    let mut data = state.data.lock().map_err(|e| e.to_string())?;
    f(&mut data);
    state::save(&state.file_path, &data).map_err(|e| e.to_string())?;
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
fn set_active_project(state: State<AppState>, id: Option<String>) -> Result<AppData, String> {
    mutate(&state, |d| d.set_active(id))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            let file_path = dir.join(PROJECTS_FILE);
            app.manage(AppState::new(file_path));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_state,
            add_project,
            remove_project,
            rename_project,
            set_project_color,
            reorder_projects,
            set_active_project
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
