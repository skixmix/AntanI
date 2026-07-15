use super::*;
use crate::vscode_server::VscodeServer;
use std::fs;
use std::os::unix::fs::symlink;
use std::os::unix::net::UnixListener;

struct TestDir(PathBuf);

impl TestDir {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!("antani-ide-bridge-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }
}

impl Drop for TestDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn resolves_existing_project_relative_file() {
    let root = TestDir::new();
    let source = root.0.join("src/main.ts");
    fs::create_dir_all(source.parent().unwrap()).unwrap();
    fs::write(&source, "export {};").unwrap();
    let project_path = root.0.to_string_lossy().into_owned();
    let projects = [("current", project_path.as_str())];

    let resolved = resolve_terminal_file(&project_path, "src/main.ts", &projects).unwrap();

    assert_eq!(
        resolved,
        Some(ResolvedTerminalFile {
            file_path: source
                .canonicalize()
                .unwrap()
                .to_string_lossy()
                .into_owned(),
            project_id: Some("current".to_string()),
        })
    );
}

#[test]
fn resolves_absolute_file_in_another_registered_project() {
    let root = TestDir::new();
    let other = TestDir::new();
    let file = other.0.join("src/main.ts");
    fs::create_dir_all(file.parent().unwrap()).unwrap();
    fs::write(&file, "secret").unwrap();
    let current_project_path = root.0.to_string_lossy().into_owned();
    let other_project_path = other.0.to_string_lossy().into_owned();
    let projects = [
        ("current", current_project_path.as_str()),
        ("other", other_project_path.as_str()),
    ];

    let resolved =
        resolve_terminal_file(&current_project_path, &file.to_string_lossy(), &projects).unwrap();

    assert_eq!(
        resolved,
        Some(ResolvedTerminalFile {
            file_path: file.canonicalize().unwrap().to_string_lossy().into_owned(),
            project_id: Some("other".to_string()),
        })
    );
}

#[test]
fn resolves_absolute_file_outside_registered_projects_for_finder() {
    let root = TestDir::new();
    let outside = TestDir::new();
    let file = outside.0.join("notes.txt");
    fs::write(&file, "notes").unwrap();

    let resolved =
        resolve_terminal_file(&root.0.to_string_lossy(), &file.to_string_lossy(), &[]).unwrap();

    assert_eq!(
        resolved,
        Some(ResolvedTerminalFile {
            file_path: file.canonicalize().unwrap().to_string_lossy().into_owned(),
            project_id: None,
        })
    );
}

#[test]
fn rejects_symlinks_that_escape_project() {
    let root = TestDir::new();
    let outside = TestDir::new();
    let file = outside.0.join("secret.ts");
    fs::write(&file, "secret").unwrap();
    let link = root.0.join("linked.ts");
    symlink(&file, &link).unwrap();

    let resolved = resolve_terminal_file(
        &root.0.to_string_lossy(),
        link.file_name().unwrap().to_str().unwrap(),
        &[("current", &root.0.to_string_lossy())],
    )
    .unwrap();

    assert_eq!(resolved, None);
}

#[test]
fn rejects_project_path_that_is_not_a_directory() {
    let root = TestDir::new();
    let not_a_dir = root.0.join("file.txt");
    fs::write(&not_a_dir, "not a directory").unwrap();

    let error = resolve_project_file_path(&not_a_dir, Path::new("main.ts")).unwrap_err();

    assert_eq!(error, "Project path is not a directory");
}

#[test]
fn resolves_absolute_reference_inside_the_project() {
    let root = TestDir::new();
    let source = root.0.join("main.ts");
    fs::write(&source, "export {};").unwrap();

    let resolved = resolve_project_file_path(&root.0, &source).unwrap();

    assert_eq!(resolved, Some(source.canonicalize().unwrap()));
}

#[test]
fn resolve_project_file_path_reports_non_not_found_errors() {
    let root = TestDir::new();
    let too_long_name = "x".repeat(500);

    let error = resolve_project_file_path(&root.0, Path::new(&too_long_name)).unwrap_err();

    assert!(!error.is_empty());
}

#[test]
fn resolve_terminal_file_reports_non_not_found_errors_for_absolute_paths() {
    let root = TestDir::new();
    let too_long_absolute = format!("/{}", "x".repeat(500));

    let error =
        resolve_terminal_file(&root.0.to_string_lossy(), &too_long_absolute, &[]).unwrap_err();

    assert!(!error.is_empty());
}

#[test]
fn returns_none_when_relative_reference_does_not_exist() {
    let root = TestDir::new();

    let resolved = resolve_project_file_path(&root.0, Path::new("missing.ts")).unwrap();

    assert_eq!(resolved, None);
}

#[test]
fn returns_none_when_current_project_is_not_registered() {
    let root = TestDir::new();
    let project_path = root.0.to_string_lossy().into_owned();

    let resolved = resolve_terminal_file(&project_path, "src/main.ts", &[]).unwrap();

    assert_eq!(resolved, None);
}

#[test]
fn returns_none_when_absolute_reference_is_a_directory() {
    let root = TestDir::new();
    let dir = root.0.join("subdir");
    fs::create_dir_all(&dir).unwrap();

    let resolved =
        resolve_terminal_file(&root.0.to_string_lossy(), &dir.to_string_lossy(), &[]).unwrap();

    assert_eq!(resolved, None);
}

#[test]
fn returns_none_when_absolute_reference_does_not_exist() {
    let root = TestDir::new();
    let missing = root.0.join("missing.ts");

    let resolved =
        resolve_terminal_file(&root.0.to_string_lossy(), &missing.to_string_lossy(), &[]).unwrap();

    assert_eq!(resolved, None);
}

#[test]
fn resolve_utf8_project_file_reports_missing_project_directory() {
    let root = TestDir::new();
    let missing_project = root.0.join("does-not-exist");

    let error =
        resolve_utf8_project_file(&missing_project.to_string_lossy(), "main.ts").unwrap_err();

    assert!(!error.is_empty());
}

#[test]
fn send_bridge_request_errors_when_ide_is_not_listening() {
    let root = TestDir::new();
    let server = VscodeServer::new(root.0.clone());

    let error = send_bridge_request(
        &server,
        &root.0.to_string_lossy(),
        &BridgeRequest::OpenDiff {
            file_path: "src/main.ts",
        },
    )
    .unwrap_err();

    assert!(error.contains("IDE not ready yet"));
}

#[test]
fn send_bridge_request_writes_payload_to_the_project_socket() {
    let app_data_dir =
        std::path::PathBuf::from("/tmp").join(format!("antani-t{}", std::process::id()));
    let _ = fs::remove_dir_all(&app_data_dir);
    let server = VscodeServer::new(app_data_dir.clone());
    let project_path = "/project".to_string();
    let socket_path = server.bridge_socket_path_for(&project_path);
    fs::create_dir_all(socket_path.parent().unwrap()).unwrap();
    let listener = UnixListener::bind(&socket_path).unwrap();

    let handle = std::thread::spawn(move || {
        use std::io::Read;
        let (mut connection, _) = listener.accept().unwrap();
        let mut received = Vec::new();
        connection.read_to_end(&mut received).unwrap();
        received
    });

    send_bridge_request(
        &server,
        &project_path,
        &BridgeRequest::OpenFile {
            file_path: "src/main.ts",
            line: 1,
            column: 1,
        },
    )
    .unwrap();

    let received = handle.join().unwrap();
    assert_eq!(
        received,
        br#"{"type":"openFile","filePath":"src/main.ts","line":1,"column":1}"#
    );

    let _ = fs::remove_dir_all(&app_data_dir);
}

#[test]
fn serializes_extension_request_as_camel_case_json() {
    let request = BridgeRequest::OpenFile {
        file_path: "/project/src/main.ts",
        line: 31,
        column: 7,
    };

    let json = serde_json::to_string(&request).unwrap();

    assert_eq!(
        json,
        r#"{"type":"openFile","filePath":"/project/src/main.ts","line":31,"column":7}"#
    );
}
