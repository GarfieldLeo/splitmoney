"""Application configuration helpers."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import TypeAlias

PathValue: TypeAlias = str | os.PathLike[str]


@dataclass(frozen=True)
class AppConfig:
    """Configuration resolved for one application instance."""

    database_path: Path


def resolve_config(database_path: PathValue | None = None) -> AppConfig:
    """Resolve a database path without opening or creating the database."""

    if database_path is not None:
        configured_path = Path(database_path)
    else:
        env_path = os.environ.get("SPLITMONEY_DB_PATH")
        if env_path is not None:
            if not env_path.strip():
                raise ValueError("SPLITMONEY_DB_PATH must not be empty")
            configured_path = Path(env_path)
        else:
            project_root = Path(__file__).resolve().parent.parent
            configured_path = project_root / "data" / "splitmoney.sqlite3"

    configured_path = configured_path.expanduser()
    if not configured_path.is_absolute():
        configured_path = Path.cwd() / configured_path
    return AppConfig(database_path=configured_path)
