"""Лёгкие ALTER для SQLite без Alembic (create_all не добавляет колонки)."""

from __future__ import annotations

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def apply_sqlite_patches(engine: Engine) -> None:
    if engine.dialect.name != "sqlite":
        return

    with engine.begin() as conn:
        insp = inspect(conn)
        tables = set(insp.get_table_names())

        if "dependency_edges" in tables:
            cols = {c["name"] for c in insp.get_columns("dependency_edges")}
            if "is_cycle" not in cols:
                conn.execute(
                    text(
                        "ALTER TABLE dependency_edges "
                        "ADD COLUMN is_cycle INTEGER NOT NULL DEFAULT 0"
                    )
                )

        if "file_metrics" in tables:
            cols = {c["name"] for c in insp.get_columns("file_metrics")}
            if "cycles" not in cols:
                conn.execute(
                    text(
                        "ALTER TABLE file_metrics "
                        "ADD COLUMN cycles INTEGER NOT NULL DEFAULT 0"
                    )
                )
