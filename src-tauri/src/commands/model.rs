// src-tauri/src/commands/model.rs
//
// Phase 9: Tauri commands for local model management (llama.cpp).

use std::sync::Arc;

use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;

use crate::model::binary;
use crate::model::download;
use crate::model::process::LlamaProcess;
use crate::model::types::{DownloadedModel, ModelInfo, ServerInfo, ServerStatus};
use crate::AppDb;

// ---------------------------------------------------------------------------
// Managed state
// ---------------------------------------------------------------------------

pub struct ModelAppState {
    pub db: AppDb,
    pub llama_process: Arc<Mutex<Option<LlamaProcess>>>,
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Ensure the `llama-server` binary exists (downloads it if missing).
#[tauri::command]
pub async fn ensure_binary(state: State<'_, ModelAppState>) -> Result<String, String> {
    let data_dir = &state.db.data_dir;

    if binary::binary_exists(data_dir) {
        binary::verify_binary(data_dir)?;
        return Ok(binary::get_binary_path(data_dir)
            .to_string_lossy()
            .to_string());
    }

    log::info!("llama-server binary not found, downloading …");
    binary::download_binary(data_dir, |_| {}).await?;

    binary::verify_binary(data_dir)?;
    Ok(binary::get_binary_path(data_dir)
        .to_string_lossy()
        .to_string())
}

/// Start the llama-server process with the given model.
#[tauri::command]
pub async fn start_server(
    model_path: String,
    gpu_layers: Option<u32>,
    context_size: Option<u32>,
    state: State<'_, ModelAppState>,
) -> Result<ServerInfo, String> {
    // Guard: one instance at a time
    {
        let proc = state.llama_process.lock().await;
        if proc.is_some() {
            return Err("llama-server is already running. Stop it first.".to_string());
        }
    }

    // Ensure the binary exists & is valid
    let binary_path = binary::get_binary_path(&state.db.data_dir);
    if !binary::binary_exists(&state.db.data_dir) {
        return Err("llama-server binary not found. Call `ensure_binary` first.".to_string());
    }
    binary::verify_binary(&state.db.data_dir)?;

    // Validate model file
    if !std::path::Path::new(&model_path).exists() {
        return Err(format!("Model file not found: {}", model_path));
    }

    let gpu_layers = gpu_layers.unwrap_or(0);
    let context_size = context_size.unwrap_or(4096);

    // Start the subprocess
    let proc = LlamaProcess::start(
        binary_path.to_str().ok_or("Invalid binary path")?,
        &model_path,
        gpu_layers,
        context_size,
    )?;

    let info = proc.server_info();

    // Block until the server responds to health checks
    proc.wait_for_ready(120).await?;

    // Store so we can stop it later
    {
        let mut guard = state.llama_process.lock().await;
        *guard = Some(proc);
    }

    Ok(info)
}

/// Gracefully stop the running llama-server (if any).
#[tauri::command]
pub async fn stop_server(state: State<'_, ModelAppState>) -> Result<(), String> {
    let mut guard = state.llama_process.lock().await;
    if guard.take().is_some() {
        log::info!("llama-server stopped");
        Ok(())
    } else {
        Err("llama-server is not running".to_string())
    }
}

/// Return the current server status.
#[tauri::command]
pub async fn get_server_status(state: State<'_, ModelAppState>) -> Result<ServerStatus, String> {
    let guard = state.llama_process.lock().await;
    if let Some(p) = guard.as_ref() {
        Ok(ServerStatus {
            is_running: true,
            pid: Some(p.pid()),
            port: Some(p.port()),
            model_name: Some(p.model_name().to_string()),
            context_size: Some(4096),
            gpu_layers: Some(0),
        })
    } else {
        Ok(ServerStatus {
            is_running: false,
            pid: None,
            port: None,
            model_name: None,
            context_size: None,
            gpu_layers: None,
        })
    }
}

/// List all pre-configured models available for download.
#[tauri::command]
pub async fn list_available_models() -> Result<Vec<ModelInfo>, String> {
    Ok(download::list_available_models())
}

/// List models that have been downloaded (from the database + filesystem scan).
#[tauri::command]
pub async fn list_downloaded_models(
    state: State<'_, ModelAppState>,
) -> Result<Vec<DownloadedModel>, String> {
    download::list_downloaded_models(&state.db.pool, &state.db.data_dir).await
}

/// Start downloading a model. Progress is reported via the
/// `model_download_progress` event; completion via `model_download_complete`.
#[tauri::command]
pub async fn download_model(
    model_id: String,
    app: AppHandle,
    state: State<'_, ModelAppState>,
) -> Result<(), String> {
    let data_dir = state.db.data_dir.clone();
    let pool = state.db.pool.clone();

    // Spawn a background task so the command returns immediately.
    tokio::spawn(async move {
        let mid = model_id.clone();
        let data_dir = data_dir;
        let pool = pool;
        let app_for_progress = app.clone();
        let mid_for_progress = mid.clone();

        let result = download::download_model(&mid, &data_dir, &pool, move |progress| {
            let _ = app_for_progress.emit(
                "model_download_progress",
                serde_json::json!({
                    "model_id": mid_for_progress,
                    "progress": progress,
                }),
            );
        })
        .await;

        match result {
            Ok(()) => {
                let _ = app.emit(
                    "model_download_complete",
                    serde_json::json!({
                        "model_id": model_id,
                        "success": true,
                    }),
                );
            }
            Err(e) => {
                let _ = app.emit(
                    "model_download_complete",
                    serde_json::json!({
                        "model_id": model_id,
                        "success": false,
                        "error": e,
                    }),
                );
            }
        }
    });

    Ok(())
}

/// Cancel the currently in-progress model download.
#[tauri::command]
pub fn cancel_download() -> Result<(), String> {
    download::cancel_download();
    Ok(())
}

/// Delete a previously downloaded model from disk and the database.
#[tauri::command]
pub async fn delete_model(model_id: String, state: State<'_, ModelAppState>) -> Result<(), String> {
    download::delete_model(&model_id, &state.db.data_dir, &state.db.pool).await
}

/// Return the absolute path to the models directory.
#[tauri::command]
pub async fn get_models_dir(state: State<'_, ModelAppState>) -> Result<String, String> {
    Ok(download::get_models_dir(&state.db.data_dir)
        .to_string_lossy()
        .to_string())
}
