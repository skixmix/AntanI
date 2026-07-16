use std::process::Command;

/// Fallback for when there's no active project (so no in-app terminal tab to
/// run the upgrade in): opens Terminal.app and runs the Homebrew upgrade
/// there instead. Normal path is an in-app terminal tab (see StatusBar.tsx).
#[tauri::command]
pub fn run_brew_upgrade() -> Result<(), String> {
    let script = r#"tell application "Terminal"
    activate
    do script "brew update && brew upgrade --cask antani"
end tell"#;
    Command::new("osascript")
        .arg("-e")
        .arg(script)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}
