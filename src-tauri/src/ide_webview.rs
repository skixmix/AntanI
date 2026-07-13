use std::collections::HashSet;
use std::sync::Mutex;

use tauri::webview::WebviewBuilder;
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, Position, Rect, Size, WebviewUrl};
use url::Url;

use crate::vscode_server::{VscodeServer, SERVE_WEB_HOST};

const OFFSCREEN: f64 = 1_000_000.0;

/// Managed Tauri state: the set of project ids that currently own a live IDE
/// webview. One hidden child webview per project is created lazily and kept alive
/// across tab/project switches, so an editor's unsaved buffers survive a switch;
/// it is torn down only when the IDE tab is closed or the project is removed.
#[derive(Default)]
pub struct IdeWebviews {
    open: Mutex<HashSet<String>>,
}

/// Webview label for a project. One per project => at most one IDE origin/folder.
fn label_for(project_id: &str) -> String {
    format!("ide-{project_id}")
}

fn bounds(x: f64, y: f64, width: f64, height: f64) -> Rect {
    Rect {
        position: Position::Logical(LogicalPosition { x, y }),
        size: Size::Logical(LogicalSize { width, height }),
    }
}

/// `http://127.0.0.1:<port>/?folder=<abs-path>` — serve-web opens the folder from
/// the query string (`--folder` is deprecated). `url` handles the encoding.
fn folder_url(port: u16, folder: &str) -> Result<Url, String> {
    let mut url =
        Url::parse(&format!("http://{SERVE_WEB_HOST}:{port}/")).map_err(|e| e.to_string())?;
    url.query_pairs_mut().append_pair("folder", folder);
    Ok(url)
}

/// Create the project's IDE webview over the given content rect, or, if it already
/// exists (re-activation), just reposition and show it. Requires the shared server
/// to be ready — the frontend calls `ensure_ide_server` first and waits.
#[tauri::command]
pub fn create_ide_webview(
    app: AppHandle,
    project_id: String,
    folder: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let label = label_for(&project_id);

    let already_open = app
        .state::<IdeWebviews>()
        .open
        .lock()
        .map_err(|e| e.to_string())?
        .contains(&project_id);
    if already_open {
        if let Some(webview) = app.get_webview(&label) {
            let _ = webview.set_bounds(bounds(x, y, width, height));
            let _ = webview.set_focus();
        }
        return Ok(());
    }

    let port = app
        .state::<VscodeServer>()
        .ready_port()
        .ok_or("the VS Code server is not ready")?;
    let url = folder_url(port, &folder)?;
    let window = app.get_window("main").ok_or("main window not found")?;

    let webview = window
        .add_child(
            WebviewBuilder::new(&label, WebviewUrl::External(url))
                // Tauri's OS-level drag-drop handler otherwise swallows `dragstart`
                // inside the webview, killing VS Code's file-explorer HTML5 DnD.
                .disable_drag_drop_handler()
                // Paint the webview dark before the first pixel, eliminating the
                // white flash while VS Code's own theme stylesheet loads.
                .initialization_script(
                    "document.documentElement.style.background='#1e2025';\
                     document.documentElement.style.colorScheme='dark';\
                     (function(){\
                       var z=1;\
                       window.addEventListener('keydown',function(e){\
                         if(!e.metaKey)return;\
                         if(e.key==='='||e.key==='+'){e.preventDefault();z=Math.min(z+0.1,3);document.documentElement.style.zoom=z;}\
                         else if(e.key==='-'){e.preventDefault();z=Math.max(z-0.1,0.3);document.documentElement.style.zoom=z;}\
                         else if(e.key==='0'){e.preventDefault();z=1;document.documentElement.style.zoom=1;}\
                       },true);\
                     })();",
                ),
            Position::Logical(LogicalPosition { x, y }),
            Size::Logical(LogicalSize { width, height }),
        )
        .map_err(|e| e.to_string())?;
    // macOS renders a freshly-added child blank until its bounds are set once more.
    let _ = webview.set_bounds(bounds(x, y, width, height));
    let _ = webview.set_focus();

    app.state::<IdeWebviews>()
        .open
        .lock()
        .map_err(|e| e.to_string())?
        .insert(project_id);
    Ok(())
}

/// Keep the webview aligned with its content rect as the window/layout changes.
/// A no-op if the webview does not exist (created lazily / already torn down).
#[tauri::command]
pub fn set_ide_bounds(
    app: AppHandle,
    project_id: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    if let Some(webview) = app.get_webview(&label_for(&project_id)) {
        webview
            .set_bounds(bounds(x, y, width, height))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Show the webview at the given rect when its IDE tab becomes active. The rect
/// arrives already corrected for the title bar (see the frontend), and bounds are
/// set before focus per the macOS blank-render workaround.
#[tauri::command]
pub fn show_ide_webview(
    app: AppHandle,
    project_id: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    if let Some(webview) = app.get_webview(&label_for(&project_id)) {
        webview
            .set_bounds(bounds(x, y, width, height))
            .map_err(|e| e.to_string())?;
        let _ = webview.set_focus();
    }
    Ok(())
}

/// Hide the webview by parking it far off-screen rather than calling `hide()`,
/// which is unreliable for child webviews on macOS (a hidden one can keep
/// painting over siblings). Its size is untouched so editor state — and unsaved
/// buffers — survive until `show` brings it back on-screen.
#[tauri::command]
pub fn hide_ide_webview(app: AppHandle, project_id: String) -> Result<(), String> {
    if let Some(webview) = app.get_webview(&label_for(&project_id)) {
        webview
            .set_position(Position::Logical(LogicalPosition {
                x: OFFSCREEN,
                y: OFFSCREEN,
            }))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Destroy the webview when its IDE tab is closed or the project is removed. When
/// the last IDE webview goes away, stop the shared server to reclaim its RAM.
#[tauri::command]
pub fn close_ide_webview(app: AppHandle, project_id: String) -> Result<(), String> {
    if let Some(webview) = app.get_webview(&label_for(&project_id)) {
        let _ = webview.close();
    }
    let empty = {
        let ide = app.state::<IdeWebviews>();
        let mut open = ide.open.lock().map_err(|e| e.to_string())?;
        open.remove(&project_id);
        open.is_empty()
    };
    if empty {
        app.state::<VscodeServer>().stop();
    }
    Ok(())
}
