// src-tauri/src/commands/config.rs - Config + API Key management

use crate::AppDb;
use tauri::State;

#[tauri::command]
pub async fn get_config(
    state: State<'_, AppDb>,
    key: String,
) -> Result<Option<String>, String> {
    let row: Option<(String,)> =
        sqlx::query_as("SELECT value FROM config WHERE key = ?")
            .bind(&key)
            .fetch_optional(&state.pool)
            .await
            .map_err(|e| e.to_string())?;

    Ok(row.map(|r| r.0))
}

#[tauri::command]
pub async fn set_config(
    state: State<'_, AppDb>,
    key: String,
    value: String,
) -> Result<(), String> {
    sqlx::query(
        "INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)",
    )
    .bind(&key)
    .bind(&value)
    .execute(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
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
        Ok(entry) => entry
            .set_password(&api_key)
            .map_err(|e| e.to_string()),
        Err(e) => Err(e.to_string()),
    }
}
