use super::{BackupError, BackupSelection};
use crate::state::{AppData, Settings, PROJECTS_FILE, SETTINGS_FILE};
use serde::{Deserialize, Serialize};
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read};
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

const SCHEMA_VERSION: u16 = 1;
const APP_ID: &str = "com.antani.app";
pub(super) const MANIFEST_FILE: &str = "manifest.json";
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
    let file = writer.finish()?;
    if file.metadata()?.len() > 4_294_967_295 {
        return Err(BackupError::invalid("Backup archive is too large"));
    }
    Ok(())
}

pub fn validate(source: &Path) -> Result<BackupSelection, BackupError> {
    super::archive_validation::preflight(source)?;
    let mut archive = ZipArchive::new(File::open(source)?)?;
    super::archive_validation::inspect(&mut archive)?;
    let categories = validate_manifest(super::archive_validation::read_json(
        &mut archive,
        MANIFEST_FILE,
        super::archive_validation::MAX_MANIFEST_SIZE,
    )?)?;
    validate_contents(&mut archive, categories)?;
    Ok(categories)
}

pub fn extract(source: &Path, destination: &Path) -> Result<BackupSelection, BackupError> {
    super::archive_validation::preflight(source)?;
    let mut archive = ZipArchive::new(File::open(source)?)?;
    super::archive_validation::inspect(&mut archive)?;
    let categories = validate_manifest(super::archive_validation::read_json(
        &mut archive,
        MANIFEST_FILE,
        super::archive_validation::MAX_MANIFEST_SIZE,
    )?)?;
    validate_contents(&mut archive, categories)?;
    fs::create_dir_all(destination)?;
    let mut total_size = 0u64;
    for index in 0..archive.len() {
        let entry = archive.by_index(index)?;
        let relative = entry
            .enclosed_name()
            .ok_or_else(|| BackupError::invalid("Backup contains an unsafe path"))?;
        if entry.is_dir() {
            ensure_directory(destination, &relative)?;
            continue;
        }
        if let Some(parent) = relative.parent() {
            ensure_directory(destination, parent)?;
        }
        let output = destination.join(&relative);
        let mode = entry.unix_mode();
        let expected_size = entry.size();
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&output)
            .map_err(|error| {
                if error.kind() == io::ErrorKind::AlreadyExists {
                    BackupError::invalid("Backup contains colliding paths")
                } else {
                    error.into()
                }
            })?;
        let copied = io::copy(&mut entry.take(expected_size + 1), &mut file)?;
        if copied != expected_size {
            return Err(BackupError::invalid(
                "Backup entry size does not match extracted data",
            ));
        }
        total_size = total_size
            .checked_add(copied)
            .ok_or_else(|| BackupError::invalid("Backup is too large"))?;
        if copied > super::archive_validation::MAX_ENTRY_SIZE
            || total_size > super::archive_validation::MAX_TOTAL_SIZE
        {
            return Err(BackupError::invalid("Backup is too large"));
        }
        if let Some(mode) = mode {
            fs::set_permissions(&output, fs::Permissions::from_mode(mode & 0o777))?;
        }
    }
    Ok(categories)
}

fn ensure_directory(root: &Path, relative: &Path) -> Result<(), BackupError> {
    let mut current = PathBuf::from(root);
    for component in relative.components() {
        let name = component.as_os_str();
        let next = current.join(name);
        match fs::create_dir(&next) {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {
                if !has_exact_entry(&current, name)? || !next.is_dir() {
                    return Err(BackupError::invalid("Backup contains colliding paths"));
                }
            }
            Err(error) => return Err(error.into()),
        }
        current = next;
    }
    Ok(())
}

fn has_exact_entry(parent: &Path, name: &std::ffi::OsStr) -> Result<bool, BackupError> {
    for entry in fs::read_dir(parent)? {
        if entry?.file_name() == name {
            return Ok(true);
        }
    }
    Ok(false)
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
        super::archive_validation::read_json::<AppData>(
            archive,
            &format!("{DATA_DIR}/{PROJECTS_FILE}"),
            super::archive_validation::MAX_JSON_SIZE,
        )?;
    }
    if categories.preferences {
        super::archive_validation::read_json::<Settings>(
            archive,
            &format!("{DATA_DIR}/{SETTINGS_FILE}"),
            super::archive_validation::MAX_JSON_SIZE,
        )?;
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
