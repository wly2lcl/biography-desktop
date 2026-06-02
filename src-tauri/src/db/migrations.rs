// src-tauri/src/db/migrations.rs

use sqlx::SqlitePool;

/// Run database migrations
pub async fn run_migrations(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    // Migration 1: Add biography column if not exists
    // SQLite doesn't support IF NOT EXISTS for columns easily, so we check manually
    let columns: Vec<(String,)> = sqlx::query_as(
        "SELECT name FROM pragma_table_info('sessions')"
    )
    .fetch_all(pool)
    .await?;

    let has_biography = columns.iter().any(|(name,)| name == "biography");
    if !has_biography {
        sqlx::query("ALTER TABLE sessions ADD COLUMN biography TEXT")
            .execute(pool)
            .await?;
    }

    let has_player_summary = columns.iter().any(|(name,)| name == "player_summary");
    if !has_player_summary {
        sqlx::query("ALTER TABLE sessions ADD COLUMN player_summary TEXT NOT NULL DEFAULT ''")
            .execute(pool)
            .await?;
    }

    let has_player_qa_history = columns.iter().any(|(name,)| name == "player_qa_history");
    if !has_player_qa_history {
        sqlx::query("ALTER TABLE sessions ADD COLUMN player_qa_history JSON NOT NULL DEFAULT '[]'")
            .execute(pool)
            .await?;
    }

    Ok(())
}
