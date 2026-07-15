use super::{BackupError, BackupSelection};
use crate::state::{AppData, Settings, PROJECTS_FILE, SETTINGS_FILE};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{self, Read};
use std::os::unix::fs::PermissionsExt;
use std::path::Path;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

const SCHEMA_VERSION: u16 = 1;
const APP_ID: &str = "com.antani.app";
const MANIFEST_FILE: &str = "manifest.json";
pub const DATA_DIR: &str = "data";
const EXCLUDED_NAMES: [&str; 2] = ["vscode-server.pid", "diff-bridge-sockets"];

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BackupManifest {
    schema_version: u16,
    app_id: String,
    app_version: String,
    categories: BackupSelection,
}

pub fn write(
    source: &Path,
    destination: &Path,
    categories: BackupSelection,
) -> Result<(), BackupError> {
    let mut writer = ZipWriter::new(File::create(destination)?);
    let options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o644);
    writer.start_file(MANIFEST_FILE, options)?;
    serde_json::to_writer_pretty(
        &mut writer,
        &BackupManifest {
            schema_version: SCHEMA_VERSION,
            app_id: APP_ID.into(),
            app_version: env!("CARGO_PKG_VERSION").into(),
            categories,
        },
    )?;
    add_tree(&mut writer, source, source, categories)?;
    writer.finish()?;
    Ok(())
}

pub fn validate(source: &Path) -> Result<BackupSelection, BackupError> {
    let mut archive = ZipArchive::new(File::open(source)?)?;
    inspect_entries(&mut archive)?;
    let categories = validate_manifest(read_entry_json(&mut archive, MANIFEST_FILE)?)?;
    validate_contents(&mut archive, categories)?;
    Ok(categories)
}

pub fn extract(source: &Path, destination: &Path) -> Result<BackupSelection, BackupError> {
    let mut archive = ZipArchive::new(File::open(source)?)?;
    inspect_entries(&mut archive)?;
    let categories = validate_manifest(read_entry_json(&mut archive, MANIFEST_FILE)?)?;
    validate_contents(&mut archive, categories)?;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index)?;
        let relative = entry
            .enclosed_name()
            .ok_or_else(|| BackupError::invalid("Backup contains an unsafe path"))?;
        let output = destination.join(relative);
        if entry.is_dir() {
            fs::create_dir_all(&output)?;
            continue;
        }
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut file = File::create(&output)?;
        io::copy(&mut entry, &mut file)?;
        if let Some(mode) = entry.unix_mode() {
            fs::set_permissions(&output, fs::Permissions::from_mode(mode & 0o777))?;
        }
    }
    Ok(categories)
}

fn add_tree(
    writer: &mut ZipWriter<File>,
    root: &Path,
    current: &Path,
    categories: BackupSelection,
) -> Result<(), BackupError> {
    for entry in fs::read_dir(current)? {
        let path = entry?.path();
        let relative = path
            .strip_prefix(root)
            .map_err(|error| BackupError::invalid(error.to_string()))?;
        if is_excluded(relative) || !categories.includes(relative) {
            continue;
        }
        let metadata = fs::symlink_metadata(&path)?;
        if metadata.file_type().is_symlink() {
            return Err(BackupError::invalid(format!(
                "Cannot back up symbolic link {}",
                path.display()
            )));
        }
        let name = archive_name(relative)?;
        let options = SimpleFileOptions::default()
            .compression_method(CompressionMethod::Deflated)
            .large_file(metadata.len() > u32::MAX.into())
            .unix_permissions(metadata.permissions().mode() & 0o777);
        if metadata.is_dir() {
            writer.add_directory(format!("{DATA_DIR}/{name}/"), options)?;
            add_tree(writer, root, &path, categories)?;
        } else if metadata.is_file() {
            writer.start_file(format!("{DATA_DIR}/{name}"), options)?;
            io::copy(&mut File::open(path)?, writer)?;
        }
    }
    Ok(())
}

fn inspect_entries(archive: &mut ZipArchive<File>) -> Result<(), BackupError> {
    let mut paths = HashSet::new();
    for index in 0..archive.len() {
        let entry = archive.by_index(index)?;
        let path = entry
            .enclosed_name()
            .ok_or_else(|| BackupError::invalid("Backup contains an unsafe path"))?;
        if !paths.insert(path.clone()) || entry.is_symlink() || entry.encrypted() {
            return Err(BackupError::invalid("Backup contains an unsafe entry"));
        }
        if !is_allowed_archive_path(&path) {
            return Err(BackupError::invalid("Backup contains an unexpected file"));
        }
    }
    Ok(())
}

fn read_entry(archive: &mut ZipArchive<File>, name: &str) -> Result<Vec<u8>, BackupError> {
    let mut bytes = Vec::new();
    archive.by_name(name)?.read_to_end(&mut bytes)?;
    Ok(bytes)
}

fn read_entry_json<T: DeserializeOwned>(
    archive: &mut ZipArchive<File>,
    name: &str,
) -> Result<T, BackupError> {
    Ok(serde_json::from_slice(&read_entry(archive, name)?)?)
}

fn validate_manifest(manifest: BackupManifest) -> Result<BackupSelection, BackupError> {
    if manifest.schema_version == SCHEMA_VERSION
        && manifest.app_id == APP_ID
        && manifest.categories.any()
    {
        Ok(manifest.categories)
    } else {
        Err(BackupError::invalid(
            "This is not a supported AntanI backup",
        ))
    }
}

fn validate_contents(
    archive: &mut ZipArchive<File>,
    categories: BackupSelection,
) -> Result<(), BackupError> {
    for index in 0..archive.len() {
        let entry = archive.by_index(index)?;
        let path = entry
            .enclosed_name()
            .ok_or_else(|| BackupError::invalid("Backup contains an unsafe path"))?;
        if let Ok(relative) = path.strip_prefix(DATA_DIR) {
            if !categories.includes(relative) {
                return Err(BackupError::invalid(
                    "Backup contains data outside its declared categories",
                ));
            }
        }
    }
    if categories.projects {
        read_entry_json::<AppData>(archive, &format!("{DATA_DIR}/{PROJECTS_FILE}"))?;
    }
    if categories.preferences {
        read_entry_json::<Settings>(archive, &format!("{DATA_DIR}/{SETTINGS_FILE}"))?;
    }
    Ok(())
}

fn archive_name(path: &Path) -> Result<String, BackupError> {
    path.to_str()
        .map(|name| name.replace(std::path::MAIN_SEPARATOR, "/"))
        .ok_or_else(|| BackupError::invalid(format!("Path is not valid UTF-8: {}", path.display())))
}

pub(super) fn is_excluded(path: &Path) -> bool {
    path.components().next().is_some_and(|component| {
        EXCLUDED_NAMES.contains(&component.as_os_str().to_string_lossy().as_ref())
    })
}

fn is_allowed_archive_path(path: &Path) -> bool {
    path == Path::new(MANIFEST_FILE)
        || path
            .strip_prefix(DATA_DIR)
            .is_ok_and(|relative| !relative.as_os_str().is_empty() && !is_excluded(relative))
}
