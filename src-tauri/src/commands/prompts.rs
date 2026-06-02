// src-tauri/src/commands/prompts.rs - Prompt override file read/write

use crate::AppDb;
use std::fs;
use std::path::PathBuf;
use tauri::State;

/// Get the prompts override directory path, creating it if needed
fn get_prompts_dir(state: &AppDb) -> PathBuf {
    let dir = state.data_dir.join("prompts");
    fs::create_dir_all(&dir).expect("failed to create prompts dir");
    dir
}

/// Validate that the path is within the prompts directory and prevent path traversal
fn validate_prompt_path(state: &AppDb, path: &str) -> Result<PathBuf, String> {
    let prompts_dir = get_prompts_dir(state);
    let requested = prompts_dir.join(path.trim_start_matches('/'));

    // Canonicalize to resolve any '..' traversal
    let canonical = requested.canonicalize().map_err(|_| {
        format!("Invalid path: {}", path)
    })?;

    // Ensure the resolved path is within the prompts directory
    if !canonical.starts_with(&prompts_dir) {
        return Err("Path traversal detected".to_string());
    }

    Ok(canonical)
}

#[tauri::command]
pub async fn read_file(
    state: State<'_, AppDb>,
    path: String,
) -> Result<String, String> {
    let full_path = validate_prompt_path(&state, &path)?;

    if !full_path.exists() {
        return Err(format!("File not found: {}", path));
    }

    fs::read_to_string(&full_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn write_file(
    state: State<'_, AppDb>,
    path: String,
    content: String,
) -> Result<(), String> {
    let full_path = validate_prompt_path(&state, &path)?;

    // Ensure parent directory exists
    if let Some(parent) = full_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    fs::write(&full_path, &content).map_err(|e| e.to_string())
}
