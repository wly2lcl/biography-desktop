// src-tauri/src/commands/data.rs - Data management commands

use crate::AppDb;
use serde_json::json;
use serde_json::Value;
use sqlx::Row;
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
    _state: State<'_, AppDb>,
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
    let rows = sqlx::query(
        "SELECT session_id, world, game_mode, system, player_name,
                player_history, player_attributes, player_inventory,
                player_summary, player_qa_history, scenarios_json,
                is_active, biography, created_at
         FROM sessions",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    let sessions: Vec<serde_json::Value> = rows
        .iter()
        .map(|row| {
            let session_id: String = row.get("session_id");
            let world: String = row.get("world");
            let game_mode: String = row.get("game_mode");
            let system: Option<String> = row.get("system");
            let player_name: String = row.get("player_name");
            let player_history: String = row.get("player_history");
            let player_attributes: String = row.get("player_attributes");
            let player_inventory: String = row.get("player_inventory");
            let player_summary: String = row.get("player_summary");
            let player_qa_history: String = row.get("player_qa_history");
            let scenarios_json: String = row.get("scenarios_json");
            let is_active: bool = row.get("is_active");
            let biography: Option<String> = row.get("biography");
            let created_at: String = row.get("created_at");

            json!({
                "sessionId": session_id,
                "world": world,
                "gameMode": game_mode,
                "system": system,
                "player": {
                    "name": player_name,
                    "history": serde_json::from_str::<Value>(&player_history).unwrap_or(Value::Array(vec![])),
                    "attributes": serde_json::from_str::<Value>(&player_attributes).unwrap_or(Value::Object(serde_json::Map::new())),
                    "inventory": serde_json::from_str::<Value>(&player_inventory).unwrap_or(Value::Array(vec![])),
                    "summary": player_summary,
                    "qaHistory": serde_json::from_str::<Value>(&player_qa_history).unwrap_or(Value::Array(vec![])),
                },
                "scenarios": serde_json::from_str::<Value>(&scenarios_json).unwrap_or(Value::Array(vec![])),
                "isActive": is_active,
                "biography": biography,
                "createdAt": created_at,
            })
        })
        .collect();

    let export_data = json!({
        "version": "1.0",
        "exportedAt": chrono::Local::now().to_rfc3339(),
        "appVersion": env!("CARGO_PKG_VERSION"),
        "sessions": sessions,
    });

    Ok(serde_json::to_string_pretty(&export_data).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn import_full_data(
    state: State<'_, AppDb>,
    data: String,
) -> Result<String, String> {
    let parsed: Value = serde_json::from_str(&data).map_err(|e| e.to_string())?;
    let sessions = parsed["sessions"]
        .as_array()
        .ok_or("Missing or invalid 'sessions' array in import data")?;

    let mut tx = state.pool.begin().await.map_err(|e| e.to_string())?;

    for session in sessions {
        let session_id = session["sessionId"]
            .as_str()
            .ok_or("Missing sessionId in session entry")?;

        sqlx::query(
            "INSERT OR REPLACE INTO sessions
             (session_id, world, game_mode, system, player_name,
              player_history, player_attributes, player_inventory,
              player_summary, player_qa_history, scenarios_json,
              is_active, biography, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
        )
        .bind(session_id)
        .bind(session["world"].as_str().unwrap_or(""))
        .bind(session["gameMode"].as_str().unwrap_or("basic"))
        .bind(session["system"].as_str())
        .bind(session["player"]["name"].as_str().unwrap_or(""))
        .bind(session["player"]["history"].to_string())
        .bind(session["player"]["attributes"].to_string())
        .bind(session["player"]["inventory"].to_string())
        .bind(session["player"]["summary"].as_str().unwrap_or(""))
        .bind(session["player"]["qaHistory"].to_string())
        .bind(session["scenarios"].to_string())
        .bind(if session["isActive"].as_bool().unwrap_or(true) { 1 } else { 0 })
        .bind(session["biography"].as_str())
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(format!("Successfully imported {} session(s)", sessions.len()))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clean_old_backups_removes_oldest() {
        // Test that clean_old_backups removes the oldest files first
        // This tests the helper function logic
        let test_dir = std::env::temp_dir().join("biography_test_backups");
        std::fs::create_dir_all(&test_dir).unwrap();

        // Create 3 test backup files with different modification times
        for i in 0..3 {
            let path = test_dir.join(format!("test-{}.db", i));
            std::fs::write(&path, format!("backup {}", i)).unwrap();
            // Small delay to ensure different mtime
            std::thread::sleep(std::time::Duration::from_millis(10));
        }

        // Should keep only 2
        clean_old_backups(&test_dir, 2).unwrap();

        let remaining: Vec<_> = std::fs::read_dir(&test_dir)
            .unwrap()
            .filter(|e| {
                e.as_ref()
                    .map(|e| e.path().extension().map_or(false, |ext| ext == "db"))
                    .unwrap_or(false)
            })
            .collect();

        assert_eq!(remaining.len(), 2);

        // Cleanup
        std::fs::remove_dir_all(&test_dir).unwrap();
    }

    #[test]
    fn test_clean_old_backups_no_op_when_under_limit() {
        let test_dir = std::env::temp_dir().join("biography_test_noop");
        std::fs::create_dir_all(&test_dir).unwrap();

        std::fs::write(test_dir.join("test.db"), "data").unwrap();

        clean_old_backups(&test_dir, 5).unwrap();

        assert!(test_dir.join("test.db").exists());

        std::fs::remove_dir_all(&test_dir).unwrap();
    }
}
