mod archive;
mod archive_validation;
mod transaction;

use crate::state::{AppData, Settings, PROJECTS_FILE, SETTINGS_FILE};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::fmt;
use std::fs::{self, File};
use std::io::{self, Read};
use std::path::Path;
use std::sync::{Mutex, MutexGuard};

#[cfg(test)]
use transaction::rollback_path;
pub use transaction::{import_backup, recover_interrupted_import};

#[derive(Debug)]
pub struct BackupError(String);

#[derive(Default)]
pub struct BackupMaintenance(Mutex<()>);

impl BackupMaintenance {
    pub fn lock(&self) -> Result<MutexGuard<'_, ()>, String> {
        self.0.lock().map_err(|error| error.to_string())
    }
}

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

    pub const fn includes_vscode(self) -> bool {
        self.vscode_profile || self.vscode_extensions
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

pub(super) fn read_json<T: DeserializeOwned>(path: &Path) -> Result<T, BackupError> {
    let mut bytes = Vec::new();
    File::open(path)?.read_to_end(&mut bytes)?;
    Ok(serde_json::from_slice(&bytes)?)
}

#[cfg(test)]
#[path = "backup_tests.rs"]
mod tests;
