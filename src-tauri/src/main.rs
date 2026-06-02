#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;

use sqlx::SqlitePool;
use std::path::PathBuf;
use tauri::Manager;

struct AppDb {
    pool: SqlitePool,
    data_dir: PathBuf,
}

fn init_app() -> (SqlitePool, PathBuf) {
    // Get home directory as fallback for app data
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".to_string());

    #[cfg(target_os = "macos")]
    let data_dir = PathBuf::from(home).join("Library/Application Support/com.biography.generator");

    #[cfg(target_os = "linux")]
    let data_dir = PathBuf::from(home).join(".local/share/biography-desktop");

    #[cfg(target_os = "windows")]
    let data_dir = PathBuf::from(home).join("AppData/Roaming/biography-desktop");

    std::fs::create_dir_all(&data_dir).expect("failed to create app data dir");
    std::fs::create_dir_all(data_dir.join("worlds")).expect("failed to create worlds dir");
    std::fs::create_dir_all(data_dir.join("backups")).expect("failed to create backups dir");

    let db_path = data_dir.join("biography.db");

    // Use a local runtime to initialize the database
    let rt = tokio::runtime::Runtime::new().expect("failed to create runtime");
    let pool = rt
        .block_on(async {
            let pool = SqlitePool::connect(db_path.to_str().unwrap())
                .await
                .expect("failed to connect to database");
            db::init_db(&pool).await.expect("failed to initialize database");
            pool
        });

    (pool, data_dir)
}

#[tokio::main]
async fn main() {
    // Initialize logging
    #[cfg(debug_assertions)]
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .init();

    let (pool, data_dir) = init_app();
    let context = tauri::generate_context!();

    tauri::Builder::default()
        .manage(AppDb { pool, data_dir })
        .invoke_handler(tauri::generate_handler![
            commands::db::save_session,
            commands::db::get_session,
            commands::db::list_sessions,
            commands::db::delete_session,
            commands::config::get_config,
            commands::config::set_config,
            commands::config::get_api_key,
            commands::config::set_api_key,
            commands::world::list_worlds,
            commands::world::load_world,
            commands::world::save_world,
            commands::world::delete_world,
            commands::world::export_world,
            commands::world::import_world,
            commands::world::open_worlds_folder,
            commands::data::get_database_info,
            commands::data::backup_database,
            commands::data::restore_database,
            commands::data::list_backups,
            commands::data::delete_backup,
            commands::data::clear_ended_sessions,
            commands::data::clear_all_sessions,
            commands::data::export_full_data,
            commands::data::import_full_data,
        ])
        .run(context)
        .expect("error while running tauri application");
}
