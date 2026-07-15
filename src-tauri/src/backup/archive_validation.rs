use super::archive::{is_excluded, DATA_DIR, MANIFEST_FILE};
use super::BackupError;
use serde::de::DeserializeOwned;
use std::collections::HashSet;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;
use zip::ZipArchive;

pub const MAX_MANIFEST_SIZE: u64 = 64 * 1024;
pub const MAX_JSON_SIZE: u64 = 16 * 1024 * 1024;
pub const MAX_ENTRY_SIZE: u64 = 8 * 1024 * 1024 * 1024;
pub const MAX_TOTAL_SIZE: u64 = 32 * 1024 * 1024 * 1024;
const MAX_ENTRIES: usize = 50_000;
const MAX_CENTRAL_DIRECTORY_SIZE: u32 = 64 * 1024 * 1024;
const EOCD_SEARCH_SIZE: u64 = 65_557;
const EOCD_SIGNATURE: [u8; 4] = [0x50, 0x4b, 0x05, 0x06];
const CENTRAL_SIGNATURE: [u8; 4] = [0x50, 0x4b, 0x01, 0x02];
const MAX_ARCHIVE_SIZE: u64 = 4_294_967_295;
const RESERVED_NAMES: [&str; 7] = [
    "projects.json",
    "settings.json",
    "vscode-server-data",
    "imported-user-settings.json",
    "extensions",
    "vscode-server.pid",
    "diff-bridge-sockets",
];

pub fn preflight(path: &Path) -> Result<(), BackupError> {
    let mut file = File::open(path)?;
    let file_size = file.metadata()?.len();
    if file_size > MAX_ARCHIVE_SIZE {
        return Err(BackupError::invalid("Backup archive is too large"));
    }
    let search_size = file_size.min(EOCD_SEARCH_SIZE);
    let offset =
        i64::try_from(search_size).map_err(|error| BackupError::invalid(error.to_string()))?;
    file.seek(SeekFrom::End(-offset))?;
    let capacity =
        usize::try_from(search_size).map_err(|error| BackupError::invalid(error.to_string()))?;
    let mut tail = Vec::with_capacity(capacity);
    file.read_to_end(&mut tail)?;
    let tail_offset = file_size - search_size;
    let mut saw_zip64 = false;
    for position in tail
        .windows(4)
        .enumerate()
        .rev()
        .filter_map(|(position, bytes)| (bytes == EOCD_SIGNATURE).then_some(position))
    {
        let Some(record) = tail.get(position..position + 22) else {
            continue;
        };
        let comment_length = usize::from(u16::from_le_bytes([record[20], record[21]]));
        if position + 22 + comment_length != tail.len() {
            continue;
        }
        let disk = u16::from_le_bytes([record[4], record[5]]);
        let central_disk = u16::from_le_bytes([record[6], record[7]]);
        let disk_entries = u16::from_le_bytes([record[8], record[9]]);
        let total_entries = u16::from_le_bytes([record[10], record[11]]);
        let central_size = u32::from_le_bytes([record[12], record[13], record[14], record[15]]);
        let central_offset = u32::from_le_bytes([record[16], record[17], record[18], record[19]]);
        if total_entries == u16::MAX || central_size == u32::MAX || central_offset == u32::MAX {
            saw_zip64 = true;
            continue;
        }
        if disk != 0 || central_disk != 0 || disk_entries != total_entries {
            continue;
        }
        let eocd_offset = tail_offset
            + u64::try_from(position).map_err(|error| BackupError::invalid(error.to_string()))?;
        let central_end = u64::from(central_offset) + u64::from(central_size);
        if central_end != eocd_offset {
            continue;
        }
        if usize::from(total_entries) > MAX_ENTRIES || central_size > MAX_CENTRAL_DIRECTORY_SIZE {
            return Err(BackupError::invalid("Backup index is too large"));
        }
        if validate_central_directory(
            &mut file,
            u64::from(central_offset),
            central_size,
            usize::from(total_entries),
        )? {
            return Ok(());
        }
    }
    if saw_zip64 {
        return Err(BackupError::invalid("ZIP64 backups are not supported"));
    }
    Ok(())
}

