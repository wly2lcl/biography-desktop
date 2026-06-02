#!/usr/bin/env python3
"""Migrate session data from Python/FastAPI biography app to Tauri SQLite database."""

import argparse
import json
import sqlite3
import sys
from datetime import datetime


def migrate(source_path: str, target_path: str, overwrite: bool = False) -> dict:
    """Migrate sessions from old DB to new DB."""
    stats = {"migrated": 0, "skipped": 0, "errors": 0}

    source = sqlite3.connect(source_path)
    source.row_factory = sqlite3.Row
    target = sqlite3.connect(target_path)

    # Get old table schema to map columns
    old_columns = [
        row["name"]
        for row in source.execute("PRAGMA table_info(sessions)").fetchall()
    ]

    # Column mapping: old -> new
    column_map = {
        "id": "session_id",
        "session_id": "session_id",
        "world": "world",
        "world_name": "world",
        "game_mode": "game_mode",
        "mode": "game_mode",
        "system_context": "system",
        "system": "system",
        "player_name": "player_name",
        "name": "player_name",
        "history": "player_history",
        "player_history": "player_history",
        "attributes": "player_attributes",
        "player_attributes": "player_attributes",
        "inventory": "player_inventory",
        "player_inventory": "player_inventory",
        "summary": "player_summary",
        "player_summary": "player_summary",
        "qa_history": "player_qa_history",
        "player_qa_history": "player_qa_history",
        "scenarios": "scenarios_json",
        "scenarios_json": "scenarios_json",
        "is_active": "is_active",
        "active": "is_active",
        "biography": "biography",
        "created_at": "created_at",
        "timestamp": "created_at",
    }

    # Find actual old column names
    reverse_map = {}
    for old_col, new_col in column_map.items():
        if old_col in old_columns:
            reverse_map[old_col] = new_col

    # Default values for missing columns
    defaults = {
        "session_id": None,  # required
        "world": "",
        "game_mode": "basic",
        "system": None,
        "player_name": "",
        "player_history": "[]",
        "player_attributes": "{}",
        "player_inventory": "[]",
        "player_summary": "",
        "player_qa_history": "[]",
        "scenarios_json": "[]",
        "is_active": 1,
        "biography": None,
        "created_at": datetime.now().isoformat(),
    }

    rows = source.execute("SELECT * FROM sessions").fetchall()
    now = datetime.now().isoformat()

    for row in rows:
        try:
            # Build new row data
            new_data = {}
            for old_col in old_columns:
                if old_col in reverse_map:
                    new_col = reverse_map[old_col]
                    val = row[old_col]
                    # Convert boolean to int for is_active
                    if new_col == "is_active" and isinstance(val, bool):
                        val = 1 if val else 0
                    # JSON columns should be strings
                    if new_col in (
                        "player_history",
                        "player_attributes",
                        "player_inventory",
                        "player_qa_history",
                        "scenarios_json",
                    ):
                        if val is None:
                            val = "[]" if new_col != "player_attributes" else "{}"
                        elif not isinstance(val, str):
                            val = json.dumps(val)
                    new_data[new_col] = val

            # Fill defaults for missing columns
            for col, default in defaults.items():
                if col not in new_data:
                    new_data[col] = default

            # Generate session_id if missing
            if not new_data.get("session_id"):
                import uuid

                new_data["session_id"] = str(uuid.uuid4())

            # Check for existing session
            if not overwrite:
                existing = target.execute(
                    "SELECT 1 FROM sessions WHERE session_id = ?",
                    (new_data["session_id"],),
                ).fetchone()
                if existing:
                    stats["skipped"] += 1
                    continue

            # Insert
            columns = list(new_data.keys())
            placeholders = ", ".join(["?"] * len(columns))
            col_names = ", ".join(columns)

            target.execute(
                f"INSERT OR REPLACE INTO sessions ({col_names}) VALUES ({placeholders})",
                [new_data[c] for c in columns],
            )
            stats["migrated"] += 1

        except Exception as e:
            stats["errors"] += 1
            print(f"Error migrating row: {e}", file=sys.stderr)

    target.commit()
    source.close()
    target.close()

    return stats


def main():
    parser = argparse.ArgumentParser(
        description="Migrate biography sessions from Python to Tauri"
    )
    parser.add_argument(
        "--source", "-s", required=True, help="Path to old SQLite database"
    )
    parser.add_argument(
        "--target", "-t", required=True, help="Path to new Tauri SQLite database"
    )
    parser.add_argument(
        "--overwrite",
        "-o",
        action="store_true",
        help="Overwrite existing sessions",
    )
    args = parser.parse_args()

    print(f"Migrating from {args.source} to {args.target}...")
    stats = migrate(args.source, args.target, args.overwrite)

    print(f"\nMigration complete:")
    print(f"  Migrated: {stats['migrated']}")
    print(f"  Skipped:  {stats['skipped']}")
    print(f"  Errors:   {stats['errors']}")

    if stats["errors"] > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
