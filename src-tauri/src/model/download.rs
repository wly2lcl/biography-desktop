// src-tauri/src/model/download.rs
//
// Phase 9: GGUF model download management for llama.cpp.
// Handles downloading pre-configured models from HuggingFace and
// tracking them via SQLite.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use once_cell::sync::Lazy;
use sqlx::SqlitePool;

use crate::model::types::{DownloadedModel, ModelInfo};

/// Pre-configured models optimized for the biography app.
pub static AVAILABLE_MODELS: Lazy<Vec<ModelInfo>> = Lazy::new(|| {
    vec![
        ModelInfo {
            id: "qwen3-4b-instruct-q4_k_m".to_string(),
            name: "Qwen3 4B Instruct (Q4_K_M)".to_string(),
            provider: "Alibaba Qwen".to_string(),
            size_gb: 2.8,
            quantization: "Q4_K_M".to_string(),
            recommended: true,
            download_url: "https://huggingface.co/Qwen/Qwen3-4B-Instruct-GGUF/resolve/main/qwen3-4b-instruct-q4_k_m.gguf".to_string(),
            min_ram_gb: 8,
        },
        ModelInfo {
            id: "qwen3-8b-instruct-q4_k_m".to_string(),
            name: "Qwen3 8B Instruct (Q4_K_M)".to_string(),
            provider: "Alibaba Qwen".to_string(),
            size_gb: 5.4,
            quantization: "Q4_K_M".to_string(),
            recommended: false,
            download_url: "https://huggingface.co/Qwen/Qwen3-8B-Instruct-GGUF/resolve/main/qwen3-8b-instruct-q4_k_m.gguf".to_string(),
            min_ram_gb: 16,
        },
        ModelInfo {
            id: "llama-3.2-3b-instruct-q4_k_m".to_string(),
            name: "Llama 3.2 3B Instruct (Q4_K_M)".to_string(),
            provider: "Meta".to_string(),
            size_gb: 2.0,
            quantization: "Q4_K_M".to_string(),
            recommended: false,
            download_url: "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf".to_string(),
            min_ram_gb: 8,
        },
    ]
});

/// Global cancellation flag for model downloads.
static CANCEL_DOWNLOAD: AtomicBool = AtomicBool::new(false);

/// Get the models directory path under the app data directory.
pub fn get_models_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("models")
}

/// Get the expected file path for a given model ID.
pub fn get_model_path(data_dir: &Path, model_id: &str) -> PathBuf {
    get_models_dir(data_dir).join(format!("{}.gguf", model_id))
}

/// Return all pre-configured available models.
pub fn list_available_models() -> Vec<ModelInfo> {
    AVAILABLE_MODELS.to_vec()
}

/// Check whether a specific model file already exists on disk.
pub fn is_model_downloaded(data_dir: &Path, model_id: &str) -> bool {
    get_model_path(data_dir, model_id).exists()
}

/// List downloaded models, reading from the database first and then
/// scanning the models directory for any orphaned `.gguf` files.
pub async fn list_downloaded_models(
    pool: &SqlitePool,
    data_dir: &Path,
) -> Result<Vec<DownloadedModel>, String> {
    let models_dir = get_models_dir(data_dir);

    let rows: Vec<(String, String, String, i64, String)> = sqlx::query_as(
        "SELECT model_id, model_name, file_path, file_size, downloaded_at \
         FROM models ORDER BY downloaded_at DESC",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to query models: {}", e))?;

    let mut result: Vec<DownloadedModel> = Vec::new();
    for (model_id, model_name, file_path, file_size, downloaded_at) in rows {
        let path = PathBuf::from(&file_path);
        if path.exists() {
            result.push(DownloadedModel {
                id: model_id,
                name: model_name,
                file_path,
                file_size: file_size as u64,
                downloaded_at,
            });
        }
    }

    // Scan for any .gguf files not yet in the database
    if models_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&models_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map_or(false, |ext| ext == "gguf") {
                    let id = path
                        .file_stem()
                        .map(|s| s.to_string_lossy().to_string())
                        .unwrap_or_default();
                    if !result.iter().any(|m| m.id == id) {
                        if let Ok(metadata) = path.metadata() {
                            result.push(DownloadedModel {
                                id: id.clone(),
                                name: id,
                                file_path: path.to_string_lossy().to_string(),
                                file_size: metadata.len(),
                                downloaded_at: chrono::Utc::now().to_rfc3339(),
                            });
                        }
                    }
                }
            }
        }
    }

    Ok(result)
}

