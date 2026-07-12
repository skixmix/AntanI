use std::process::Command;

/// macOS's built-in alert sounds, from `/System/Library/Sounds`. Used as an
/// allow-list so `name` never reaches a shell/file path unvalidated.
const SYSTEM_SOUNDS: &[&str] = &[
    "Basso",
    "Blow",
    "Bottle",
    "Frog",
    "Funk",
    "Glass",
    "Hero",
    "Morse",
    "Ping",
    "Pop",
    "Purr",
    "Sosumi",
    "Submarine",
    "Tink",
];

#[tauri::command]
pub fn play_system_sound(name: String) -> Result<(), String> {
    if !SYSTEM_SOUNDS.contains(&name.as_str()) {
        return Err(format!("unknown system sound: {name}"));
    }
    Command::new("afplay")
        .arg(format!("/System/Library/Sounds/{name}.aiff"))
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}
