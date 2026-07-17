// src-tauri/src/commands/config.rs - Config + API Key management

use super::key_scope::{api_key_account, is_stable_provider, KEYRING_SERVICE, LEGACY_KEY_ACCOUNT};
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

fn read_account(account: &str) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, account).map_err(|error| error.to_string())?;
    match entry.get_password() {
        Ok(key) if !key.is_empty() => Ok(Some(key)),
        Ok(_) | Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

fn write_account(account: &str, api_key: &str) -> Result<(), String> {
    match keyring::Entry::new(KEYRING_SERVICE, account) {
        Ok(entry) if api_key.is_empty() => match entry.delete_password() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        },
        Ok(entry) => entry.set_password(api_key).map_err(|e| e.to_string()),
        Err(e) => Err(e.to_string()),
    }
}

pub(crate) fn read_api_key(provider: &str, base_url: &str) -> Result<Option<String>, String> {
    let account = api_key_account(provider, base_url)?;
    if let Some(key) = read_account(&account)? {
        return Ok(Some(key));
    }
    if !is_stable_provider(provider) {
        return Ok(None);
    }

    let Some(legacy_key) = read_account(LEGACY_KEY_ACCOUNT)? else {
        return Ok(None);
    };
    write_account(LEGACY_KEY_ACCOUNT, "")?;
    if let Err(error) = write_account(&account, &legacy_key) {
        if let Err(restore_error) = write_account(LEGACY_KEY_ACCOUNT, &legacy_key) {
            return Err(format!(
                "迁移 API Key 失败：{error}；恢复旧密钥也失败：{restore_error}"
            ));
        }
        return Err(format!("迁移 API Key 失败：{error}"));
    }
    Ok(Some(legacy_key))
}

#[tauri::command]
pub async fn has_api_key(
    provider: String,
    base_url: String,
    migrate_legacy: bool,
) -> Result<bool, String> {
    if migrate_legacy {
        return Ok(read_api_key(&provider, &base_url)?.is_some());
    }
    let account = api_key_account(&provider, &base_url)?;
    Ok(read_account(&account)?.is_some())
}

#[tauri::command]
pub async fn set_api_key(
    api_key: String,
    provider: String,
    base_url: String,
) -> Result<(), String> {
    let account = api_key_account(&provider, &base_url)?;
    write_account(&account, api_key.trim())
}
