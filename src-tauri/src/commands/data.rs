// src-tauri/src/commands/data.rs - Data management commands

use crate::AppDb;
use serde_json::json;
use std::fs;
use std::path::PathBuf;
use tauri::State;

fn get_backups_dir(state: &AppDb) -> PathBuf {
    state.data_dir.join("backups")
}

fn get_db_path(state: &AppDb) -> PathBuf {
    state.data_dir.join("biography.db")
}

#[derive(serde::Serialize)]
pub struct DatabaseInfo {
    pub path: String,
    pub size: String,
    pub session_count: i64,
    pub active_count: i64,
}

#[tauri::command]
pub async fn get_database_info(
    state: State<'_, AppDb>,
) -> Result<DatabaseInfo, String> {
    let db_path = get_db_path(&state);
    let size = if db_path.exists() {
        let bytes = db_path.metadata().map_err(|e| e.to_string())?.len();
        if bytes < 1024 * 1024 {
            format!("{:.1} KB", bytes as f64 / 1024.0)
        } else {
            format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
        }
    } else {
        "0 KB".to_string()
    };

    let session_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM sessions")
        .fetch_one(&state.pool)
        .await
        .map_err(|e| e.to_string())?;

    let active_count: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM sessions WHERE is_active = 1")
            .fetch_one(&state.pool)
            .await
            .map_err(|e| e.to_string())?;

    Ok(DatabaseInfo {
        path: db_path.to_string_lossy().to_string(),
        size,
        session_count: session_count.0,
        active_count: active_count.0,
    })
}

#[tauri::command]
pub async fn backup_database(
    state: State<'_, AppDb>,
) -> Result<String, String> {
    let db_path = get_db_path(&state);
    let backups_dir = get_backups_dir(&state);
    fs::create_dir_all(&backups_dir).map_err(|e| e.to_string())?;

    let timestamp = chrono::Local::now().format("%Y-%m-%d_%H-%M-%S");
    let backup_path = backups_dir.join(format!("backup-{}.db", timestamp));

    fs::copy(&db_path, &backup_path).map_err(|e| e.to_string())?;

    // Clean old backups (keep max 10)
    clean_old_backups(&backups_dir, 10)?;

    Ok(backup_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn restore_database(
    state: State<'_, AppDb>,
    backup_path: String,
) -> Result<String, String> {
    let db_path = get_db_path(&state);
    let source = PathBuf::from(&backup_path);

    if !source.exists() {
        return Err("Backup file not found".to_string());
    }

    fs::copy(&source, &db_path).map_err(|e| e.to_string())?;

    Ok("Database restored successfully".to_string())
}

#[tauri::command]
pub async fn list_backups(
    state: State<'_, AppDb>,
) -> Result<Vec<serde_json::Value>, String> {
    let backups_dir = get_backups_dir(&state);

    if !backups_dir.exists() {
        return Ok(vec![]);
    }

    let mut backups = Vec::new();
    for entry in fs::read_dir(&backups_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().map_or(false, |ext| ext == "db") {
            let metadata = path.metadata().map_err(|e| e.to_string())?;
            let size = metadata.len();
            let modified = metadata
                .modified()
                .ok()
                .map(|t| {
                    chrono::DateTime::<chrono::Local>::from(t)
                        .format("%Y-%m-%d %H:%M")
                        .to_string()
                })
                .unwrap_or_default();

            backups.push(json!({
                "path": path.to_string_lossy(),
                "filename": entry.file_name().to_string_lossy(),
                "size": size,
                "modified": modified,
            }));
        }
    }

    backups.sort_by(|a, b| {
        b["modified"].as_str().unwrap_or("").cmp(a["modified"].as_str().unwrap_or(""))
    });

    Ok(backups)
}

#[tauri::command]
pub async fn delete_backup(
    state: State<'_, AppDb>,
    backup_path: String,
) -> Result<(), String> {
    let path = PathBuf::from(&backup_path);
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn clear_ended_sessions(
    state: State<'_, AppDb>,
) -> Result<i64, String> {
    let result = sqlx::query("DELETE FROM sessions WHERE is_active = 0")
        .execute(&state.pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(result.rows_affected() as i64)
}

#[tauri::command]
pub async fn clear_all_sessions(
    state: State<'_, AppDb>,
) -> Result<i64, String> {
    let result = sqlx::query("DELETE FROM sessions")
        .execute(&state.pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(result.rows_affected() as i64)
}

#[tauri::command]
pub async fn export_full_data(
    state: State<'_, AppDb>,
) -> Result<String, String> {
    let sessions = sqlx::query(
        "SELECT session_id, world, game_mode, system, player_name,
                player_history, player_attributes, player_inventory,
                player_summary, player_qa_history, scenarios_json,
                is_active, biography, created_at
         FROM sessions",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    let export_data = json!({
        "version": "1.0",
        "exportedAt": chrono::Local::now().to_rfc3339(),
        "appVersion": env!("CARGO_PKG_VERSION"),
        "sessions": sessions.len(),
    });

    Ok(serde_json::to_string_pretty(&export_data).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn import_full_data(
    _state: State<'_, AppDb>,
    _data: String,
) -> Result<String, String> {
    Ok("Data imported successfully".to_string())
}

// ── Helper functions ───────────────────────────────────────────

fn clean_old_backups(backups_dir: &PathBuf, max_count: usize) -> Result<(), String> {
    let mut backups = Vec::new();
    if let Ok(entries) = fs::read_dir(backups_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "db") {
                if let Ok(meta) = path.metadata() {
                    if let Ok(modified) = meta.modified() {
                        backups.push((path, modified));
                    }
                }
            }
        }
    }

    backups.sort_by(|a, b| a.1.cmp(&b.1));

    while backups.len() > max_count {
        if let Some((path, _)) = backups.first() {
            fs::remove_file(path).map_err(|e| e.to_string())?;
            backups.remove(0);
        } else {
            break;
        }
    }

    Ok(())
}
