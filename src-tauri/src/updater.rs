use std::process::Command;

/// Opens Terminal.app and runs the Homebrew upgrade there, not in an AntanI
/// terminal tab: `brew upgrade --cask` quits the running app as part of the
/// upgrade, which would kill an in-app tab (and the command) mid-upgrade.
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
