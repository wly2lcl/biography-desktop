#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
#[cfg(feature = "local-model")]
mod model;

#[cfg(feature = "local-model")]
use commands::model::ModelAppState;
#[cfg(feature = "local-model")]
use model::process::LlamaProcess;
use sqlx::SqlitePool;
use std::path::PathBuf;
#[cfg(feature = "local-model")]
use std::sync::Arc;
#[cfg(feature = "local-model")]
use tauri::Manager;
#[cfg(feature = "local-model")]
use tokio::sync::Mutex;

#[derive(Clone)]
pub(crate) struct AppDb {
    pub(crate) pool: SqlitePool,
    pub(crate) data_dir: PathBuf,
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
    let pool = rt.block_on(async {
        let pool = SqlitePool::connect(db_path.to_str().unwrap())
            .await
            .expect("failed to connect to database");
        db::init_db(&pool)
            .await
            .expect("failed to initialize database");
        pool
    });

    (pool, data_dir)
}

#[tokio::main]
async fn main() {
    // Initialize logging
    #[cfg(debug_assertions)]
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    let (pool, data_dir) = init_app();
    let context = tauri::generate_context!();

    let app_db = AppDb { pool, data_dir };
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(app_db.clone());

    #[cfg(feature = "local-model")]
    let model_state = ModelAppState {
        db: app_db.clone(),
        llama_process: Arc::new(Mutex::new(None::<LlamaProcess>)),
    };

    #[cfg(feature = "local-model")]
    let builder = builder
        .manage(model_state)
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let handle = window.app_handle().clone();
                tokio::spawn(async move {
                    if let Some(state) = handle.try_state::<ModelAppState>() {
                        let mut proc = state.llama_process.lock().await;
                        if proc.take().is_some() {
                            log::info!("Cleaned up llama-server process on app exit");
                        }
                    }
                });
            }
        })
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
            commands::world::export_worlds,
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
            commands::prompts::read_file,
            commands::prompts::write_file,
            // Phase 9: Local model management
            commands::model::ensure_binary,
            commands::model::start_server,
            commands::model::stop_server,
            commands::model::get_server_status,
            commands::model::list_available_models,
            commands::model::list_downloaded_models,
            commands::model::download_model,
            commands::model::cancel_download,
            commands::model::delete_model,
            commands::model::get_models_dir,
        ]);

    #[cfg(not(feature = "local-model"))]
    let builder = builder.invoke_handler(tauri::generate_handler![
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
        commands::world::export_worlds,
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
        commands::prompts::read_file,
        commands::prompts::write_file,
    ]);

    builder
        .run(context)
        .expect("error while running tauri application");
}
