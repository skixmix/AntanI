use std::io::Write;
use std::net::Shutdown;
use std::os::unix::net::UnixStream;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::state::AppState;
use crate::vscode_server::VscodeServer;

#[derive(Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
enum BridgeRequest<'a> {
    OpenDiff {
        file_path: &'a str,
    },
    OpenFile {
        file_path: &'a str,
        line: u32,
        column: u32,
    },
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedTerminalFile {
    file_path: String,
    project_id: Option<String>,
}

fn resolve_project_file_path(
    project_path: &Path,
    reference_path: &Path,
) -> Result<Option<PathBuf>, String> {
    let project = project_path.canonicalize().map_err(|e| e.to_string())?;
    if !project.is_dir() {
        return Err("Project path is not a directory".to_string());
    }
    let candidate = if reference_path.is_absolute() {
        reference_path.to_path_buf()
    } else {
        project.join(reference_path)
    };
    let file = match candidate.canonicalize() {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.to_string()),
    };
    Ok((file.is_file() && file.starts_with(&project)).then_some(file))
}

fn resolve_utf8_project_file(
    project_path: &str,
    file_path: &str,
) -> Result<Option<String>, String> {
    let resolved = resolve_project_file_path(Path::new(project_path), Path::new(file_path))?;
    resolved
        .map(|path| {
            path.to_str()
                .map(str::to_owned)
                .ok_or_else(|| "File path is not valid UTF-8".to_string())
        })
        .transpose()
}

fn resolve_terminal_file(
    current_project_path: &str,
    reference_path: &str,
    projects: &[(&str, &str)],
) -> Result<Option<ResolvedTerminalFile>, String> {
    let reference = Path::new(reference_path);
    if !reference.is_absolute() {
        let Some((project_id, _)) = projects
            .iter()
            .find(|(_, project_path)| *project_path == current_project_path)
        else {
            return Ok(None);
        };
        return resolve_utf8_project_file(current_project_path, reference_path).map(|file| {
            file.map(|file_path| ResolvedTerminalFile {
                file_path,
                project_id: Some((*project_id).to_owned()),
            })
        });
    }

    let file = match reference.canonicalize() {
        Ok(file) if file.is_file() => file,
        Ok(_) => return Ok(None),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.to_string()),
    };
    let project_id = projects
        .iter()
        .filter_map(|(project_id, project_path)| {
            Path::new(project_path)
                .canonicalize()
                .ok()
                .filter(|project| project.is_dir() && file.starts_with(project))
                .map(|project| (*project_id, project.components().count()))
        })
        .max_by_key(|(_, depth)| *depth)
        .map(|(project_id, _)| project_id.to_owned());
    let file_path = file
        .to_str()
        .map(str::to_owned)
        .ok_or_else(|| "File path is not valid UTF-8".to_string())?;

    Ok(Some(ResolvedTerminalFile {
        file_path,
        project_id,
    }))
}

fn send_bridge_request(
    server: &VscodeServer,
    project_path: &str,
    request: &BridgeRequest<'_>,
) -> Result<(), String> {
    let socket = server.bridge_socket_path_for(project_path);
    let mut connection =
        UnixStream::connect(&socket).map_err(|e| format!("IDE not ready yet: {e}"))?;
    let payload = serde_json::to_vec(request).map_err(|e| e.to_string())?;
    connection.write_all(&payload).map_err(|e| e.to_string())?;
    connection
        .shutdown(Shutdown::Write)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn resolve_terminal_file_link(
    state: State<AppState>,
    current_project_path: String,
    reference_path: String,
) -> Result<Option<ResolvedTerminalFile>, String> {
    let data = state.data.lock().map_err(|error| error.to_string())?;
    let projects = data
        .projects
        .iter()
        .map(|project| (project.id.as_str(), project.path.as_str()))
        .collect::<Vec<_>>();
    resolve_terminal_file(&current_project_path, &reference_path, &projects)
}

#[tauri::command]
pub fn open_diff_in_ide(
    app: AppHandle,
    project_path: String,
    file_path: String,
) -> Result<(), String> {
    let file = resolve_utf8_project_file(&project_path, &file_path)?
        .ok_or_else(|| "File is outside the project or does not exist".to_string())?;
    send_bridge_request(
        &app.state::<VscodeServer>(),
        &project_path,
        &BridgeRequest::OpenDiff { file_path: &file },
    )
}

#[tauri::command]
pub fn open_file_in_ide(
    app: AppHandle,
    project_path: String,
    file_path: String,
    line: u32,
    column: u32,
) -> Result<(), String> {
    if line == 0 || column == 0 {
        return Err("Line and column must be positive".to_string());
    }
    let file = resolve_utf8_project_file(&project_path, &file_path)?
        .ok_or_else(|| "File is outside the project or does not exist".to_string())?;
    send_bridge_request(
        &app.state::<VscodeServer>(),
        &project_path,
        &BridgeRequest::OpenFile {
            file_path: &file,
            line,
            column,
        },
    )
}

#[cfg(test)]
mod tests;
