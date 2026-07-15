use super::*;
use std::fs;
use std::os::unix::fs::symlink;

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
