// src-tauri/src/commands/data.rs - Data management commands

use crate::db::DATABASE_SCHEMA_VERSION;
use crate::AppDb;
use serde_json::json;
use serde_json::Value;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{Connection, Row, SqlitePool};
use std::fs;
use std::path::PathBuf;
use tauri::State;

fn get_backups_dir(state: &AppDb) -> PathBuf {
    state.data_dir.join("backups")
}

fn get_db_path(state: &AppDb) -> PathBuf {
    state.data_dir.join("biography.db")
}

fn validate_backup_path(data_dir: &std::path::Path, backup_path: &str) -> Result<PathBuf, String> {
    let backups_dir = data_dir
        .join("backups")
        .canonicalize()
        .map_err(|e| format!("Backups directory is unavailable: {e}"))?;
    let source = PathBuf::from(backup_path)
        .canonicalize()
        .map_err(|_| "Backup file not found".to_string())?;
    if !source.starts_with(&backups_dir)
        || source.extension().and_then(|value| value.to_str()) != Some("db")
    {
        return Err("Invalid backup path".to_string());
    }
    Ok(source)
}

async fn create_backup_snapshot(
    pool: &SqlitePool,
    backup_path: &std::path::Path,
) -> Result<(), String> {
    if backup_path.exists() {
        return Err("Backup destination already exists".to_string());
    }
    let result = sqlx::query("VACUUM INTO ?")
        .bind(backup_path.to_string_lossy().as_ref())
        .execute(pool)
        .await;
    match result {
        Ok(_) => Ok(()),
        Err(error) => {
            let _ = fs::remove_file(backup_path);
            Err(format!("Failed to create consistent backup: {error}"))
        }
    }
}

