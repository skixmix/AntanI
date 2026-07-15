use super::*;
use crate::state::{self, AppData, Settings};
use std::fs;
use std::path::{Path, PathBuf};

#[path = "backup_tests/security.rs"]
mod security;

fn temp_path(label: &str) -> PathBuf {
    std::env::temp_dir().join(format!("antani-{label}-{}", uuid::Uuid::new_v4()))
}

fn write_fixture(root: &Path) -> Result<(AppData, Settings), BackupError> {
    let mut app_data = AppData::default();
    app_data.add_project(
        "/Users/foo/project".into(),
        "Project".into(),
        "#3b82f6".into(),
    );
    let settings = Settings {
        terminal_font_size: 18,
        ..Settings::default()
    };

    state::save(&root.join(state::PROJECTS_FILE), &app_data)?;
    state::save(&root.join(state::SETTINGS_FILE), &settings)?;
    fs::create_dir_all(root.join("vscode-server-data/User/snippets"))?;
    fs::write(
        root.join("vscode-server-data/User/settings.json"),
        br#"{"editor.fontSize":15}"#,
    )?;
    fs::write(
        root.join("vscode-server-data/User/snippets/rust.json"),
        br##"{"test":{"prefix":"test","body":"#[test]"}}"##,
    )?;
    fs::create_dir_all(root.join("extensions/example.extension-1.0.0"))?;
    fs::write(
        root.join("extensions/example.extension-1.0.0/package.json"),
        br#"{"name":"example.extension"}"#,
    )?;
    fs::write(root.join("vscode-server.pid"), b"1234")?;
    fs::create_dir_all(root.join("diff-bridge-sockets"))?;
    fs::write(root.join("diff-bridge-sockets/stale.sock"), b"stale")?;

    Ok((app_data, settings))
}

#[test]
fn backup_round_trip_restores_all_managed_files() -> Result<(), BackupError> {
    let source = temp_path("backup-source");
    let target = temp_path("backup-target");
    let archive = temp_path("backup.antani-backup");
    let (expected_app_data, expected_settings) = write_fixture(&source)?;
    fs::create_dir_all(&target)?;
    fs::write(target.join("old-file"), b"replace me")?;

    export_backup(&source, &archive, BackupSelection::all())?;
    let imported = import_backup(&target, &archive)?;

    assert_eq!(imported.app_data, expected_app_data);
    assert_eq!(imported.settings, expected_settings);
    assert!(target
        .join("vscode-server-data/User/settings.json")
        .is_file());
    assert!(target
        .join("vscode-server-data/User/snippets/rust.json")
        .is_file());
    assert!(target
        .join("extensions/example.extension-1.0.0/package.json")
        .is_file());
    assert!(!target.join("old-file").exists());
    assert!(!target.join("vscode-server.pid").exists());
    assert!(!target.join("diff-bridge-sockets").exists());

    let _ = fs::remove_dir_all(source);
    let _ = fs::remove_dir_all(target);
    let _ = fs::remove_file(archive);
    Ok(())
}

#[test]
fn selective_backup_replaces_projects_and_extensions_only() -> Result<(), BackupError> {
    let source = temp_path("selective-source");
    let target = temp_path("selective-target");
    let archive = temp_path("selective.antani-backup");
    let (expected_app_data, _) = write_fixture(&source)?;
    let (_, mut expected_settings) = write_fixture(&target)?;
    expected_settings.terminal_font_size = 24;
    state::save(&target.join(state::SETTINGS_FILE), &expected_settings)?;
    fs::write(
        target.join("vscode-server-data/User/settings.json"),
        b"target profile",
    )?;
    fs::write(
        target.join("extensions/example.extension-1.0.0/package.json"),
        b"target extension",
    )?;
    fs::write(target.join("future-setting.json"), b"target future setting")?;

    export_backup(
        &source,
        &archive,
        BackupSelection {
            projects: true,
            preferences: false,
            vscode_profile: false,
            vscode_extensions: true,
        },
    )?;
    let imported = import_backup(&target, &archive)?;

    assert_eq!(imported.app_data, expected_app_data);
    assert_eq!(imported.settings, expected_settings);
    assert_eq!(
        fs::read(target.join("vscode-server-data/User/settings.json"))?,
        b"target profile"
    );
    assert_eq!(
        fs::read(target.join("extensions/example.extension-1.0.0/package.json"))?,
        br#"{"name":"example.extension"}"#
    );
    assert_eq!(
        fs::read(target.join("future-setting.json"))?,
        b"target future setting"
    );

    let _ = fs::remove_dir_all(source);
    let _ = fs::remove_dir_all(target);
    let _ = fs::remove_file(archive);
    Ok(())
}

#[test]
fn preferences_include_future_files_and_profile_is_independent() -> Result<(), BackupError> {
    let source = temp_path("preferences-source");
    let target = temp_path("preferences-target");
    let archive = temp_path("preferences.antani-backup");
    let (_, expected_settings) = write_fixture(&source)?;
    let (mut expected_app_data, _) = write_fixture(&target)?;
    expected_app_data.add_project(
        "/Users/foo/target".into(),
        "Target".into(),
        "#22c55e".into(),
    );
    state::save(&target.join(state::PROJECTS_FILE), &expected_app_data)?;
    fs::write(source.join("future-setting.json"), b"source future setting")?;
    fs::write(
        target.join("vscode-server-data/User/settings.json"),
        b"target profile",
    )?;
    fs::write(
        target.join("extensions/example.extension-1.0.0/package.json"),
        b"target extension",
    )?;
    fs::write(target.join("future-setting.json"), b"target future setting")?;

    export_backup(
        &source,
        &archive,
        BackupSelection {
            projects: false,
            preferences: true,
            vscode_profile: true,
            vscode_extensions: false,
        },
    )?;
    let imported = import_backup(&target, &archive)?;

    assert_eq!(imported.app_data, expected_app_data);
    assert_eq!(imported.settings, expected_settings);
    assert_eq!(
        fs::read(target.join("future-setting.json"))?,
        b"source future setting"
    );
    assert_eq!(
        fs::read(target.join("vscode-server-data/User/settings.json"))?,
        br#"{"editor.fontSize":15}"#
    );
    assert_eq!(
        fs::read(target.join("extensions/example.extension-1.0.0/package.json"))?,
        b"target extension"
    );

    let _ = fs::remove_dir_all(source);
    let _ = fs::remove_dir_all(target);
    let _ = fs::remove_file(archive);
    Ok(())
}

#[test]
fn invalid_backup_leaves_current_data_untouched() -> Result<(), BackupError> {
    let target = temp_path("invalid-target");
    let archive = temp_path("invalid.antani-backup");
    fs::create_dir_all(&target)?;
    fs::write(target.join("marker"), b"keep me")?;
    fs::write(&archive, b"not a backup")?;

    assert!(import_backup(&target, &archive).is_err());
    assert_eq!(fs::read(target.join("marker"))?, b"keep me");

    let _ = fs::remove_dir_all(target);
    let _ = fs::remove_file(archive);
    Ok(())
}
