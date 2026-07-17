use serde::Serialize;
use std::path::PathBuf;
use std::process::Command;
use tauri::State;

#[derive(Clone)]
pub struct StartupState {
    pub data_dir: PathBuf,
    pub startup_error: Option<String>,
    pub degraded: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupStatus {
    ready: bool,
    degraded: bool,
    data_dir: String,
    error: Option<String>,
}

#[tauri::command]
pub fn get_startup_status(state: State<'_, StartupState>) -> StartupStatus {
    StartupStatus {
        ready: state.startup_error.is_none(),
        degraded: state.degraded,
        data_dir: state.data_dir.to_string_lossy().to_string(),
        error: state.startup_error.clone(),
    }
}

#[tauri::command]
pub fn open_data_folder(state: State<'_, StartupState>) -> Result<(), String> {
    if !state.data_dir.exists() {
        std::fs::create_dir_all(&state.data_dir)
            .map_err(|error| format!("无法创建数据目录：{error}"))?;
    }

    #[cfg(target_os = "macos")]
    let mut command = Command::new("open");
    #[cfg(target_os = "windows")]
    let mut command = Command::new("explorer");
    #[cfg(target_os = "linux")]
    let mut command = Command::new("xdg-open");

    command
        .arg(&state.data_dir)
        .spawn()
        .map_err(|error| format!("无法打开数据目录：{error}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn startup_status_serializes_without_internal_field_names() {
        let status = StartupStatus {
            ready: false,
            degraded: true,
            data_dir: "/tmp/biography".to_string(),
            error: Some("database unavailable".to_string()),
        };
        let value = serde_json::to_value(status).unwrap();
        assert_eq!(value["ready"], false);
        assert_eq!(value["degraded"], true);
        assert_eq!(value["dataDir"], "/tmp/biography");
        assert!(value.get("data_dir").is_none());
    }
}
