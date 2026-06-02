// src-tauri/src/lib.rs

pub mod commands;
pub mod db;

use sqlx::SqlitePool;
use std::path::PathBuf;

pub struct AppDb {
    pub pool: SqlitePool,
    pub data_dir: PathBuf,
}
