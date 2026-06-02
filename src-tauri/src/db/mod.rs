// src-tauri/src/db/mod.rs

pub mod migrations;

use sqlx::SqlitePool;

pub async fn init_db(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    // Sessions table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS sessions (
            session_id      TEXT PRIMARY KEY,
            world           TEXT NOT NULL,
            game_mode       TEXT NOT NULL DEFAULT 'basic',
            system          TEXT,
            player_name     TEXT NOT NULL,
            player_history  JSON NOT NULL DEFAULT '[]',
            player_attributes JSON NOT NULL DEFAULT '{}',
            player_inventory  JSON NOT NULL DEFAULT '[]',
            player_summary  TEXT NOT NULL DEFAULT '',
            player_qa_history JSON NOT NULL DEFAULT '[]',
            scenarios_json  JSON NOT NULL DEFAULT '[]',
            is_active       INTEGER NOT NULL DEFAULT 1,
            biography       TEXT,
            created_at      TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
        )",
    )
    .execute(pool)
    .await?;

    // Config table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )",
    )
    .execute(pool)
    .await?;

    // Indexes
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_sessions_is_active ON sessions(is_active)",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at DESC)",
    )
    .execute(pool)
    .await?;

    Ok(())
}
