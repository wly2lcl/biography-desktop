// src-tauri/src/commands/db.rs - SQLite session CRUD

use crate::AppDb;
use serde_json::Value;
use sqlx::Row;
use tauri::State;

fn row_to_session(row: &sqlx::sqlite::SqliteRow) -> Value {
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

    serde_json::json!({
        "sessionId": session_id,
        "world": world,
        "gameMode": game_mode,
        "system": system,
        "player": {
            "name": player_name,
            "currentScenario": "",
            "history": serde_json::from_str::<Value>(&player_history).unwrap_or(Value::Array(vec![])),
            "attributes": serde_json::from_str::<Value>(&player_attributes).unwrap_or(Value::Object(serde_json::Map::new())),
            "inventory": serde_json::from_str::<Value>(&player_inventory).unwrap_or(Value::Array(vec![])),
            "summary": player_summary,
            "qaHistory": serde_json::from_str::<Value>(&player_qa_history).unwrap_or(Value::Array(vec![])),
            "createdAt": created_at,
        },
        "scenarios": serde_json::from_str::<Value>(&scenarios_json).unwrap_or(Value::Array(vec![])),
        "isActive": is_active,
        "biography": biography,
        "createdAt": created_at,
    })
}

#[tauri::command]
pub async fn save_session(
    state: State<'_, AppDb>,
    session: Value,
) -> Result<(), String> {
    let session_id = session["sessionId"]
        .as_str()
        .ok_or("Missing sessionId")?
        .to_string();

    sqlx::query(
        "INSERT OR REPLACE INTO sessions 
         (session_id, world, game_mode, system, player_name,
          player_history, player_attributes, player_inventory,
          player_summary, player_qa_history, scenarios_json,
          is_active, biography, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
    )
    .bind(&session_id)
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
    .execute(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_session(
    state: State<'_, AppDb>,
    session_id: String,
) -> Result<Option<Value>, String> {
    let row = sqlx::query(
        "SELECT session_id, world, game_mode, system, player_name,
                player_history, player_attributes, player_inventory,
                player_summary, player_qa_history, scenarios_json,
                is_active, biography, created_at
         FROM sessions WHERE session_id = ?",
    )
    .bind(&session_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    match row {
        Some(row) => Ok(Some(row_to_session(&row))),
        None => Ok(None),
    }
}

#[tauri::command]
pub async fn list_sessions(
    state: State<'_, AppDb>,
    active_only: Option<bool>,
) -> Result<Vec<Value>, String> {
    let active_only = active_only.unwrap_or(false);

    let query = if active_only {
        "SELECT session_id, world, game_mode, system, player_name,
                player_history, player_attributes, player_inventory,
                player_summary, player_qa_history, scenarios_json,
                is_active, biography, created_at
         FROM sessions WHERE is_active = 1
         ORDER BY created_at DESC LIMIT 50"
    } else {
        "SELECT session_id, world, game_mode, system, player_name,
                player_history, player_attributes, player_inventory,
                player_summary, player_qa_history, scenarios_json,
                is_active, biography, created_at
         FROM sessions
         ORDER BY created_at DESC LIMIT 50"
    };

    let rows = sqlx::query(query)
        .fetch_all(&state.pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(rows.iter().map(|row| row_to_session(row)).collect())
}

#[tauri::command]
pub async fn delete_session(
    state: State<'_, AppDb>,
    session_id: String,
) -> Result<bool, String> {
    let result = sqlx::query("DELETE FROM sessions WHERE session_id = ?")
        .bind(&session_id)
        .execute(&state.pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(result.rows_affected() > 0)
}
