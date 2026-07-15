mod archive;

use crate::state::{AppData, Settings, PROJECTS_FILE, SETTINGS_FILE};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::fmt;
use std::fs::{self, File};
use std::io::{self, Read};
use std::path::Path;

#[derive(Debug)]
pub struct BackupError(String);

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BackupSelection {
    pub projects: bool,
    pub preferences: bool,
    pub vscode_profile: bool,
    pub vscode_extensions: bool,
}

impl BackupSelection {
    #[cfg(test)]
    pub const fn all() -> Self {
        Self {
            projects: true,
            preferences: true,
            vscode_profile: true,
            vscode_extensions: true,
        }
    }

    const fn any(self) -> bool {
        self.projects || self.preferences || self.vscode_profile || self.vscode_extensions
    }

    fn includes(self, path: &Path) -> bool {
        let Some(name) = path.components().next().map(|part| part.as_os_str()) else {
            return false;
        };
        if name == PROJECTS_FILE {
            self.projects
        } else if name == "vscode-server-data" || name == "imported-user-settings.json" {
            self.vscode_profile
        } else if name == "extensions" {
            self.vscode_extensions
        } else {
            self.preferences
        }
    }
}

impl BackupError {
    pub(super) fn invalid(message: impl Into<String>) -> Self {
        Self(message.into())
    }
}

impl fmt::Display for BackupError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl std::error::Error for BackupError {}

impl From<io::Error> for BackupError {
    fn from(error: io::Error) -> Self {
        Self(error.to_string())
    }
}

impl From<serde_json::Error> for BackupError {
    fn from(error: serde_json::Error) -> Self {
        Self(error.to_string())
    }
}

impl From<zip::result::ZipError> for BackupError {
    fn from(error: zip::result::ZipError) -> Self {
        Self(error.to_string())
    }
}

pub struct ImportedBackup {
    pub app_data: AppData,
    pub settings: Settings,
}

pub fn export_backup(
    app_data_dir: &Path,
    destination: &Path,
    categories: BackupSelection,
) -> Result<(), BackupError> {
    if !categories.any() {
        return Err(BackupError::invalid("Select at least one backup category"));
    }
    let app_data_dir = app_data_dir.canonicalize()?;
    let destination_parent = destination
        .parent()
        .ok_or_else(|| BackupError::invalid("Backup destination has no parent directory"))?
        .canonicalize()?;
    if destination_parent.starts_with(&app_data_dir) {
        return Err(BackupError::invalid(
            "Choose a backup destination outside AntanI's data directory",
        ));
    }
    if categories.projects {
        read_json::<AppData>(&app_data_dir.join(PROJECTS_FILE))?;
    }
    if categories.preferences {
        read_json::<Settings>(&app_data_dir.join(SETTINGS_FILE))?;
    }

    let temporary = destination_parent.join(format!(".antani-backup-{}.tmp", uuid::Uuid::new_v4()));
    if let Err(error) = archive::write(&app_data_dir, &temporary, categories) {
        let _ = fs::remove_file(&temporary);
        return Err(error);
    }
    fs::rename(temporary, destination)?;
    Ok(())
}

pub fn validate_backup(archive_path: &Path) -> Result<(), BackupError> {
    archive::validate(archive_path).map(|_| ())
}

pub fn import_backup(
    app_data_dir: &Path,
    archive_path: &Path,
) -> Result<ImportedBackup, BackupError> {
    let parent = app_data_dir
        .parent()
        .ok_or_else(|| BackupError::invalid("AntanI data directory has no parent"))?;
    fs::create_dir_all(parent)?;
    let workspace = parent.join(format!(".antani-import-{}", uuid::Uuid::new_v4()));

    let categories = match archive::extract(archive_path, &workspace) {
        Ok(categories) => categories,
        Err(error) => {
            let _ = fs::remove_dir_all(&workspace);
            return Err(error);
        }
    };
    let staged_data = workspace.join(archive::DATA_DIR);
    let merged_data = workspace.join("merged");
    if app_data_dir.exists() {
        copy_managed_tree(app_data_dir, &merged_data)?;
    } else {
        fs::create_dir_all(&merged_data)?;
    }
    remove_selected(&merged_data, categories)?;
    if staged_data.exists() {
        copy_managed_tree(&staged_data, &merged_data)?;
    }
    let imported = ImportedBackup {
        app_data: read_json(&merged_data.join(PROJECTS_FILE))?,
        settings: read_json(&merged_data.join(SETTINGS_FILE))?,
    };
    let rollback = parent.join(format!(".antani-rollback-{}", uuid::Uuid::new_v4()));
    let had_existing_data = app_data_dir.exists();

    if had_existing_data {
        fs::rename(app_data_dir, &rollback)?;
    }
    if let Err(error) = fs::rename(&merged_data, app_data_dir) {
        if had_existing_data {
            fs::rename(&rollback, app_data_dir).map_err(|rollback_error| {
                BackupError::invalid(format!(
                    "Import failed: {error}. Restoring current data also failed: {rollback_error}"
                ))
            })?;
        }
        let _ = fs::remove_dir_all(&workspace);
        return Err(error.into());
    }

    let _ = fs::remove_dir_all(&rollback);
    let _ = fs::remove_dir_all(&workspace);
    Ok(imported)
}

fn copy_managed_tree(source: &Path, destination: &Path) -> Result<(), BackupError> {
    fs::create_dir_all(destination)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let relative = Path::new(&entry.file_name()).to_path_buf();
        if archive::is_excluded(&relative) {
            continue;
        }
        copy_entry(&entry.path(), &destination.join(relative))?;
    }
    Ok(())
}

fn copy_entry(source: &Path, destination: &Path) -> Result<(), BackupError> {
    let metadata = fs::symlink_metadata(source)?;
    if metadata.file_type().is_symlink() {
        return Err(BackupError::invalid(format!(
            "Cannot restore symbolic link {}",
            source.display()
        )));
    }
    if metadata.is_dir() {
        fs::create_dir_all(destination)?;
        for entry in fs::read_dir(source)? {
            let entry = entry?;
            copy_entry(&entry.path(), &destination.join(entry.file_name()))?;
        }
    } else if metadata.is_file() {
        fs::copy(source, destination)?;
        fs::set_permissions(destination, metadata.permissions())?;
    }
    Ok(())
}

fn remove_selected(root: &Path, categories: BackupSelection) -> Result<(), BackupError> {
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        if categories.includes(Path::new(&entry.file_name())) {
            let metadata = entry.metadata()?;
            if metadata.is_dir() {
                fs::remove_dir_all(entry.path())?;
            } else {
                fs::remove_file(entry.path())?;
            }
        }
    }
    Ok(())
}

pub(super) fn read_json<T: DeserializeOwned>(path: &Path) -> Result<T, BackupError> {
    let mut bytes = Vec::new();
    File::open(path)?.read_to_end(&mut bytes)?;
    Ok(serde_json::from_slice(&bytes)?)
}

#[cfg(test)]
#[path = "backup_tests.rs"]
mod tests;
