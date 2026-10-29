"""SQLite schema initialization and transaction helpers."""

from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Iterator, Sequence

from app.identity import canonical_uuid

BUSY_TIMEOUT_MS = 5_000
_SCHEMA_PATH = Path(__file__).with_name("schema.sql")


def new_uuid() -> str:
    """Return a new canonical UUID string."""
    return str(uuid.uuid4())


def utc_timestamp() -> str:
    """Return the current UTC time as an ISO 8601 string ending in ``Z``."""
    return datetime.now(UTC).isoformat(timespec="microseconds").replace(
        "+00:00", "Z"
    )


def serialize_target_ids(target_ids: Sequence[str] | None) -> str | None:
    """Encode sorted, unique canonical UUIDs; everyone is represented by NULL."""
    if target_ids is None:
        return None
    canonical_ids = sorted({canonical_uuid(item) for item in target_ids})
    if not canonical_ids:
        return None
    return json.dumps(canonical_ids, ensure_ascii=False, separators=(",", ":"))


def deserialize_target_ids(value: str | None) -> list[str] | None:
    """Decode stored target JSON into sorted, unique canonical UUIDs."""
    if value is None:
        return None
    try:
        decoded = json.loads(value)
    except (TypeError, json.JSONDecodeError) as exc:
        raise ValueError("Stored target IDs must be valid JSON.") from exc
    if not isinstance(decoded, list):
        raise ValueError("Stored target IDs must be a JSON array.")
    canonical_ids = sorted({canonical_uuid(item) for item in decoded})
    return canonical_ids or None


def _connect(database_path: str | Path) -> sqlite3.Connection:
    """Open one configured connection and apply settings before transactions."""
    connection = sqlite3.connect(
        str(database_path),
        timeout=BUSY_TIMEOUT_MS / 1_000,
    )
    try:
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute(f"PRAGMA busy_timeout = {BUSY_TIMEOUT_MS}")
    except BaseException:
        connection.close()
        raise
    return connection


@contextmanager
def read_connection(database_path: str | Path) -> Iterator[sqlite3.Connection]:
    """Yield a connection inside an explicit, consistent read transaction."""
    connection = _connect(database_path)
    try:
        connection.execute("BEGIN")
        try:
            yield connection
        except BaseException:
            if connection.in_transaction:
                connection.rollback()
            raise
        else:
            try:
                connection.commit()
            except BaseException:
                if connection.in_transaction:
                    connection.rollback()
                raise
    finally:
        connection.close()


@contextmanager
def write_transaction(database_path: str | Path) -> Iterator[sqlite3.Connection]:
    """Yield a connection in an immediate write transaction with safe rollback."""
    connection = _connect(database_path)
    try:
        connection.execute("BEGIN IMMEDIATE")
        try:
            yield connection
        except BaseException:
            if connection.in_transaction:
                connection.rollback()
            raise
        else:
            try:
                connection.commit()
            except BaseException:
                if connection.in_transaction:
                    connection.rollback()
                raise
    finally:
        connection.close()


def initialize_database(database_path: str | Path) -> None:
    """Create the configured database and its initial schema idempotently."""
    path = Path(database_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    schema = _SCHEMA_PATH.read_text(encoding="utf-8")
    connection = _connect(path)
    try:
        connection.executescript(schema)
    finally:
        connection.close()
