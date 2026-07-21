use tauri::menu::{Menu, Submenu, SubmenuBuilder};
use tauri::{AppHandle, Wry};

/// The app menu is swapped depending on which surface is focused, because on
/// macOS the main menu receives `performKeyEquivalent:` before web content: any
/// item whose accelerator matches a keystroke consumes it before the focused
/// webview — including the embedded VS Code child — ever sees it. The IDE
/// lifecycle in `ide_webview.rs` installs `build` or `build_ide` as the IDE
/// webview gains/loses focus.
///
/// - `build` — active while the main React UI is focused. It carries the full
///   Edit accelerators (Undo/Redo/Cut/Copy/Paste/Select All). macOS WKWebView
///   needs those native items for undo, clipboard, and select-all to work in the
///   UI's own text fields.
/// - `build_ide` — active while the embedded VS Code webview is focused. It drops
///   Undo/Redo and Select All so Cmd+Z / Cmd+Shift+Z / Cmd+A fall through to
///   Monaco's own handlers. Cut/Copy/Paste stay: WKWebView still needs their
///   native `cut:`/`copy:`/`paste:` selectors for clipboard inside VS Code
///   (dropping them breaks paste), and those selectors fire DOM events Monaco
///   honors. Unavoidable cost: while the IDE is focused, Cmd+K chords whose second
///   stroke is Cmd+C/X/V (e.g. Cmd+K Cmd+C = Add Line Comment) stay shadowed by
///   those accelerators — Cmd+/ toggles comments and is unaffected.
fn app_submenu(app: &AppHandle) -> tauri::Result<Submenu<Wry>> {
    SubmenuBuilder::new(app, "AntanI")
        .about(None)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()
}

fn window_submenu(app: &AppHandle) -> tauri::Result<Submenu<Wry>> {
    SubmenuBuilder::new(app, "Window")
        .minimize()
        .separator()
        .close_window()
        .build()
}

/// Full menu, used while the main React UI is focused.
pub fn build(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .separator()
        .select_all()
        .build()?;

    Menu::with_items(
        app,
        &[&app_submenu(app)?, &edit_menu, &window_submenu(app)?],
    )
}

/// Reduced menu, used while the embedded VS Code webview is focused: no Undo/Redo
/// or Select All (so those keystrokes reach Monaco), clipboard items kept.
pub fn build_ide(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .cut()
        .copy()
        .paste()
        .build()?;

    Menu::with_items(
        app,
        &[&app_submenu(app)?, &edit_menu, &window_submenu(app)?],
    )
}
