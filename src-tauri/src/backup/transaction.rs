use super::{archive, read_json, BackupError, BackupSelection, ImportedBackup};
use crate::state::{PROJECTS_FILE, SETTINGS_FILE};
use std::fs;
use std::path::{Path, PathBuf};

struct Workspace(PathBuf);

impl Workspace {
    fn new(parent: &Path) -> Self {
        Self(parent.join(format!(".antani-import-{}", uuid::Uuid::new_v4())))
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for Workspace {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

pub fn import_backup(
    app_data_dir: &Path,
    archive_path: &Path,
) -> Result<ImportedBackup, BackupError> {
    let parent = app_data_dir
        .parent()
        .ok_or_else(|| BackupError::invalid("AntanI data directory has no parent"))?;
    fs::create_dir_all(parent)?;
    recover_interrupted_import(app_data_dir)?;
    let workspace = Workspace::new(parent);
    let categories = archive::extract(archive_path, workspace.path())?;
    let merged_data = workspace.path().join("merged");
    if app_data_dir.exists() {
        copy_managed_tree(app_data_dir, &merged_data)?;
    } else {
        fs::create_dir_all(&merged_data)?;
    }
    remove_selected(&merged_data, categories)?;
    let staged_data = workspace.path().join(archive::DATA_DIR);
    if staged_data.exists() {
        copy_managed_tree(&staged_data, &merged_data)?;
    }
    let imported = ImportedBackup {
        app_data: read_json(&merged_data.join(PROJECTS_FILE))?,
        settings: read_json(&merged_data.join(SETTINGS_FILE))?,
    };
    install_merged_data(app_data_dir, &merged_data)?;
    Ok(imported)
}

pub fn recover_interrupted_import(app_data_dir: &Path) -> Result<(), BackupError> {
    let rollback = rollback_path(app_data_dir)?;
    if !rollback.exists() {
        return Ok(());
    }
    if app_data_dir.exists() {
        fs::remove_dir_all(rollback)?;
    } else {
        fs::rename(rollback, app_data_dir)?;
    }
    Ok(())
}

pub(super) fn rollback_path(app_data_dir: &Path) -> Result<PathBuf, BackupError> {
    let parent = app_data_dir
        .parent()
        .ok_or_else(|| BackupError::invalid("AntanI data directory has no parent"))?;
    let name = app_data_dir
        .file_name()
        .ok_or_else(|| BackupError::invalid("AntanI data directory has no name"))?;
    Ok(parent.join(format!(".{}.rollback", name.to_string_lossy())))
}

fn install_merged_data(app_data_dir: &Path, merged_data: &Path) -> Result<(), BackupError> {
    let rollback = rollback_path(app_data_dir)?;
    let had_existing_data = app_data_dir.exists();
    if had_existing_data {
        fs::rename(app_data_dir, &rollback)?;
    }
    if let Err(error) = fs::rename(merged_data, app_data_dir) {
        if had_existing_data {
            fs::rename(&rollback, app_data_dir).map_err(|rollback_error| {
                BackupError::invalid(format!(
                    "Import failed: {error}. Restoring current data also failed: {rollback_error}"
                ))
            })?;
        }
        return Err(error.into());
    }
    if had_existing_data {
        let _ = fs::remove_dir_all(rollback);
    }
    Ok(())
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
