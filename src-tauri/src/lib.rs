// src-tauri/src/lib.rs

pub mod commands;
pub mod db;
#[cfg(feature = "local-model")]
pub mod model;

use sqlx::SqlitePool;
use std::path::PathBuf;

pub struct AppDb {
    pub pool: SqlitePool,
    pub data_dir: PathBuf,
}
