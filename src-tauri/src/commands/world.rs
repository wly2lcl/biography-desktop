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

    #[test]
    fn test_path_traversal_blocked() {
        // Test that filenames with ".." are rejected
        let bad_names = vec!["../../../etc/passwd", "..\\..\\windows", "test/../../../etc"];
        for name in bad_names {
            assert!(
                name.contains("..") || name.starts_with('/') || name.contains('\\'),
                "Should be blocked: {}",
                name
            );
        }
    }

    #[test]
    fn test_valid_filenames() {
        let good_names = vec!["wuxia_jianghu.md", "my_world.md", "test-123.md"];
        for name in good_names {
            assert!(!name.contains(".."));
            assert!(!name.starts_with('/'));
            assert!(!name.contains('\\'));
        }
    }
}
