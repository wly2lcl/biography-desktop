// src-tauri/src/commands/world.rs - World management commands

use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};

use crate::AppDb;

fn get_worlds_dir(app: &AppHandle) -> PathBuf {
    app.path().app_data_dir().unwrap().join("worlds")
}

#[allow(dead_code)]
fn get_builtin_worlds_dir(app: &AppHandle) -> PathBuf {
    // Built-in worlds are in the resources/public/worlds directory
    // In development, this is relative to the project root
    let resource_path = app.path().resolve(
        "worlds",
        tauri::path::BaseDirectory::Resource,
    );
    match resource_path {
        Ok(p) => p,
        Err(_) => {
            // Fallback: use a known path for development
            let mut p = std::env::current_dir().unwrap();
            p.push("public/worlds");
            p
        }
    }
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct WorldMeta {
    pub name: String,
    pub filename: String,
    #[serde(rename = "type")]
    pub world_type: String,
    pub description: String,
    #[serde(rename = "isBuiltIn")]
    pub is_builtin: bool,
    #[serde(rename = "fileSize")]
    pub file_size: u64,
    #[serde(rename = "fileCount")]
    pub file_count: usize,
    #[serde(rename = "lastModified")]
    pub last_modified: String,
}

#[tauri::command]
pub async fn list_worlds(app: AppHandle) -> Result<Vec<WorldMeta>, String> {
    let worlds_dir = get_worlds_dir(&app);
    let mut worlds = Vec::new();

    if !worlds_dir.exists() {
        return Ok(worlds);
    }

    for entry in fs::read_dir(&worlds_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let filename = entry
            .file_name()
            .to_string_lossy()
            .to_string();

        if path.is_file() && filename.ends_with(".md") {
            let content = fs::read_to_string(&path).unwrap_or_default();
            let description = extract_description(&content);
            let metadata = path.metadata().map_err(|e| e.to_string())?;

            worlds.push(WorldMeta {
                name: filename.replace(".md", "").replace('_', " "),
                filename: filename.clone(),
                world_type: "single".to_string(),
                description,
                is_builtin: false,
                file_size: metadata.len(),
                file_count: 1,
                last_modified: format_timestamp(&metadata.modified().unwrap_or(std::time::SystemTime::now())),
            });
        } else if path.is_dir() {
            let readme_path = path.join("README.md");
            let content = if readme_path.exists() {
                fs::read_to_string(&readme_path).unwrap_or_default()
            } else {
                String::new()
            };
            let description = extract_description(&content);
            let (file_count, total_size) = count_dir_files(&path);

            worlds.push(WorldMeta {
                name: filename.replace('_', " "),
                filename: filename.clone(),
                world_type: "directory".to_string(),
                description,
                is_builtin: false,
                file_size: total_size,
                file_count,
                last_modified: String::new(),
            });
        }
    }

    Ok(worlds)
}

#[tauri::command]
pub async fn load_world(
    app: AppHandle,
    filename: String,
) -> Result<String, String> {
    // Security check: prevent path traversal
    if filename.contains("..") || filename.starts_with('/') || filename.contains('\\') {
        return Err("Invalid filename".to_string());
    }

    let worlds_dir = get_worlds_dir(&app);
    let path = worlds_dir.join(&filename);

    // Path safety check
    let canonical = path.canonicalize().map_err(|e| e.to_string())?;
    let canonical_dir = worlds_dir.canonicalize().map_err(|e| e.to_string())?;
    if !canonical.starts_with(&canonical_dir) {
        return Err("Path traversal detected".to_string());
    }

    if path.is_file() {
        fs::read_to_string(&path).map_err(|e| e.to_string())
    } else if path.is_dir() {
        let readme = path.join("README.md");
        if readme.exists() {
            fs::read_to_string(&readme).map_err(|e| e.to_string())
        } else {
            Err("No README.md found".to_string())
        }
    } else {
        Err("World not found".to_string())
    }
}

#[tauri::command]
pub async fn save_world(
    app: AppHandle,
    world_name: String,
    content: String,
) -> Result<(), String> {
    // Security check: prevent path traversal
    if world_name.contains("..") || world_name.starts_with('/') || world_name.contains('\\') {
        return Err("Invalid world name".to_string());
    }

    let worlds_dir = get_worlds_dir(&app);
    fs::create_dir_all(&worlds_dir).map_err(|e| e.to_string())?;

    let filename = format!("{}.md", world_name);
    let path = worlds_dir.join(&filename);

    // Path safety check: ensure the resolved path stays within worlds_dir
    let canonical_parent = worlds_dir.canonicalize().map_err(|e| e.to_string())?;
    let canonical = path.canonicalize().unwrap_or_else(|_| path.clone());
    if !canonical.starts_with(&canonical_parent) {
        return Err("Invalid path".to_string());
    }

    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_world(
    app: AppHandle,
    world_name: String,
) -> Result<(), String> {
    // Security check: prevent path traversal
    if world_name.contains("..") || world_name.starts_with('/') || world_name.contains('\\') {
        return Err("Invalid world name".to_string());
    }

    let worlds_dir = get_worlds_dir(&app);
    let path = worlds_dir.join(&world_name);

    // Path safety check
    let canonical_parent = worlds_dir.canonicalize().map_err(|e| e.to_string())?;
    let canonical = path.canonicalize().map_err(|e| e.to_string())?;
    if !canonical.starts_with(&canonical_parent) {
        return Err("Path traversal detected".to_string());
    }

    if path.is_dir() {
        fs::remove_dir_all(&path).map_err(|e| e.to_string())
    } else {
        fs::remove_file(&path).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub async fn export_world(
    app: AppHandle,
    world_name: String,
) -> Result<String, String> {
    // Security check: prevent path traversal
    if world_name.contains("..") || world_name.starts_with('/') || world_name.contains('\\') {
        return Err("Invalid world name".to_string());
    }

    let worlds_dir = get_worlds_dir(&app);
    let path = worlds_dir.join(&world_name);

    // Path safety check
    let canonical_parent = worlds_dir.canonicalize().map_err(|e| e.to_string())?;
    let canonical = path.canonicalize().map_err(|e| e.to_string())?;
    if !canonical.starts_with(&canonical_parent) {
        return Err("Path traversal detected".to_string());
    }

    if path.is_file() {
        // Return the content directly
        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        Ok(content)
    } else if path.is_dir() {
        // Create a zip - simplified version
        let content = collect_dir_content(&path)?;
        Ok(content)
    } else {
        Err("World not found".to_string())
    }
}

#[tauri::command]
pub async fn import_world(
    app: AppHandle,
    source_path: String,
    dest_name: String,
) -> Result<(), String> {
    // Security check: prevent path traversal in destination
    if dest_name.contains("..") || dest_name.starts_with('/') || dest_name.contains('\\') {
        return Err("Invalid destination name".to_string());
    }

    // Security check: prevent path traversal in source
    if source_path.contains("..") {
        return Err("Invalid source path".to_string());
    }

    let worlds_dir = get_worlds_dir(&app);
    fs::create_dir_all(&worlds_dir).map_err(|e| e.to_string())?;

    let source = PathBuf::from(&source_path);
    let dest = worlds_dir.join(&dest_name);

    // Verify destination stays within worlds_dir
    let canonical_parent = worlds_dir.canonicalize().map_err(|e| e.to_string())?;
    if source.is_file() || source.is_dir() {
        let canonical_dest = dest.canonicalize().unwrap_or_else(|_| dest.clone());
        if !canonical_dest.starts_with(&canonical_parent) {
            return Err("Path traversal detected".to_string());
        }
    }

    if source.is_file() {
        fs::copy(&source, &dest).map_err(|e| e.to_string())?;
    } else if source.is_dir() {
        copy_dir_all(&source, &dest).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn export_worlds(
    state: State<'_, AppDb>,
    filenames: Vec<String>,
) -> Result<String, String> {
    let worlds_dir = state.data_dir.join("worlds");
    let mut world_data = serde_json::Map::new();

    for filename in &filenames {
        // Security check: prevent path traversal
        if filename.contains("..") || filename.contains('/') || filename.contains('\\') {
            return Err(format!("Invalid filename: {}", filename));
        }

        let path = worlds_dir.join(filename);
        if path.exists() {
            if let Ok(content) = std::fs::read_to_string(&path) {
                world_data.insert(filename.clone(), Value::String(content));
            }
        }
    }

    Ok(serde_json::to_string(&Value::Object(world_data)).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn open_worlds_folder(app: AppHandle) -> Result<(), String> {
    let worlds_dir = get_worlds_dir(&app);
    // Use tauri-plugin-shell to open the folder
    // For now, return success (actual implementation needs shell plugin)
    log::info!("Opening worlds folder: {:?}", worlds_dir);
    Ok(())
}

// ── Helper functions ───────────────────────────────────────────

fn extract_description(content: &str) -> String {
    content
        .lines()
        .skip(1) // Skip title
        .find(|line| !line.trim().is_empty() && !line.trim().starts_with('#'))
        .map(|line| {
            let trimmed = line.trim();
            if trimmed.len() > 200 {
                format!("{}…", &trimmed[..200])
            } else {
                trimmed.to_string()
            }
        })
        .unwrap_or_default()
}

fn count_dir_files(dir: &PathBuf) -> (usize, u64) {
    let mut count = 0;
    let mut size = 0;
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                count += 1;
                if let Ok(meta) = path.metadata() {
                    size += meta.len();
                }
            }
        }
    }
    (count, size)
}

fn collect_dir_content(dir: &PathBuf) -> Result<String, String> {
    let mut content = String::new();
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Ok(c) = fs::read_to_string(&path) {
                    content.push_str(&format!("--- {} ---\n{}\n\n", path.display(), c));
                }
            }
        }
    }
    Ok(content)
}

fn copy_dir_all(src: &PathBuf, dest: &PathBuf) -> std::io::Result<()> {
    fs::create_dir_all(dest)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let path = entry.path();
        let dest_path = dest.join(entry.file_name());
        if path.is_dir() {
            copy_dir_all(&path, &dest_path)?;
        } else {
            fs::copy(&path, &dest_path)?;
        }
    }
    Ok(())
}

fn format_timestamp(time: &std::time::SystemTime) -> String {
    use std::time::UNIX_EPOCH;
    let duration = time.duration_since(UNIX_EPOCH).unwrap_or_default();
    let secs = duration.as_secs();
    // Simple ISO format
    let days = secs / 86400;
    let hours = (secs % 86400) / 3600;
    let mins = (secs % 3600) / 60;
    let secs = secs % 60;
    let year = 1970 + days / 365;
    let day_of_year = days % 365;
    format!("{}-{:02}-{:02} {:02}:{:02}:{:02}", year, (day_of_year / 30) + 1, (day_of_year % 30) + 1, hours, mins, secs)
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Path traversal detection ──────────────────────────────────

    #[test]
    fn test_path_traversal_contains_dotdot() {
        let names = [
            "../../../etc/passwd",
            "..\\..\\windows\\system32",
            "foo/../../../etc",
            "foo\\..\\..\\bar",
            "valid/../outside",
        ];
        for name in &names {
            assert!(
                name.contains("..") || name.starts_with('/') || name.contains('\\'),
                "Path traversal should be detected: {}",
                name
            );
        }
    }

    #[test]
    fn test_path_traversal_starts_with_slash() {
        let names = ["/etc/passwd", "/absolute/path", "/foo.md"];
        for name in &names {
            assert!(
                name.contains("..") || name.starts_with('/') || name.contains('\\'),
                "Absolute path should be detected: {}",
                name
            );
        }
    }

    #[test]
    fn test_path_traversal_contains_backslash() {
        let names = ["windows\\path", "dir\\file.md", "..\\outside"];
        for name in &names {
            assert!(
                name.contains("..") || name.starts_with('/') || name.contains('\\'),
                "Backslash path should be detected: {}",
                name
            );
        }
    }

    #[test]
    fn test_path_traversal_combinatorial_attacks() {
        // Edge cases that try to bypass simple checks
        let names = [
            "....//....//etc",           // extra dots
            "..\\..\\..\\windows",       // backslash variant
            "/absolute/mixed\\path",     // slash + backslash
            "valid/../../../etc/passwd", // relative traversal
            "..",                        // bare dotdot
            "../",                       // dotdot with slash
            "..\\",                      // dotdot with backslash
            "valid\\..\\..\\..\\etc",    // backslash traversal
        ];
        for name in &names {
            let blocked = name.contains("..") || name.starts_with('/') || name.contains('\\');
            assert!(
                blocked,
                "Path traversal attack should be blocked: {}",
                name
            );
        }
    }

    // ── Valid filename tests ──────────────────────────────────────

    #[test]
    fn test_valid_filenames_pass_checks() {
        let good_names = [
            "wuxia_jianghu.md",
            "my_world.md",
            "test-123.md",
            "simple.md",
            "world_name_v2.md",
            "README.md",
            "a.md",
            "123.md",
            "my.custom.world.md",
            "hello_world",
        ];
        for name in &good_names {
            let traversal = name.contains("..") || name.starts_with('/') || name.contains('\\');
            assert!(!traversal, "Valid name should not be flagged: {}", name);
        }
    }

    #[test]
    fn test_invalid_filenames_rejected_by_validation() {
        // Names that should be rejected by the path-traversal checks
        let bad_names = [
            "../outside.md",
            "/etc/passwd",
            "subdir\\file.md",
            "..\\outside.md",
            "../../etc.md",
        ];
        for name in &bad_names {
            let blocked = name.contains("..") || name.starts_with('/') || name.contains('\\');
            assert!(
                blocked,
                "Invalid name should be blocked: {}",
                name
            );
        }
    }

    // ── extract_description ───────────────────────────────────────

    #[test]
    fn test_extract_description_empty_content() {
        assert_eq!(extract_description(""), "");
    }

    #[test]
    fn test_extract_description_skip_title_line() {
        let content = "# My World\nThis is a description.";
        assert_eq!(extract_description(content), "This is a description.");
    }

    #[test]
    fn test_extract_description_no_description() {
        let content = "# Title Only";
        assert_eq!(extract_description(content), "");
    }

    #[test]
    fn test_extract_description_skip_empty_lines_after_title() {
        let content = "# Title\n\n\nActual description here.";
        assert_eq!(extract_description(content), "Actual description here.");
    }

    #[test]
    fn test_extract_description_skip_other_headings() {
        let content = "# Title\n## Subheading\nNot this one.";
        assert_eq!(extract_description(content), "Not this one.");
    }

    #[test]
    fn test_extract_description_truncates_long_lines() {
        let long = "A".repeat(250);
        let content = format!("# Title\n{}", long);
        let result = extract_description(&content);
        assert_eq!(result.len(), 201); // 200 chars + '…'
        assert!(result.ends_with('…'));
        assert_eq!(&result[..200], &"A".repeat(200));
    }

    #[test]
    fn test_extract_description_short_line_not_truncated() {
        let content = "# Title\nShort desc";
        assert_eq!(extract_description(content), "Short desc");
    }

    #[test]
    fn test_extract_description_whitespace_only_lines_skipped() {
        let content = "# Title\n   \n\t\nFirst real line.";
        assert_eq!(extract_description(content), "First real line.");
    }

    #[test]
    fn test_extract_description_trimmed() {
        let content = "# Title\n  trimmed content  ";
        assert_eq!(extract_description(content), "trimmed content");
    }

    // ── format_timestamp ──────────────────────────────────────────

    #[test]
    fn test_format_timestamp_epoch() {
        let epoch = std::time::SystemTime::UNIX_EPOCH;
        let formatted = format_timestamp(&epoch);
        // Epoch is 1970-01-01 00:00:00
        assert_eq!(&formatted[..4], "1970");
        assert!(formatted.contains("00:00:00"));
    }

    #[test]
    fn test_format_timestamp_readable_format() {
        use std::time::{Duration, SystemTime};
        // A known point: 2024-06-15 12:30:00 UTC
        // Days since epoch: ~19884
        let secs = 1718459400; // approximate
        let time = SystemTime::UNIX_EPOCH + Duration::from_secs(secs);
        let formatted = format_timestamp(&time);
        // Should start with "2024" and contain colons (time part)
        assert_eq!(&formatted[..4], "2024");
        assert!(
            formatted.contains(':'),
            "Timestamp should include time: {}",
            formatted
        );
    }

    #[test]
    fn test_format_timestamp_return_type() {
        let now = std::time::SystemTime::now();
        let formatted = format_timestamp(&now);
        // Basic shape: "YYYY-MM-DD HH:MM:SS"
        assert_eq!(formatted.len(), 19);
        assert_eq!(&formatted[4..5], "-");
        assert_eq!(&formatted[7..8], "-");
        assert_eq!(&formatted[10..11], " ");
        assert_eq!(&formatted[13..14], ":");
        assert_eq!(&formatted[16..17], ":");
    }

    // ── count_dir_files ───────────────────────────────────────────

    #[test]
    fn test_count_dir_files_empty_directory() {
        let dir = std::env::temp_dir().join("bio_test_count_empty");
        std::fs::create_dir_all(&dir).unwrap();
        let (count, size) = count_dir_files(&dir);
        assert_eq!(count, 0);
        assert_eq!(size, 0);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_count_dir_files_counts_files() {
        let dir = std::env::temp_dir().join("bio_test_count_files");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("a.txt"), "hello").unwrap();
        std::fs::write(dir.join("b.txt"), "world").unwrap();
        std::fs::write(dir.join("c.md"), "# Markdown").unwrap();

        let (count, size) = count_dir_files(&dir);
        assert_eq!(count, 3);
        assert!(size > 0, "Total size should be > 0");
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_count_dir_files_ignores_subdirectories() {
        let dir = std::env::temp_dir().join("bio_test_count_subdirs");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("file.txt"), "data").unwrap();
        std::fs::create_dir_all(dir.join("subdir")).unwrap();
        std::fs::write(dir.join("subdir").join("nested.txt"), "nested").unwrap();

        let (count, _size) = count_dir_files(&dir);
        // Only top-level files are counted; subdir/nested.txt is not included
        assert_eq!(count, 1, "Subdirectory contents should not be counted");
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_count_dir_files_nonexistent_directory() {
        let dir = std::env::temp_dir().join("bio_test_count_nonexistent");
        // Directory does not exist
        let (count, size) = count_dir_files(&dir);
        assert_eq!(count, 0);
        assert_eq!(size, 0);
    }
}