/// Download a model from the pre-configured list by its ID.
///
/// The `on_progress` callback receives a value in `[0.0, 1.0]`.
/// Checks disk space before downloading. Supports cancellation via
/// [`cancel_download`].
pub async fn download_model(
    model_id: &str,
    data_dir: &Path,
    pool: &SqlitePool,
    on_progress: impl Fn(f64) + Send + Sync + 'static,
) -> Result<(), String> {
    // Find the model in the available list
    let model = AVAILABLE_MODELS
        .iter()
        .find(|m| m.id == model_id)
        .ok_or_else(|| format!("Model '{}' not found in available models", model_id))?;

    // Check if already downloaded
    let model_path = get_model_path(data_dir, model_id);
    if model_path.exists() {
        return Err(format!("Model '{}' is already downloaded", model.name));
    }

    // Ensure models directory exists
    let models_dir = get_models_dir(data_dir);
    std::fs::create_dir_all(&models_dir)
        .map_err(|e| format!("Failed to create models directory: {}", e))?;

    // Check available disk space
    let available_space = get_available_space(&models_dir)?;
    let required_bytes = (model.size_gb * 1_073_741_824.0) as u64;
    if available_space < required_bytes {
        return Err(format!(
            "Insufficient disk space. Need {:.1} GB, have {:.1} GB available",
            model.size_gb,
            available_space as f64 / 1_073_741_824.0
        ));
    }

    // Clear cancellation flag
    CANCEL_DOWNLOAD.store(false, Ordering::SeqCst);

    // Download to a temporary file
    let temp_path = models_dir.join(format!("{}.gguf.tmp", model_id));

    let client = reqwest::Client::new();
    let response = client
        .get(&model.download_url)
        .send()
        .await
        .map_err(|e| format!("Failed to start download: {}", e))?;

    let total_size = response.content_length().unwrap_or(0);

    let mut file = std::fs::File::create(&temp_path)
        .map_err(|e| format!("Failed to create model file: {}", e))?;

    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();
    use futures::StreamExt;
    use std::io::Write;

    while let Some(chunk_result) = stream.next().await {
        // Honour cancellation
        if CANCEL_DOWNLOAD.load(Ordering::SeqCst) {
            let _ = std::fs::remove_file(&temp_path);
            return Err("Download cancelled by user".to_string());
        }

        let chunk = chunk_result.map_err(|e| format!("Download error: {}", e))?;
        file.write_all(&chunk)
            .map_err(|e| format!("Write error: {}", e))?;
        downloaded += chunk.len() as u64;

        if total_size > 0 {
            on_progress(downloaded as f64 / total_size as f64);
        }
    }

    // Move temporary file to final location
    std::fs::rename(&temp_path, &model_path)
        .map_err(|e| format!("Failed to finalize model file: {}", e))?;

    // Get actual file size
    let file_size = std::fs::metadata(&model_path)
        .map(|m| m.len())
        .unwrap_or(0);

    // Record in database
    sqlx::query(
        "INSERT OR REPLACE INTO models (model_id, model_name, file_path, file_size, downloaded_at) \
         VALUES (?, ?, ?, ?, datetime('now'))",
    )
    .bind(&model.id)
    .bind(&model.name)
    .bind(model_path.to_string_lossy().to_string())
    .bind(file_size as i64)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to record model in database: {}", e))?;

    log::info!("Model '{}' downloaded successfully ({} bytes)", model.name, file_size);
    Ok(())
}

/// Signal an in-progress download to cancel at the next chunk boundary.
pub fn cancel_download() {
    CANCEL_DOWNLOAD.store(true, Ordering::SeqCst);
}

/// Delete a downloaded model from both disk and the database.
pub async fn delete_model(
    model_id: &str,
    data_dir: &Path,
    pool: &SqlitePool,
) -> Result<(), String> {
    let model_path = get_model_path(data_dir, model_id);

    if !model_path.exists() {
        return Err(format!("Model '{}' is not downloaded", model_id));
    }

    std::fs::remove_file(&model_path)
        .map_err(|e| format!("Failed to delete model file: {}", e))?;

    sqlx::query("DELETE FROM models WHERE model_id = ?")
        .bind(model_id)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to remove model from database: {}", e))?;

    log::info!("Model '{}' deleted", model_id);
    Ok(())
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Return the number of free bytes on the filesystem containing `path`.
fn get_available_space(path: &Path) -> Result<u64, String> {
    fs2::available_space(path).map_err(|e| format!("Failed to query disk space: {}", e))
}
