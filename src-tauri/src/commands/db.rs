// src-tauri/src/commands/db.rs - SQLite session CRUD

use crate::AppDb;
use serde_json::Value;
use sqlx::{Row, SqlitePool};
use tauri::State;

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CorruptedSessionInfo {
    session_id: String,
    error: String,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionListResult {
    sessions: Vec<Value>,
    corrupted_sessions: Vec<CorruptedSessionInfo>,
}

const SESSION_COLUMNS: &str =
    "session_id, schema_version, world, world_source, world_type, game_mode, system, player_name,
     player_history, player_attributes, player_inventory, player_summary, player_qa_history,
     scenarios_json, is_active, end_reason, biography, biography_generation, created_at";

fn parse_json(field: &str, raw: &str) -> Result<Value, String> {
    serde_json::from_str(raw)
        .map_err(|error| format!("会话损坏：字段 {field} 不是有效 JSON（{error}）"))
}

fn row_to_session(row: &sqlx::sqlite::SqliteRow) -> Result<Value, String> {
    let history = parse_json("player_history", row.get("player_history"))?;
    let attributes = parse_json("player_attributes", row.get("player_attributes"))?;
    let inventory = parse_json("player_inventory", row.get("player_inventory"))?;
    let qa_history = parse_json("player_qa_history", row.get("player_qa_history"))?;
    let scenarios = parse_json("scenarios_json", row.get("scenarios_json"))?;
    let biography_generation = row
        .get::<Option<String>, _>("biography_generation")
        .map(|raw| parse_json("biography_generation", &raw))
        .transpose()?;

    if !history.is_array()
        || !inventory.is_array()
        || !qa_history.is_array()
        || !scenarios.is_array()
    {
        return Err("会话损坏：历史、物品、问答或场景字段类型无效".to_string());
    }
    if !attributes.is_object() {
        return Err("会话损坏：角色属性字段类型无效".to_string());
    }

    let current_scenario = scenarios
        .as_array()
        .and_then(|items| items.last())
        .and_then(|item| item.get("id"))
        .and_then(Value::as_str)
        .unwrap_or("");
    let created_at: String = row.get("created_at");

    Ok(serde_json::json!({
        "schemaVersion": row.get::<i64, _>("schema_version"),
        "sessionId": row.get::<String, _>("session_id"),
        "world": row.get::<String, _>("world"),
        "worldRef": {
            "name": row.get::<String, _>("world"),
            "source": row.get::<String, _>("world_source"),
            "type": row.get::<String, _>("world_type"),
        },
        "gameMode": row.get::<String, _>("game_mode"),
        "system": row.get::<Option<String>, _>("system"),
        "player": {
            "name": row.get::<String, _>("player_name"),
            "currentScenario": current_scenario,
            "history": history,
            "attributes": attributes,
            "inventory": inventory,
            "summary": row.get::<String, _>("player_summary"),
            "qaHistory": qa_history,
            "createdAt": created_at,
        },
        "scenarios": scenarios,
        "isActive": row.get::<bool, _>("is_active"),
        "endReason": row.get::<Option<String>, _>("end_reason"),
        "biography": row.get::<Option<String>, _>("biography"),
        "biographyGeneration": biography_generation,
        "createdAt": created_at,
    }))
}

async fn save_session_into_pool(pool: &SqlitePool, session: &Value) -> Result<(), String> {
    let session_id = session["sessionId"].as_str().ok_or("Missing sessionId")?;
    let world = session["worldRef"]["name"]
        .as_str()
        .or_else(|| session["world"].as_str())
        .ok_or("Missing worldRef.name")?;
    let created_at = session["createdAt"].as_str();
    let biography_generation = session
        .get("biographyGeneration")
        .filter(|value| !value.is_null())
        .map(Value::to_string);

    sqlx::query(
        "INSERT INTO sessions
         (session_id, schema_version, world, world_source, world_type, game_mode, system, player_name,
          player_history, player_attributes, player_inventory, player_summary, player_qa_history,
          scenarios_json, is_active, end_reason, biography, biography_generation, created_at, updated_at)
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
    .bind(session["schemaVersion"].as_i64().unwrap_or(2))
    .bind(world)
    .bind(session["worldRef"]["source"].as_str().unwrap_or("builtin"))
    .bind(session["worldRef"]["type"].as_str().unwrap_or("single"))
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
    .bind(session["endReason"].as_str())
    .bind(session["biography"].as_str())
    .bind(biography_generation)
    .bind(created_at)
    .execute(pool)
    .await
    .map_err(|error| error.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn save_session(state: State<'_, AppDb>, session: Value) -> Result<(), String> {
    save_session_into_pool(&state.pool, &session).await
}

async fn get_session_from_pool(
    pool: &SqlitePool,
    session_id: &str,
) -> Result<Option<Value>, String> {
    let query = format!("SELECT {SESSION_COLUMNS} FROM sessions WHERE session_id = ?");
    let row = sqlx::query(&query)
        .bind(session_id)
        .fetch_optional(pool)
        .await
        .map_err(|error| error.to_string())?;
    row.map(|item| row_to_session(&item)).transpose()
}

#[tauri::command]
pub async fn get_session(
    state: State<'_, AppDb>,
    session_id: String,
) -> Result<Option<Value>, String> {
    get_session_from_pool(&state.pool, &session_id).await
}

async fn list_sessions_from_pool(
    pool: &SqlitePool,
    active_only: bool,
) -> Result<SessionListResult, String> {
    let filter = if active_only {
        " WHERE is_active = 1"
    } else {
        ""
    };
    let query =
        format!("SELECT {SESSION_COLUMNS} FROM sessions{filter} ORDER BY created_at DESC LIMIT 50");
    let rows = sqlx::query(&query)
        .fetch_all(pool)
        .await
        .map_err(|error| error.to_string())?;
    let mut sessions = Vec::with_capacity(rows.len());
    let mut corrupted_sessions = Vec::new();
    for row in &rows {
        match row_to_session(row) {
            Ok(session) => sessions.push(session),
            Err(error) => corrupted_sessions.push(CorruptedSessionInfo {
                session_id: row.get::<String, _>("session_id"),
                error,
            }),
        }
    }
    Ok(SessionListResult {
        sessions,
        corrupted_sessions,
    })
}

#[tauri::command]
pub async fn list_sessions(
    state: State<'_, AppDb>,
    active_only: Option<bool>,
) -> Result<SessionListResult, String> {
    list_sessions_from_pool(&state.pool, active_only.unwrap_or(false)).await
}

#[tauri::command]
pub async fn delete_session(state: State<'_, AppDb>, session_id: String) -> Result<bool, String> {
    let result = sqlx::query("DELETE FROM sessions WHERE session_id = ?")
        .bind(session_id)
        .execute(&state.pool)
        .await
        .map_err(|error| error.to_string())?;
    Ok(result.rows_affected() > 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::init_db;
    use serde_json::json;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn memory_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        init_db(&pool).await.unwrap();
        pool
    }

    fn session(created_at: &str) -> Value {
        json!({
            "schemaVersion": 2,
            "sessionId": "round-trip",
            "world": "mine.md",
            "worldRef": { "name": "mine.md", "source": "user", "type": "single" },
            "gameMode": "basic",
            "player": {
                "name": "角色",
                "currentScenario": "scene",
                "history": [],
                "attributes": {},
                "inventory": [],
                "summary": "",
                "qaHistory": [],
                "createdAt": created_at
            },
            "scenarios": [{
                "id": "scene", "title": "序章", "description": "开始", "choices": []
            }],
            "isActive": false,
            "endReason": "player_ended",
            "createdAt": created_at
        })
    }

    #[tokio::test]
    async fn session_v2_round_trip_preserves_metadata_and_original_creation_time() {
        let pool = memory_pool().await;
        let original_created_at = "2026-01-01T00:00:00.000Z";
        save_session_into_pool(&pool, &session(original_created_at))
            .await
            .unwrap();

        let mut update = session("2099-01-01T00:00:00.000Z");
        update["biography"] = json!("传记");
        update["biographyGeneration"] = json!({
            "provider": "openai",
            "model": "gpt-4o-mini",
            "generatedAt": "2026-01-02T00:00:00.000Z"
        });
        save_session_into_pool(&pool, &update).await.unwrap();

        let restored = get_session_from_pool(&pool, "round-trip")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(restored["worldRef"]["source"], "user");
        assert_eq!(restored["worldRef"]["type"], "single");
        assert_eq!(restored["endReason"], "player_ended");
        assert_eq!(restored["createdAt"], original_created_at);
        assert_eq!(restored["player"]["currentScenario"], "scene");
        assert_eq!(restored["biography"], "传记");
        assert_eq!(restored["biographyGeneration"]["provider"], "openai");
        assert_eq!(restored["biographyGeneration"]["model"], "gpt-4o-mini");

        for (index, reason) in ["player_ended", "story_ending", "max_choices", "max_history"]
            .iter()
            .enumerate()
        {
            let mut value = session(original_created_at);
            value["sessionId"] = json!(format!("end-reason-{index}"));
            value["endReason"] = json!(reason);
            save_session_into_pool(&pool, &value).await.unwrap();
            let loaded = get_session_from_pool(&pool, &format!("end-reason-{index}"))
                .await
                .unwrap()
                .unwrap();
            assert_eq!(loaded["endReason"], *reason);
        }
    }

    #[tokio::test]
    async fn session_list_keeps_valid_rows_and_reports_corrupted_rows() {
        let pool = memory_pool().await;
        let mut valid = session("2026-01-01T00:00:00.000Z");
        valid["sessionId"] = json!("valid-session");
        valid["isActive"] = json!(true);
        save_session_into_pool(&pool, &valid).await.unwrap();

        let mut corrupted = session("2026-01-02T00:00:00.000Z");
        corrupted["sessionId"] = json!("broken-session");
        corrupted["isActive"] = json!(true);
        save_session_into_pool(&pool, &corrupted).await.unwrap();
        sqlx::query("UPDATE sessions SET player_history = ? WHERE session_id = ?")
            .bind("{bad-json")
            .bind("broken-session")
            .execute(&pool)
            .await
            .unwrap();

        let result = list_sessions_from_pool(&pool, true).await.unwrap();
        assert_eq!(result.sessions.len(), 1);
        assert_eq!(result.sessions[0]["sessionId"], "valid-session");
        assert_eq!(result.corrupted_sessions.len(), 1);
        assert_eq!(result.corrupted_sessions[0].session_id, "broken-session");
        assert!(result.corrupted_sessions[0].error.contains("会话损坏"));
    }
}
