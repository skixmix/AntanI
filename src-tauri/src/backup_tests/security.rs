use super::*;
use std::io::Write;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

fn write_archive(
    path: &Path,
    manifest: &[u8],
    entries: &[(&str, &[u8])],
) -> Result<(), BackupError> {
    let mut writer = ZipWriter::new(fs::File::create(path)?);
    let options = SimpleFileOptions::default();
    writer.start_file("manifest.json", options)?;
    writer.write_all(manifest)?;
    for (name, contents) in entries {
        writer.start_file(*name, options)?;
        writer.write_all(contents)?;
    }
    writer.finish()?;
    Ok(())
}

#[test]
fn backup_rejects_case_insensitive_reserved_path_aliases() -> Result<(), BackupError> {
    let archive = temp_path("case-alias.antani-backup");
    let manifest = br#"{"schemaVersion":1,"appId":"com.antani.app","appVersion":"0.7.4","categories":{"projects":false,"preferences":true,"vscodeProfile":false,"vscodeExtensions":false}}"#;
    write_archive(
        &archive,
        manifest,
        &[
            ("data/settings.json", br#"{}"#),
            ("data/PROJECTS.JSON", br#"{}"#),
        ],
    )?;

    assert!(validate_backup(&archive).is_err());

    let _ = fs::remove_file(archive);
    Ok(())
}

#[test]
fn backup_rejects_reserved_directory_stored_as_file() -> Result<(), BackupError> {
    let archive = temp_path("path-type.antani-backup");
    let manifest = br#"{"schemaVersion":1,"appId":"com.antani.app","appVersion":"0.7.4","categories":{"projects":false,"preferences":false,"vscodeProfile":true,"vscodeExtensions":false}}"#;
    write_archive(
        &archive,
        manifest,
        &[("data/vscode-server-data", b"not a directory")],
    )?;

    assert!(validate_backup(&archive).is_err());

    let _ = fs::remove_file(archive);
    Ok(())
}

#[test]
fn backup_rejects_oversized_manifest() -> Result<(), BackupError> {
    let archive = temp_path("large-manifest.antani-backup");
    let manifest = serde_json::to_vec(&serde_json::json!({
        "schemaVersion": 1,
        "appId": "com.antani.app",
        "appVersion": "x".repeat(70_000),
        "categories": {
            "projects": false,
            "preferences": true,
            "vscodeProfile": false,
            "vscodeExtensions": false
        }
    }))?;
    write_archive(&archive, &manifest, &[("data/settings.json", br#"{}"#)])?;

    assert!(validate_backup(&archive).is_err());

    let _ = fs::remove_file(archive);
    Ok(())
}

#[test]
fn backup_rejects_portability_collisions() -> Result<(), BackupError> {
    let archive = temp_path("portable-collision.antani-backup");
    let manifest = br#"{"schemaVersion":1,"appId":"com.antani.app","appVersion":"0.7.4","categories":{"projects":false,"preferences":true,"vscodeProfile":false,"vscodeExtensions":false}}"#;
    write_archive(
        &archive,
        manifest,
        &[
            ("data/settings.json", br#"{}"#),
            ("data/future.json", b"first"),
            ("data/FUTURE.JSON", b"second"),
        ],
    )?;

    assert!(validate_backup(&archive).is_err());

    let _ = fs::remove_file(archive);
    Ok(())
}

#[test]
fn interrupted_import_restores_the_previous_app_data() -> Result<(), BackupError> {
    let app_data = temp_path("recovery-target");
    let rollback = rollback_path(&app_data)?;
    fs::create_dir_all(&rollback)?;
    fs::write(rollback.join("marker"), b"previous data")?;

    recover_interrupted_import(&app_data)?;

    assert_eq!(fs::read(app_data.join("marker"))?, b"previous data");
    assert!(!rollback.exists());

    let _ = fs::remove_dir_all(app_data);
    Ok(())
}

#[test]
fn fake_eocd_in_comment_cannot_bypass_index_limits() -> Result<(), BackupError> {
    let archive = temp_path("fake-eocd.antani-backup");
    let mut writer = ZipWriter::new(fs::File::create(&archive)?);
    writer.set_comment("PK\u{5}\u{6}\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0")?;
    let options = SimpleFileOptions::default();
    for index in 0..=50_000 {
        writer.start_file(format!("data/future/{index}"), options)?;
    }
    writer.finish()?;

    assert!(super::super::archive_validation::preflight(&archive).is_err());

    let _ = fs::remove_file(archive);
    Ok(())
}
