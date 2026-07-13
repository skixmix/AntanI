use tauri::menu::{Menu, SubmenuBuilder};
use tauri::{AppHandle, Wry};

/// The app menu deliberately has no Edit ▸ Undo/Redo. On macOS the main menu
/// gets `performKeyEquivalent:` before web content, so a native Undo item would
/// capture Cmd+Z / Cmd+Shift+Z and route them to WebKit's own undo manager,
/// which knows nothing about the embedded VS Code editor's undo stack. Leaving
/// those items out lets the keystrokes reach the webview so Monaco handles them.
/// Cut/Copy/Paste stay, since their selectors do fire DOM events Monaco honors.
pub fn build(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let app_menu = SubmenuBuilder::new(app, "AntanI")
        .about(None)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    let window_menu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .separator()
        .close_window()
        .build()?;

    Menu::with_items(app, &[&app_menu, &edit_menu, &window_menu])
}
