from __future__ import annotations

import json
import re
import sqlite3
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.db import (
    BUSY_TIMEOUT_MS,
    deserialize_target_ids,
    initialize_database,
    new_uuid,
    read_connection,
    serialize_target_ids,
    utc_timestamp,
    write_transaction,
)
from app.main import create_app


def _insert_user(connection: sqlite3.Connection, user_id: str, key: str) -> None:
    connection.execute(
        "INSERT INTO users (id, username, username_key, phone) VALUES (?, ?, ?, ?)",
        (user_id, key, key, None),
    )


def test_startup_is_idempotent_and_keeps_existing_data(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "nested" / "data" / "splitmoney.sqlite3"
    application = create_app(database_path)
    user_id = str(uuid.uuid4())

    assert not database_path.parent.exists()
    with TestClient(application):
        with write_transaction(database_path) as connection:
            _insert_user(connection, user_id, "alice")
    assert database_path.exists()

    with TestClient(application):
        with read_connection(database_path) as connection:
            users = connection.execute("SELECT id FROM users").fetchall()
            tables = connection.execute(
                "SELECT name FROM sqlite_master "
                "WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
            ).fetchall()
            indexes = connection.execute(
                "SELECT name FROM sqlite_master "
                "WHERE type = 'index' AND name LIKE 'idx_%' ORDER BY name"
            ).fetchall()

    assert [row["id"] for row in users] == [user_id]
    assert [row["name"] for row in tables] == ["expenses", "settlements", "users"]
    assert [row["name"] for row in indexes] == [
        "idx_expenses_payer_id",
        "idx_settlements_payer_id",
        "idx_settlements_target_user_id",
    ]


def test_foreign_keys_and_record_checks_are_enforced(database_path: Path) -> None:
    initialize_database(database_path)
    payer_id = str(uuid.uuid4())
    other_id = str(uuid.uuid4())
    record_id = str(uuid.uuid4())
    timestamp = utc_timestamp()

    with write_transaction(database_path) as connection:
        _insert_user(connection, payer_id, "alice")
        _insert_user(connection, other_id, "bob")

    with pytest.raises(sqlite3.IntegrityError):
        with write_transaction(database_path) as connection:
            connection.execute(
                "INSERT INTO expenses "
                "(id, payer_id, target_ids, amount_cents, created_at, modified_at) "
                "VALUES (?, ?, NULL, 100, ?, ?)",
                (record_id, str(uuid.uuid4()), timestamp, timestamp),
            )

    with pytest.raises(sqlite3.IntegrityError):
        with write_transaction(database_path) as connection:
            connection.execute(
                "INSERT INTO expenses "
                "(id, payer_id, target_ids, amount_cents, created_at, modified_at) "
                "VALUES (?, ?, NULL, 0, ?, ?)",
                (record_id, payer_id, timestamp, timestamp),
            )

    with pytest.raises(sqlite3.IntegrityError):
        with write_transaction(database_path) as connection:
            _insert_user(connection, str(uuid.uuid4()), "alice")

    for invalid_json in ("not-json", '{"id":"value"}'):
        with pytest.raises(sqlite3.IntegrityError):
            with write_transaction(database_path) as connection:
                connection.execute(
                    "INSERT INTO expenses "
                    "(id, payer_id, target_ids, amount_cents, created_at, modified_at) "
                    "VALUES (?, ?, ?, 100, ?, ?)",
                    (record_id, payer_id, invalid_json, timestamp, timestamp),
                )

    with pytest.raises(sqlite3.IntegrityError):
        with write_transaction(database_path) as connection:
            connection.execute(
                "INSERT INTO settlements "
                "(id, payer_id, target_user_id, amount_cents, created_at, modified_at) "
                "VALUES (?, ?, ?, 100, ?, ?)",
                (record_id, payer_id, payer_id, timestamp, timestamp),
            )

    with pytest.raises(sqlite3.IntegrityError):
        with write_transaction(database_path) as connection:
            connection.execute(
                "INSERT INTO settlements "
                "(id, payer_id, target_user_id, amount_cents, created_at, modified_at) "
                "VALUES (?, ?, ?, 100, ?, ?)",
                (record_id, payer_id, str(uuid.uuid4()), timestamp, timestamp),
            )

    with write_transaction(database_path) as connection:
        connection.execute(
            "INSERT INTO expenses "
            "(id, payer_id, target_ids, amount_cents, created_at, modified_at) "
            "VALUES (?, ?, ?, 100, ?, ?)",
            (
                record_id,
                payer_id,
                json.dumps([other_id]),
                timestamp,
                timestamp,
            ),
        )
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute("DELETE FROM users WHERE id = ?", (payer_id,))


def test_failed_multi_statement_write_rolls_back_every_statement(
    database_path: Path,
) -> None:
    initialize_database(database_path)
    inserted_id = str(uuid.uuid4())
    timestamp = utc_timestamp()

    with pytest.raises(sqlite3.IntegrityError):
        with write_transaction(database_path) as connection:
            _insert_user(connection, inserted_id, "temporary")
            connection.execute(
                "INSERT INTO expenses "
                "(id, payer_id, target_ids, amount_cents, created_at, modified_at) "
                "VALUES (?, ?, NULL, 100, ?, ?)",
                (str(uuid.uuid4()), str(uuid.uuid4()), timestamp, timestamp),
            )

    with read_connection(database_path) as connection:
        assert connection.execute(
            "SELECT COUNT(*) FROM users WHERE id = ?", (inserted_id,)
        ).fetchone()[0] == 0


def test_connections_apply_pragmas_and_close_after_context(database_path: Path) -> None:
    initialize_database(database_path)

    for context in (read_connection, write_transaction):
        with context(database_path) as connection:
            assert connection.row_factory is sqlite3.Row
            assert connection.execute("PRAGMA foreign_keys").fetchone()[0] == 1
            assert connection.execute("PRAGMA busy_timeout").fetchone()[0] == (
                BUSY_TIMEOUT_MS
            )
        with pytest.raises(sqlite3.ProgrammingError, match="closed database"):
            connection.execute("SELECT 1")


def test_database_files_are_isolated(database_path: Path, tmp_path: Path) -> None:
    second_path = tmp_path / "other.sqlite3"
    initialize_database(database_path)
    initialize_database(second_path)
    first_id = str(uuid.uuid4())

    with write_transaction(database_path) as connection:
        _insert_user(connection, first_id, "first")

    with read_connection(database_path) as connection:
        assert connection.execute("SELECT username FROM users").fetchall()[0][0] == (
            "first"
        )
    with read_connection(second_path) as connection:
        assert connection.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0


def test_target_json_helpers_canonicalize_and_validate() -> None:
    lower_id = str(uuid.uuid4())
    upper_id = lower_id.upper()

    serialized = serialize_target_ids([upper_id, lower_id, upper_id])

    assert serialized == json.dumps([lower_id], separators=(",", ":"))
    assert deserialize_target_ids(serialized) == [lower_id]
    assert serialize_target_ids(None) is None
    assert serialize_target_ids([]) is None
    assert deserialize_target_ids(None) is None
    assert deserialize_target_ids("[]") is None
    with pytest.raises(ValueError):
        serialize_target_ids(["not-a-uuid"])
    with pytest.raises(ValueError):
        deserialize_target_ids('{"not":"an array"}')
    with pytest.raises(ValueError):
        deserialize_target_ids('["not-a-uuid"]')


def test_record_helpers_return_canonical_uuid_and_utc_timestamp() -> None:
    generated = new_uuid()
    timestamp = utc_timestamp()

    assert generated == str(uuid.UUID(generated))
    assert re.fullmatch(
        r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z", timestamp
    )