async fn restore_from_snapshot(pool: &SqlitePool, source: &std::path::Path) -> Result<(), String> {
    let options = SqliteConnectOptions::new()
        .filename(source)
        .read_only(true)
        .create_if_missing(false);
    let backup_pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .map_err(|e| format!("Cannot open backup: {e}"))?;
    let integrity: String = sqlx::query_scalar("PRAGMA integrity_check")
        .fetch_one(&backup_pool)
        .await
        .map_err(|e| format!("Cannot validate backup: {e}"))?;
    if integrity != "ok" {
        return Err(format!("Backup integrity check failed: {integrity}"));
    }
    let version: i64 = sqlx::query_scalar("PRAGMA user_version")
        .fetch_one(&backup_pool)
        .await
        .map_err(|e| format!("Cannot read backup version: {e}"))?;
    if version != 2 && version != DATABASE_SCHEMA_VERSION {
        return Err(format!("Unsupported backup schema version: {version}"));
    }
    backup_pool.close().await;

    let mut connection = pool.acquire().await.map_err(|e| e.to_string())?;
    sqlx::query("ATTACH DATABASE ? AS restore_db")
        .bind(source.to_string_lossy().as_ref())
        .execute(&mut *connection)
        .await
        .map_err(|e| format!("Cannot attach backup: {e}"))?;

    let restore_result: Result<(), String> = async {
        let mut tx = connection.begin().await.map_err(|e| e.to_string())?;
        sqlx::query("DELETE FROM sessions")
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        let biography_generation = if version >= 3 {
            "biography_generation"
        } else {
            "NULL"
        };
        let restore_query = format!(
            "INSERT INTO sessions
             (session_id, schema_version, world, world_source, world_type, game_mode, system,
              player_name, player_history, player_attributes, player_inventory, player_summary,
              player_qa_history, scenarios_json, is_active, end_reason, biography,
              biography_generation, created_at, updated_at)
             SELECT session_id, schema_version, world, world_source, world_type, game_mode, system,
                    player_name, player_history, player_attributes, player_inventory, player_summary,
                    player_qa_history, scenarios_json, is_active, end_reason, biography,
                    {biography_generation}, created_at, updated_at
             FROM restore_db.sessions"
        );
        sqlx::query(&restore_query)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
        tx.commit().await.map_err(|e| e.to_string())?;
        Ok(())
    }
    .await;

    let detach_result = sqlx::query("DETACH DATABASE restore_db")
        .execute(&mut *connection)
        .await
        .map_err(|e| e.to_string());
    match detach_result {
        Ok(_) => restore_result,
        Err(detach_error) => {
            let close_error = connection.close().await.err();
            match restore_result {
                Ok(()) => {
                    log::warn!(
                        "Database restore committed but cleanup failed: {detach_error}; \
                         connection close result: {close_error:?}"
                    );
                    Ok(())
                }
                Err(restore_error) => Err(format!(
                    "{restore_error}; failed to detach backup database: {detach_error}"
                )),
            }
        }
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseInfo {
    pub path: String,
    pub size: u64,
    pub session_count: i64,
    pub active_count: i64,
}

#[tauri::command]
pub async fn get_database_info(state: State<'_, AppDb>) -> Result<DatabaseInfo, String> {
    let db_path = get_db_path(&state);
    let size = if db_path.exists() {
        db_path.metadata().map_err(|e| e.to_string())?.len()
    } else {
        0
    };

    let session_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM sessions")
        .fetch_one(&state.pool)
        .await
        .map_err(|e| e.to_string())?;

    let active_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM sessions WHERE is_active = 1")
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
pub async fn backup_database(state: State<'_, AppDb>) -> Result<String, String> {
    let backups_dir = get_backups_dir(&state);
    fs::create_dir_all(&backups_dir).map_err(|e| e.to_string())?;

    let timestamp = chrono::Local::now().format("%Y-%m-%d_%H-%M-%S");
    let backup_path = backups_dir.join(format!("backup-{}-{}.db", timestamp, uuid::Uuid::new_v4()));

    // VACUUM INTO asks SQLite itself for a transactionally consistent
    // snapshot, including committed WAL contents.
    create_backup_snapshot(&state.pool, &backup_path).await?;

    // Clean old backups (keep max 10)
    clean_old_backups(&backups_dir, 10)?;

    Ok(backup_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn restore_database(
    state: State<'_, AppDb>,
    backup_path: String,
) -> Result<String, String> {
    let source = validate_backup_path(&state.data_dir, &backup_path)?;

    restore_from_snapshot(&state.pool, &source).await?;

    Ok("Database restored successfully".to_string())
}

#[tauri::command]
pub async fn list_backups(state: State<'_, AppDb>) -> Result<Vec<serde_json::Value>, String> {
    let backups_dir = get_backups_dir(&state);

    if !backups_dir.exists() {
        return Ok(vec![]);
    }

    let mut backups = Vec::new();
    for entry in fs::read_dir(&backups_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().is_some_and(|ext| ext == "db") {
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
        b["modified"]
            .as_str()
            .unwrap_or("")
            .cmp(a["modified"].as_str().unwrap_or(""))
    });

    Ok(backups)
}

#[tauri::command]
pub async fn delete_backup(state: State<'_, AppDb>, backup_path: String) -> Result<(), String> {
    let path = validate_backup_path(&state.data_dir, &backup_path)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn clear_ended_sessions(state: State<'_, AppDb>) -> Result<i64, String> {
    let result = sqlx::query("DELETE FROM sessions WHERE is_active = 0")
        .execute(&state.pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(result.rows_affected() as i64)
}

#[tauri::command]
pub async fn clear_all_sessions(state: State<'_, AppDb>) -> Result<i64, String> {
    let result = sqlx::query("DELETE FROM sessions")
        .execute(&state.pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(result.rows_affected() as i64)
}

async fn export_full_data_from_pool(pool: &SqlitePool) -> Result<String, String> {
    let rows = sqlx::query(
        "SELECT session_id, schema_version, world, world_source, world_type, game_mode, system, player_name,
                player_history, player_attributes, player_inventory,
                player_summary, player_qa_history, scenarios_json,
                is_active, end_reason, biography, biography_generation, created_at
         FROM sessions",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let sessions: Vec<serde_json::Value> = rows
        .iter()
        .map(|row| -> Result<Value, String> {
            let session_id: String = row.get("session_id");
            let schema_version: i64 = row.get("schema_version");
            let world: String = row.get("world");
            let world_source: String = row.get("world_source");
            let world_type: String = row.get("world_type");
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
            let end_reason: Option<String> = row.get("end_reason");
            let biography: Option<String> = row.get("biography");
            let biography_generation: Option<String> = row.get("biography_generation");
            let created_at: String = row.get("created_at");
            let history: Value = serde_json::from_str(&player_history)
                .map_err(|e| format!("Corrupted player_history: {e}"))?;
            let attributes: Value = serde_json::from_str(&player_attributes)
                .map_err(|e| format!("Corrupted player_attributes: {e}"))?;
            let inventory: Value = serde_json::from_str(&player_inventory)
                .map_err(|e| format!("Corrupted player_inventory: {e}"))?;
            let qa_history: Value = serde_json::from_str(&player_qa_history)
                .map_err(|e| format!("Corrupted player_qa_history: {e}"))?;
            let scenarios: Value = serde_json::from_str(&scenarios_json)
                .map_err(|e| format!("Corrupted scenarios_json: {e}"))?;
            let biography_generation = biography_generation
                .map(|raw| {
                    serde_json::from_str::<Value>(&raw)
                        .map_err(|e| format!("Corrupted biography_generation: {e}"))
                })
                .transpose()?;

            Ok(json!({
                "sessionId": session_id,
                "schemaVersion": schema_version,
                "world": world,
                "worldRef": { "name": world, "source": world_source, "type": world_type },
                "gameMode": game_mode,
                "system": system,
                "player": {
                    "name": player_name,
                    "createdAt": created_at,
                    "history": history,
                    "attributes": attributes,
                    "inventory": inventory,
                    "summary": player_summary,
                    "qaHistory": qa_history,
                },
                "scenarios": scenarios,
                "isActive": is_active,
                "endReason": end_reason,
                "biography": biography,
                "biographyGeneration": biography_generation,
                "createdAt": created_at,
            }))
        })
        .collect::<Result<_, _>>()?;

    let export_data = json!({
        "version": "2.0",
        "exportedAt": chrono::Local::now().to_rfc3339(),
        "appVersion": env!("CARGO_PKG_VERSION"),
        "sessions": sessions,
    });

    serde_json::to_string_pretty(&export_data).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_full_data(state: State<'_, AppDb>) -> Result<String, String> {
    export_full_data_from_pool(&state.pool).await
}

async fn import_full_data_into_pool(pool: &SqlitePool, data: &str) -> Result<usize, String> {
    let parsed: Value = serde_json::from_str(data).map_err(|e| e.to_string())?;
    let sessions = parsed["sessions"]
        .as_array()
        .ok_or("Missing or invalid 'sessions' array in import data")?;

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    for (index, session) in sessions.iter().enumerate() {
        let entry = format!("sessions[{index}]");
        let session_id = session["sessionId"]
            .as_str()
            .filter(|value| !value.is_empty())
            .ok_or_else(|| format!("{entry} is missing sessionId"))?;
        let world_ref = session.get("worldRef").and_then(Value::as_object);
        let has_world_ref = world_ref.is_some();
        if let Some(value) = world_ref {
            if !value.get("name").is_some_and(Value::is_string)
                || !value.get("source").is_some_and(Value::is_string)
                || !value.get("type").is_some_and(Value::is_string)
            {
                return Err(format!("{entry} has an incomplete WorldRef"));
            }
        }
        let world = world_ref
            .and_then(|value| value.get("name"))
            .and_then(Value::as_str)
            .or_else(|| session["world"].as_str())
            .filter(|value| !value.is_empty())
            .ok_or_else(|| format!("{entry} is missing world metadata"))?;
        let world_source = world_ref
            .and_then(|value| value.get("source"))
            .and_then(Value::as_str)
            .unwrap_or("builtin");
        if world_source != "builtin" && world_source != "user" {
            return Err(format!("{entry} has an invalid world source"));
        }
        let world_type = world_ref
            .and_then(|value| value.get("type"))
            .and_then(Value::as_str)
            .unwrap_or("single");
        if world_type != "single" && world_type != "directory" {
            return Err(format!("{entry} has an invalid world type"));
        }
        let schema_version = match session.get("schemaVersion") {
            None => {
                if has_world_ref {
                    2
                } else {
                    1
                }
            }
            Some(Value::Number(value)) => value
                .as_i64()
                .ok_or_else(|| format!("{entry} schemaVersion must be an integer"))?,
            _ => return Err(format!("{entry} schemaVersion must be an integer")),
        };
        if schema_version != 1 && schema_version != 2 {
            return Err(format!("{entry} has an unsupported schema version"));
        }
        if schema_version == 2 && !has_world_ref {
            return Err(format!("{entry} schema v2 is missing WorldRef"));
        }
        let game_mode = match session.get("gameMode") {
            None => "basic",
            Some(Value::String(value)) => value.as_str(),
            _ => return Err(format!("{entry} gameMode must be a string")),
        };
        if game_mode != "basic" && game_mode != "system" {
            return Err(format!("{entry} has an invalid gameMode"));
        }
        let system = match session.get("system") {
            None | Some(Value::Null) => None,
            Some(Value::String(value)) => Some(value.as_str()),
            _ => return Err(format!("{entry} system must be a string")),
        };

        let player = session["player"]
            .as_object()
            .ok_or_else(|| format!("{entry} is missing player data"))?;
        let player_name = player
            .get("name")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| format!("{entry} is missing player.name"))?;
        let history = match player.get("history") {
            Some(value) if value.is_array() => value.clone(),
            None => json!([]),
            _ => return Err(format!("{entry} player.history must be an array")),
        };
        let attributes = match player.get("attributes") {
            Some(value) if value.is_object() => value.clone(),
            None => json!({}),
            _ => return Err(format!("{entry} player.attributes must be an object")),
        };
        let inventory = match player.get("inventory") {
            Some(value) if value.is_array() => value.clone(),
            None => json!([]),
            _ => return Err(format!("{entry} player.inventory must be an array")),
        };
        let qa_history = match player.get("qaHistory") {
            Some(value) if value.is_array() => value.clone(),
            None => json!([]),
            _ => return Err(format!("{entry} player.qaHistory must be an array")),
        };
        let player_summary = match player.get("summary") {
            None => "",
            Some(Value::String(value)) => value.as_str(),
            _ => return Err(format!("{entry} player.summary must be a string")),
        };
        if let Some(value) = player.get("createdAt") {
            if !value.is_string() {
                return Err(format!("{entry} player.createdAt must be a string"));
            }
        }
        if !history.as_array().is_some_and(|items| {
            items.iter().all(|item| {
                item["scenario"].is_string()
                    && item["scenarioDescription"].is_string()
                    && item["choice"].is_string()
                    && item["choiceId"].is_string()
            })
        }) || !attributes
            .as_object()
            .is_some_and(|items| items.values().all(Value::is_number))
            || !inventory
                .as_array()
                .is_some_and(|items| items.iter().all(Value::is_string))
            || !qa_history.as_array().is_some_and(|items| {
                items.iter().all(|item| {
                    matches!(item["role"].as_str(), Some("user" | "assistant"))
                        && item["content"].is_string()
                        && (item.get("id").is_none() || item["id"].is_string())
                })
            })
        {
            return Err(format!("{entry} contains invalid nested player data"));
        }
        let scenarios = session["scenarios"]
            .as_array()
            .filter(|items| {
                !items.is_empty()
                    && items.iter().all(|scenario| {
                        scenario["id"].is_string()
                            && scenario["title"].is_string()
                            && scenario["description"].is_string()
                            && (scenario.get("context").is_none()
                                || scenario["context"].is_string())
                            && scenario["choices"].as_array().is_some_and(|choices| {
                                choices.iter().all(|choice| {
                                    choice["id"].is_string()
                                        && choice["text"].is_string()
                                        && (choice.get("description").is_none()
                                            || choice["description"].is_string())
                                })
                            })
                    })
            })
            .ok_or_else(|| format!("{entry} scenarios must contain valid scene data"))?;
        let is_active = match session.get("isActive") {
            Some(value) => value
                .as_bool()
                .ok_or_else(|| format!("{entry} isActive must be boolean"))?,
            None => true,
        };
        let end_reason = match session.get("endReason") {
            None | Some(Value::Null) => None,
            Some(Value::String(value))
                if matches!(
                    value.as_str(),
                    "player_ended" | "story_ending" | "max_choices" | "max_history"
                ) =>
            {
                Some(value.as_str())
            }
            _ => return Err(format!("{entry} has an invalid endReason")),
        };
        let biography = match session.get("biography") {
            None | Some(Value::Null) => None,
            Some(Value::String(value)) => Some(value.as_str()),
            _ => return Err(format!("{entry} biography must be a string")),
        };
        let biography_generation = match session.get("biographyGeneration") {
            None | Some(Value::Null) => None,
            Some(Value::Object(value)) => {
                let provider = value.get("provider").and_then(Value::as_str);
                let model = value.get("model").and_then(Value::as_str);
                let generated_at = value.get("generatedAt").and_then(Value::as_str);
                if !provider.is_some_and(|provider| {
                    matches!(
                        provider,
                        "deepseek" | "openai" | "ollama" | "llamacpp" | "llamacpp_local" | "custom"
                    )
                }) || !model.is_some_and(|model| !model.is_empty())
                    || !generated_at.is_some_and(|generated_at| !generated_at.is_empty())
                {
                    return Err(format!("{entry} has invalid biographyGeneration metadata"));
                }
                Some(Value::Object(value.clone()).to_string())
            }
            _ => return Err(format!("{entry} biographyGeneration must be an object")),
        };
        let created_at = match session.get("createdAt") {
            None => None,
            Some(Value::String(value)) if !value.is_empty() => Some(value.as_str()),
            _ => return Err(format!("{entry} createdAt must be a non-empty string")),
        };

        sqlx::query(
            "INSERT INTO sessions
             (session_id, schema_version, world, world_source, world_type, game_mode, system, player_name,
              player_history, player_attributes, player_inventory,
              player_summary, player_qa_history, scenarios_json,
              is_active, end_reason, biography, biography_generation, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), datetime('now'))
             ON CONFLICT(session_id) DO UPDATE SET
              schema_version=excluded.schema_version, world=excluded.world,
              world_source=excluded.world_source, world_type=excluded.world_type,
              game_mode=excluded.game_mode, system=excluded.system, player_name=excluded.player_name,
              player_history=excluded.player_history, player_attributes=excluded.player_attributes,
              player_inventory=excluded.player_inventory, player_summary=excluded.player_summary,
              player_qa_history=excluded.player_qa_history, scenarios_json=excluded.scenarios_json,
              is_active=excluded.is_active, end_reason=excluded.end_reason,
              biography=excluded.biography, biography_generation=excluded.biography_generation,
              updated_at=datetime('now')",
        )
        .bind(session_id)
        .bind(schema_version)
        .bind(world)
        .bind(world_source)
        .bind(world_type)
        .bind(game_mode)
        .bind(system)
        .bind(player_name)
        .bind(history.to_string())
        .bind(attributes.to_string())
        .bind(inventory.to_string())
        .bind(player_summary)
        .bind(qa_history.to_string())
        .bind(Value::Array(scenarios.clone()).to_string())
        .bind(if is_active { 1 } else { 0 })
        .bind(end_reason)
        .bind(biography)
        .bind(biography_generation)
        .bind(created_at)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(sessions.len())
}

#[tauri::command]
pub async fn import_full_data(state: State<'_, AppDb>, data: String) -> Result<String, String> {
    let imported = import_full_data_into_pool(&state.pool, &data).await?;

    Ok(format!("Successfully imported {imported} session(s)"))
}

// ── Helper functions ───────────────────────────────────────────

fn clean_old_backups(backups_dir: &PathBuf, max_count: usize) -> Result<(), String> {
    let mut backups = Vec::new();
    if let Ok(entries) = fs::read_dir(backups_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().is_some_and(|ext| ext == "db") {
                if let Ok(meta) = path.metadata() {
                    if let Ok(modified) = meta.modified() {
                        backups.push((path, modified));
                    }
                }
            }
        }
    }

    backups.sort_by_key(|item| item.1);

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
    use crate::db::init_db;
    use sqlx::sqlite::SqlitePoolOptions;
    use std::fs;
    use std::path::PathBuf;
    use std::thread;
    use std::time::Duration;

    /// Helper: create a test directory with N backup `.db` files, each with
    /// a distinct mtime (ascending — oldest first).
    fn create_backup_files(dir: &PathBuf, count: usize, prefix: &str) {
        fs::create_dir_all(dir).unwrap();
        for i in 0..count {
            let path = dir.join(format!("{}-{}.db", prefix, i));
            fs::write(&path, format!("data {}", i)).unwrap();
            // Space out mtimes so ordering is deterministic
            thread::sleep(Duration::from_millis(15));
        }
    }

    /// Count `.db` files in a directory.
    fn count_db_files(dir: &PathBuf) -> usize {
        fs::read_dir(dir)
            .unwrap()
            .filter(|e| {
                e.as_ref()
                    .map(|e| e.path().extension().is_some_and(|ext| ext == "db"))
                    .unwrap_or(false)
            })
            .count()
    }

    async fn file_pool(path: &std::path::Path) -> SqlitePool {
        let options = SqliteConnectOptions::new()
            .filename(path)
            .create_if_missing(true);
        SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn test_consistent_snapshot_and_transactional_restore() {
        let dir = std::env::temp_dir().join(format!("bio_snapshot_{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let live_path = dir.join("live.db");
        let backup_path = dir.join("backup.db");
        let pool = file_pool(&live_path).await;
        init_db(&pool).await.unwrap();
        sqlx::query(
            "INSERT INTO sessions
             (session_id, world, player_name, biography_generation)
             VALUES ('one', 'before', '角色', ?)",
        )
        .bind(r#"{"provider":"openai","model":"gpt-4o-mini","generatedAt":"2026-01-01T00:00:00Z"}"#)
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query("INSERT INTO config (key, value) VALUES ('app_config', ?)")
            .bind(r#"{"provider":"openai","apiKey":"legacy-secret"}"#)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO config (key, value) VALUES ('app_settings', ?)")
            .bind("malformed apiKey=another-secret")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO config (key, value) VALUES ('theme', 'backup-theme')")
            .execute(&pool)
            .await
            .unwrap();

        create_backup_snapshot(&pool, &backup_path).await.unwrap();
        let integrity: String = sqlx::query_scalar("PRAGMA integrity_check")
            .fetch_one(&file_pool(&backup_path).await)
            .await
            .unwrap();
        assert_eq!(integrity, "ok");

        sqlx::query(
            "UPDATE sessions SET world='after', biography_generation=NULL WHERE session_id='one'",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query("UPDATE config SET value=? WHERE key='app_config'")
            .bind(r#"{"provider":"deepseek","model":"deepseek-chat"}"#)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("UPDATE config SET value=? WHERE key='app_settings'")
            .bind(r#"{"temperature":0.4}"#)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("UPDATE config SET value='current-theme' WHERE key='theme'")
            .execute(&pool)
            .await
            .unwrap();
        restore_from_snapshot(&pool, &backup_path).await.unwrap();
        let world: String = sqlx::query_scalar("SELECT world FROM sessions WHERE session_id='one'")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(world, "before");
        let biography_generation: String =
            sqlx::query_scalar("SELECT biography_generation FROM sessions WHERE session_id='one'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert!(biography_generation.contains("gpt-4o-mini"));
        let restored_config: String =
            sqlx::query_scalar("SELECT value FROM config WHERE key='app_config'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(
            restored_config,
            r#"{"provider":"deepseek","model":"deepseek-chat"}"#
        );
        let restored_settings: String =
            sqlx::query_scalar("SELECT value FROM config WHERE key='app_settings'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(restored_settings, r#"{"temperature":0.4}"#);
        let restored_theme: String =
            sqlx::query_scalar("SELECT value FROM config WHERE key='theme'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(restored_theme, "current-theme");
        pool.close().await;
        fs::remove_dir_all(dir).unwrap();
    }

    #[tokio::test]
    async fn test_schema_v2_backup_restores_with_empty_biography_metadata() {
        let dir = std::env::temp_dir().join(format!("bio_v2_restore_{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let live_path = dir.join("live.db");
        let backup_path = dir.join("v2.db");
        let live_pool = file_pool(&live_path).await;
        init_db(&live_pool).await.unwrap();
        sqlx::query(
            "INSERT INTO sessions (session_id, world, player_name, biography_generation)
             VALUES ('live', 'current', '角色', '{}')",
        )
        .execute(&live_pool)
        .await
        .unwrap();

        let backup_pool = file_pool(&backup_path).await;
        init_db(&backup_pool).await.unwrap();
        sqlx::query(
            "INSERT INTO sessions (session_id, world, player_name)
             VALUES ('backup', 'restored', '旧角色')",
        )
        .execute(&backup_pool)
        .await
        .unwrap();
        sqlx::query("ALTER TABLE sessions DROP COLUMN biography_generation")
            .execute(&backup_pool)
            .await
            .unwrap();
        sqlx::query("PRAGMA user_version = 2")
            .execute(&backup_pool)
            .await
            .unwrap();
        backup_pool.close().await;

        restore_from_snapshot(&live_pool, &backup_path)
            .await
            .unwrap();
        let restored: (String, Option<String>) = sqlx::query_as(
            "SELECT world, biography_generation FROM sessions WHERE session_id='backup'",
        )
        .fetch_one(&live_pool)
        .await
        .unwrap();
        assert_eq!(restored, ("restored".to_string(), None));
        live_pool.close().await;
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn test_database_info_serializes_with_frontend_field_names() {
        let value = serde_json::to_value(DatabaseInfo {
            path: "/data/biography.db".to_string(),
            size: 1024,
            session_count: 3,
            active_count: 2,
        })
        .unwrap();
        assert_eq!(value["sessionCount"], 3);
        assert_eq!(value["activeCount"], 2);
        assert!(value.get("session_count").is_none());
        assert!(value.get("active_count").is_none());
    }

    #[tokio::test]
    async fn test_failed_restore_rolls_back_live_database() {
        let dir = std::env::temp_dir().join(format!("bio_rollback_{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let live_path = dir.join("live.db");
        let bad_path = dir.join("bad.db");
        let pool = file_pool(&live_path).await;
        init_db(&pool).await.unwrap();
        sqlx::query(
            "INSERT INTO sessions (session_id, world, player_name) VALUES ('safe', 'current', '角色')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query("INSERT INTO config (key, value) VALUES ('app_config', 'current-config')")
            .execute(&pool)
            .await
            .unwrap();

        let bad_pool = file_pool(&bad_path).await;
        sqlx::query("CREATE TABLE sessions (session_id TEXT PRIMARY KEY)")
            .execute(&bad_pool)
            .await
            .unwrap();
        sqlx::query("CREATE TABLE config (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
            .execute(&bad_pool)
            .await
            .unwrap();
        sqlx::query("PRAGMA user_version = 2")
            .execute(&bad_pool)
            .await
            .unwrap();
        bad_pool.close().await;

        assert!(restore_from_snapshot(&pool, &bad_path).await.is_err());
        let count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM sessions WHERE session_id='safe'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(count, 1);
        let config: String = sqlx::query_scalar("SELECT value FROM config WHERE key='app_config'")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(config, "current-config");
        pool.close().await;
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn test_backup_path_validation_rejects_unmanaged_files() {
        let root = std::env::temp_dir().join(format!("bio_path_{}", uuid::Uuid::new_v4()));
        let backups = root.join("backups");
        fs::create_dir_all(&backups).unwrap();
        let managed = backups.join("managed.db");
        let outside = root.join("outside.db");
        let wrong_extension = backups.join("managed.sqlite");
        fs::write(&managed, "db").unwrap();
        fs::write(&outside, "db").unwrap();
        fs::write(&wrong_extension, "db").unwrap();

        assert_eq!(
            validate_backup_path(&root, managed.to_str().unwrap()).unwrap(),
            managed.canonicalize().unwrap()
        );
        assert!(validate_backup_path(&root, outside.to_str().unwrap()).is_err());
        assert!(validate_backup_path(&root, wrong_extension.to_str().unwrap()).is_err());

        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn test_v1_json_import_remains_marked_for_world_ref_normalization() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        init_db(&pool).await.unwrap();
        let data = json!({
            "version": "1.0",
            "sessions": [{
                "sessionId": "legacy-import",
                "world": "user-directory",
                "gameMode": "basic",
                "system": null,
                "player": {
                    "name": "旧角色",
                    "history": [],
                    "attributes": {},
                    "inventory": [],
                    "summary": "",
                    "qaHistory": []
                },
                "scenarios": [{
                    "id": "scene-1",
                    "title": "序章",
                    "description": "开始",
                    "choices": []
                }],
                "isActive": true,
                "endReason": null,
                "biography": "旧传记",
                "biographyGeneration": {
                    "provider": "openai",
                    "model": "gpt-4o-mini",
                    "generatedAt": "2026-01-01T00:00:00Z"
                }
            }]
        })
        .to_string();

        assert_eq!(import_full_data_into_pool(&pool, &data).await.unwrap(), 1);
        let metadata: (i64, String, String, String) = sqlx::query_as(
            "SELECT schema_version, world_source, world_type, biography_generation
             FROM sessions WHERE session_id = ?",
        )
        .bind("legacy-import")
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(metadata.0, 1);
        assert_eq!(metadata.1, "builtin");
        assert_eq!(metadata.2, "single");
        assert!(metadata.3.contains("gpt-4o-mini"));

        let exported: Value =
            serde_json::from_str(&export_full_data_from_pool(&pool).await.unwrap()).unwrap();
        assert_eq!(
            exported["sessions"][0]["biographyGeneration"]["model"],
            "gpt-4o-mini"
        );
    }

    #[tokio::test]
    async fn test_invalid_json_import_rolls_back_all_sessions() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        init_db(&pool).await.unwrap();
        sqlx::query(
            "INSERT INTO sessions (session_id, world, player_name) VALUES ('safe', 'world', '角色')",
        )
        .execute(&pool)
        .await
        .unwrap();
        let valid = json!({
            "sessionId": "new",
            "world": "world",
            "gameMode": "basic",
            "player": { "name": "新角色", "history": [], "attributes": {}, "inventory": [] },
            "scenarios": [{ "id": "scene", "title": "序章", "description": "开始", "choices": [] }],
            "isActive": true
        });
        let invalid = json!({
            "sessionId": "bad",
            "world": "world",
            "gameMode": "basic",
            "player": { "name": "坏数据", "history": [], "attributes": {}, "inventory": [] },
            "scenarios": [{
                "id": "scene", "title": "序章", "description": "开始",
                "context": 42, "choices": []
            }],
            "isActive": true
        });
        let data = json!({ "sessions": [valid, invalid] }).to_string();

        assert!(import_full_data_into_pool(&pool, &data).await.is_err());
        let ids: Vec<String> =
            sqlx::query_scalar("SELECT session_id FROM sessions ORDER BY session_id")
                .fetch_all(&pool)
                .await
                .unwrap();
        assert_eq!(ids, vec!["safe".to_string()]);
    }

    // ── clean_old_backups ────────────────────────────────────────

    #[test]
    fn test_clean_old_backups_removes_oldest() {
        let dir = std::env::temp_dir().join("bio_test_remove_oldest");
        create_backup_files(&dir, 5, "backup");

        // Keep only 3 → oldest 2 should be removed
        clean_old_backups(&dir, 3).unwrap();
        assert_eq!(count_db_files(&dir), 3);

        // The 3 survivors should be the 3 newest (backup-2, backup-3, backup-4)
        for i in 2..5 {
            assert!(
                dir.join(format!("backup-{}.db", i)).exists(),
                "backup-{}.db should still exist",
                i
            );
        }
        // The 2 oldest (backup-0, backup-1) should be gone
        assert!(!dir.join("backup-0.db").exists());
        assert!(!dir.join("backup-1.db").exists());

        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_clean_old_backups_no_op_when_under_limit() {
        let dir = std::env::temp_dir().join("bio_test_noop");
        create_backup_files(&dir, 3, "backup");

        // max_count = 10, only 3 exist → nothing removed
        clean_old_backups(&dir, 10).unwrap();
        assert_eq!(count_db_files(&dir), 3);

        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_clean_old_backups_no_op_when_exactly_at_limit() {
        let dir = std::env::temp_dir().join("bio_test_exact");
        create_backup_files(&dir, 5, "backup");

        // max_count = 5, exactly 5 exist → nothing removed
        clean_old_backups(&dir, 5).unwrap();
        assert_eq!(count_db_files(&dir), 5);

        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_clean_old_backups_ignores_non_db_files() {
        let dir = std::env::temp_dir().join("bio_test_non_db");
        fs::create_dir_all(&dir).unwrap();

        // Create a mix: .db files and other files
        fs::write(dir.join("notes.txt"), "hello").unwrap();
        fs::write(dir.join("data.json"), "{}").unwrap();
        thread::sleep(Duration::from_millis(10));
        fs::write(dir.join("backup-0.db"), "data").unwrap();
        thread::sleep(Duration::from_millis(10));
        fs::write(dir.join("backup-1.db"), "data").unwrap();
        thread::sleep(Duration::from_millis(10));
        fs::write(dir.join("backup-2.db"), "data").unwrap();

        // max_count = 1 → only 1 .db should remain; .txt and .json stay
        clean_old_backups(&dir, 1).unwrap();
        assert_eq!(count_db_files(&dir), 1, "Only 1 .db file should remain");
        // Non-.db files must not be touched
        assert!(dir.join("notes.txt").exists(), "notes.txt should remain");
        assert!(dir.join("data.json").exists(), "data.json should remain");

        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_clean_old_backups_empty_directory() {
        let dir = std::env::temp_dir().join("bio_test_empty");
        fs::create_dir_all(&dir).unwrap();

        // No files at all – should not error
        clean_old_backups(&dir, 5).unwrap();

        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_clean_old_backups_keeps_all_when_max_count_is_zero() {
        let dir = std::env::temp_dir().join("bio_test_zero_max");
        create_backup_files(&dir, 3, "backup");

        // max_count = 0 → all files removed
        clean_old_backups(&dir, 0).unwrap();
        assert_eq!(count_db_files(&dir), 0);

        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_clean_old_backups_large_count() {
        let dir = std::env::temp_dir().join("bio_test_large");
        create_backup_files(&dir, 20, "backup");

        // Keep only 5 out of 20 → 15 removed
        clean_old_backups(&dir, 5).unwrap();
        assert_eq!(count_db_files(&dir), 5);

        // Verify the 5 newest survived (backup-15 through backup-19)
        for i in 15..20 {
            assert!(
                dir.join(format!("backup-{}.db", i)).exists(),
                "backup-{}.db should survive",
                i
            );
        }

        fs::remove_dir_all(&dir).unwrap();
    }
}
