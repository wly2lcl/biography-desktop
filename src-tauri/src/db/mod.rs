// src-tauri/src/db/mod.rs

pub mod migrations;

use sqlx::SqlitePool;

pub async fn init_db(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    let version: i64 = sqlx::query_scalar("PRAGMA user_version")
        .fetch_one(pool)
        .await?;
    if version > 2 {
        return Err(sqlx::Error::Protocol(format!(
            "database schema version {version} is newer than supported version 2"
        )));
    }

    // Create the latest schema for new installations. Existing installations
    // are upgraded below in one transaction.
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS sessions (
            session_id      TEXT PRIMARY KEY,
            schema_version  INTEGER NOT NULL DEFAULT 2,
            world           TEXT NOT NULL,
            world_source    TEXT NOT NULL DEFAULT 'builtin',
            world_type      TEXT NOT NULL DEFAULT 'single',
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
            end_reason      TEXT,
            biography       TEXT,
            created_at      TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
        )",
    )
    .execute(pool)
    .await?;

    if version < 2 {
        let columns: Vec<String> =
            sqlx::query_scalar("SELECT name FROM pragma_table_info('sessions')")
                .fetch_all(pool)
                .await?;
        let mut tx = pool.begin().await?;
        if !columns.iter().any(|name| name == "schema_version") {
            sqlx::query(
                "ALTER TABLE sessions ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1",
            )
            .execute(&mut *tx)
            .await?;
        }
        if !columns.iter().any(|name| name == "world_source") {
            sqlx::query(
                "ALTER TABLE sessions ADD COLUMN world_source TEXT NOT NULL DEFAULT 'builtin'",
            )
            .execute(&mut *tx)
            .await?;
        }
        if !columns.iter().any(|name| name == "world_type") {
            sqlx::query(
                "ALTER TABLE sessions ADD COLUMN world_type TEXT NOT NULL DEFAULT 'single'",
            )
            .execute(&mut *tx)
            .await?;
        }
        if !columns.iter().any(|name| name == "end_reason") {
            sqlx::query("ALTER TABLE sessions ADD COLUMN end_reason TEXT")
                .execute(&mut *tx)
                .await?;
        }
        sqlx::query("PRAGMA user_version = 2")
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
    }

    // Config table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )",
    )
    .execute(pool)
    .await?;

    // Older builds could persist API keys inside these JSON objects. Enforce
    // the keyring boundary before any frontend code reads the table.
    sqlx::query(
        "UPDATE config
         SET value = CASE
           WHEN json_valid(value) THEN
             CASE
               WHEN json_type(value) = 'object' THEN json_remove(value, '$.apiKey')
               ELSE '{}'
             END
           ELSE '{}'
         END
         WHERE key IN ('app_config', 'app_settings')",
    )
    .execute(pool)
    .await?;

    // Indexes
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_sessions_is_active ON sessions(is_active)")
        .execute(pool)
        .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at DESC)")
        .execute(pool)
        .await?;

    // Models are not part of the stable cloud-only build.
    #[cfg(feature = "local-model")]
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS models (
            model_id        TEXT PRIMARY KEY,
            model_name      TEXT NOT NULL,
            file_path       TEXT NOT NULL,
            file_size       INTEGER NOT NULL,
            downloaded_at   TEXT NOT NULL DEFAULT (datetime('now')),
            last_used       TEXT
        )",
    )
    .execute(pool)
    .await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn memory_pool() -> SqlitePool {
        SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn fresh_database_uses_schema_v2() {
        let pool = memory_pool().await;
        init_db(&pool).await.unwrap();
        let version: i64 = sqlx::query_scalar("PRAGMA user_version")
            .fetch_one(&pool)
            .await
            .unwrap();
        let columns: Vec<String> =
            sqlx::query_scalar("SELECT name FROM pragma_table_info('sessions')")
                .fetch_all(&pool)
                .await
                .unwrap();
        assert_eq!(version, 2);
        assert!(columns.contains(&"world_source".to_string()));
        assert!(columns.contains(&"world_type".to_string()));
        assert!(columns.contains(&"end_reason".to_string()));
    }

    #[tokio::test]
    async fn legacy_rows_remain_marked_v1_for_frontend_normalization() {
        let pool = memory_pool().await;
        sqlx::query(
            "CREATE TABLE sessions (
              session_id TEXT PRIMARY KEY, world TEXT NOT NULL, game_mode TEXT NOT NULL DEFAULT 'basic',
              system TEXT, player_name TEXT NOT NULL, player_history JSON NOT NULL DEFAULT '[]',
              player_attributes JSON NOT NULL DEFAULT '{}', player_inventory JSON NOT NULL DEFAULT '[]',
              player_summary TEXT NOT NULL DEFAULT '', player_qa_history JSON NOT NULL DEFAULT '[]',
              scenarios_json JSON NOT NULL DEFAULT '[]', is_active INTEGER NOT NULL DEFAULT 1,
              biography TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
              updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO sessions (session_id, world, player_name) VALUES ('old', 'world', '角色')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query("CREATE TABLE config (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO config (key, value) VALUES ('app_config', ?)")
            .bind(r#"{"provider":"openai","apiKey":"legacy-secret"}"#)
            .execute(&pool)
            .await
            .unwrap();

        init_db(&pool).await.unwrap();
        let row: (i64, String, String) = sqlx::query_as(
            "SELECT schema_version, world_source, world_type FROM sessions WHERE session_id='old'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(row, (1, "builtin".to_string(), "single".to_string()));
        let config: String = sqlx::query_scalar("SELECT value FROM config WHERE key='app_config'")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(config, r#"{"provider":"openai"}"#);
    }

    #[tokio::test]
    async fn rejects_future_database_versions() {
        let pool = memory_pool().await;
        sqlx::query("PRAGMA user_version = 3")
            .execute(&pool)
            .await
            .unwrap();

        let error = init_db(&pool).await.unwrap_err();
        assert!(error.to_string().contains("newer than supported version 2"));
        let table_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='sessions'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(table_count, 0, "future databases must not be mutated");
    }
}