fn validate_central_directory(
    file: &mut File,
    offset: u64,
    size: u32,
    expected_entries: usize,
) -> Result<bool, BackupError> {
    file.seek(SeekFrom::Start(offset))?;
    let length = usize::try_from(size).map_err(|error| BackupError::invalid(error.to_string()))?;
    let mut bytes = vec![0; length];
    file.read_exact(&mut bytes)?;
    let mut position = 0usize;
    let mut entries = 0usize;
    while position < bytes.len() {
        let Some(record) = bytes.get(position..position + 46) else {
            return Ok(false);
        };
        if record[0..4] != CENTRAL_SIGNATURE {
            return Ok(false);
        }
        let name_length = usize::from(u16::from_le_bytes([record[28], record[29]]));
        let extra_length = usize::from(u16::from_le_bytes([record[30], record[31]]));
        let comment_length = usize::from(u16::from_le_bytes([record[32], record[33]]));
        let record_length = 46usize
            .checked_add(name_length)
            .and_then(|length| length.checked_add(extra_length))
            .and_then(|length| length.checked_add(comment_length))
            .ok_or_else(|| BackupError::invalid("Backup index is invalid"))?;
        position = position
            .checked_add(record_length)
            .ok_or_else(|| BackupError::invalid("Backup index is invalid"))?;
        entries += 1;
        if entries > MAX_ENTRIES {
            return Err(BackupError::invalid("Backup contains too many entries"));
        }
    }
    Ok(position == bytes.len() && entries == expected_entries)
}

pub fn inspect(archive: &mut ZipArchive<File>) -> Result<(), BackupError> {
    if archive.len() > MAX_ENTRIES {
        return Err(BackupError::invalid("Backup contains too many entries"));
    }
    let mut paths = HashSet::new();
    let mut portable_paths = HashSet::new();
    let mut total_size = 0u64;
    for index in 0..archive.len() {
        let entry = archive.by_index(index)?;
        let path = entry
            .enclosed_name()
            .ok_or_else(|| BackupError::invalid("Backup contains an unsafe path"))?;
        total_size = total_size
            .checked_add(entry.size())
            .ok_or_else(|| BackupError::invalid("Backup is too large"))?;
        if entry.size() > MAX_ENTRY_SIZE || total_size > MAX_TOTAL_SIZE {
            return Err(BackupError::invalid("Backup is too large"));
        }
        let portable_path = path.to_string_lossy().to_lowercase();
        if !paths.insert(path.clone())
            || !portable_paths.insert(portable_path)
            || entry.is_symlink()
            || entry.encrypted()
        {
            return Err(BackupError::invalid("Backup contains an unsafe entry"));
        }
        validate_path(&path, entry.is_dir())?;
    }
    Ok(())
}

pub fn read_json<T: DeserializeOwned>(
    archive: &mut ZipArchive<File>,
    name: &str,
    limit: u64,
) -> Result<T, BackupError> {
    let entry = archive.by_name(name)?;
    if entry.size() > limit {
        return Err(BackupError::invalid("Backup metadata is too large"));
    }
    let mut bytes = Vec::new();
    entry.take(limit + 1).read_to_end(&mut bytes)?;
    let length =
        u64::try_from(bytes.len()).map_err(|error| BackupError::invalid(error.to_string()))?;
    if length > limit {
        return Err(BackupError::invalid("Backup metadata is too large"));
    }
    Ok(serde_json::from_slice(&bytes)?)
}

fn validate_path(path: &Path, is_directory: bool) -> Result<(), BackupError> {
    if path == Path::new(MANIFEST_FILE) {
        return if is_directory {
            Err(BackupError::invalid("Backup manifest must be a file"))
        } else {
            Ok(())
        };
    }
    let relative = path
        .strip_prefix(DATA_DIR)
        .map_err(|_| BackupError::invalid("Backup contains an unexpected file"))?;
    let mut components = relative.components();
    let first = components
        .next()
        .and_then(|component| component.as_os_str().to_str())
        .ok_or_else(|| BackupError::invalid("Backup contains an invalid path"))?;
    if is_excluded(relative) {
        return Err(BackupError::invalid("Backup contains an unexpected file"));
    }
    if RESERVED_NAMES
        .iter()
        .any(|reserved| first.eq_ignore_ascii_case(reserved) && first != *reserved)
    {
        return Err(BackupError::invalid(
            "Backup contains a case-conflicting reserved path",
        ));
    }
    let has_descendants = components.next().is_some();
    match first {
        "projects.json" | "settings.json" | "imported-user-settings.json"
            if is_directory || has_descendants =>
        {
            Err(BackupError::invalid("Backup contains an invalid file path"))
        }
        "vscode-server-data" | "extensions" if !has_descendants && !is_directory => Err(
            BackupError::invalid("Backup contains a directory stored as a file"),
        ),
        _ => Ok(()),
    }
}
