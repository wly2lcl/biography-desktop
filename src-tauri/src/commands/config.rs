// src-tauri/src/commands/config.rs - Config + API Key management

use crate::AppDb;
use serde_json::Value;
use tauri::State;

fn sanitize_config_value(key: &str, value: String) -> Result<String, String> {
    if key != "app_config" && key != "app_settings" {
        return Ok(value);
    }
    let mut parsed: Value =
        serde_json::from_str(&value).map_err(|error| format!("Invalid {key} JSON: {error}"))?;
    let object = parsed
        .as_object_mut()
        .ok_or_else(|| format!("{key} must be a JSON object"))?;
    object.remove("apiKey");
    serde_json::to_string(&parsed).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn get_config(state: State<'_, AppDb>, key: String) -> Result<Option<String>, String> {
    let row: Option<(String,)> = sqlx::query_as("SELECT value FROM config WHERE key = ?")
        .bind(&key)
        .fetch_optional(&state.pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(row.map(|r| r.0))
}

#[tauri::command]
pub async fn set_config(state: State<'_, AppDb>, key: String, value: String) -> Result<(), String> {
    let value = sanitize_config_value(&key, value)?;
    sqlx::query("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)")
        .bind(&key)
        .bind(&value)
        .execute(&state.pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn general_settings_cannot_persist_api_keys() {
        let sanitized = sanitize_config_value(
            "app_settings",
            r#"{"model":"gpt-4o-mini","apiKey":"secret"}"#.to_string(),
        )
        .unwrap();
        assert_eq!(sanitized, r#"{"model":"gpt-4o-mini"}"#);
        assert!(sanitize_config_value("app_config", "not-json".to_string()).is_err());
        assert_eq!(
            sanitize_config_value("unrelated", "plain-value".to_string()).unwrap(),
            "plain-value"
        );
    }
}

#[tauri::command]
pub async fn get_api_key() -> Result<String, String> {
    match keyring::Entry::new("biography-desktop", "api-key") {
        Ok(entry) => match entry.get_password() {
            Ok(key) => Ok(key),
            Err(keyring::Error::NoEntry) => Ok(String::new()),
            Err(e) => Err(e.to_string()),
        },
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn set_api_key(api_key: String) -> Result<(), String> {
    match keyring::Entry::new("biography-desktop", "api-key") {
        Ok(entry) if api_key.is_empty() => match entry.delete_password() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        },
        Ok(entry) => entry.set_password(&api_key).map_err(|e| e.to_string()),
        Err(e) => Err(e.to_string()),
    }
}
