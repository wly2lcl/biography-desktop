// src-tauri/src/model/types.rs
//
// Phase 9: Shared types for local model management (llama.cpp).
// These types are serialized/deserialized across the Tauri IPC boundary.

use serde::{Deserialize, Serialize};

/// Information about a running llama-server instance.
#[derive(Serialize, Deserialize, Clone)]
pub struct ServerInfo {
    pub pid: u32,
    pub port: u16,
    pub model_path: String,
    pub model_name: String,
    pub started_at: String,
}

/// Current status of the local model server.
#[derive(Serialize, Clone)]
pub struct ServerStatus {
    pub is_running: bool,
    pub pid: Option<u32>,
    pub port: Option<u16>,
    pub model_name: Option<String>,
    pub context_size: Option<u32>,
    pub gpu_layers: Option<u32>,
}

/// Metadata for a pre-configured downloadable model.
#[derive(Serialize, Clone)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub size_gb: f64,
    pub quantization: String,
    pub recommended: bool,
    pub download_url: String,
    pub min_ram_gb: u32,
}

/// Record of a downloaded GGUF model file.
#[derive(Serialize, Clone)]
pub struct DownloadedModel {
    pub id: String,
    pub name: String,
    pub file_path: String,
    pub file_size: u64,
    pub downloaded_at: String,
}

/// Real-time progress for an active model download.
#[allow(dead_code)] // Reserved for the experimental download status command.
#[derive(Serialize, Clone)]
pub struct DownloadProgress {
    pub model_id: String,
    pub progress: f64, // 0.0 – 1.0
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub speed_bytes_per_sec: u64,
}
