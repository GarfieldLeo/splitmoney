"""User lookup, login, and CRUD operations."""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

from app.db import (
    deserialize_target_ids,
    new_uuid,
    read_connection,
    write_transaction,
)
from app.errors import AppError
from app.identity import clean_phone, normalize_username


def _public_user(row: sqlite3.Row) -> dict[str, str | None]:
    """Return only the public fields for a user row."""
    return {
        "id": row["id"],
        "username": row["username"],
        "phone": row["phone"],
    }


def list_users(database_path: str | Path) -> list[dict[str, str | None]]:
    """Return users in normalized-name and UUID order."""
    with read_connection(database_path) as connection:
        rows = connection.execute(
            "SELECT id, username, phone FROM users "
            "ORDER BY username_key ASC, id ASC"
        ).fetchall()
    return [_public_user(row) for row in rows]


def get_user(database_path: str | Path, user_id: str) -> dict[str, str | None]:
    """Return one user or raise the public missing-user error."""
    with read_connection(database_path) as connection:
        row = connection.execute(
            "SELECT id, username, phone FROM users WHERE id = ?", (user_id,)
        ).fetchone()
    if row is None:
        raise AppError(404, "user_not_found", "User not found.")
    return _public_user(row)


def create_user(
    database_path: str | Path,
    username: str,
    phone: str | None = None,
) -> dict[str, str | None]:
    """Create a user; direct duplicate creation is a conflict."""
    display, username_key = normalize_username(username)
    normalized_phone = clean_phone(phone)
    user_id = new_uuid()

    try:
        with write_transaction(database_path) as connection:
            duplicate = connection.execute(
                "SELECT 1 FROM users WHERE username_key = ?", (username_key,)
            ).fetchone()
            if duplicate is not None:
                raise AppError(
                    409,
                    "username_taken",
                    "That username is already in use.",
                )
            connection.execute(
                "INSERT INTO users (id, username, username_key, phone) "
                "VALUES (?, ?, ?, ?)",
                (user_id, display, username_key, normalized_phone),
            )
            row = connection.execute(
                "SELECT id, username, phone FROM users WHERE id = ?", (user_id,)
            ).fetchone()
    except sqlite3.IntegrityError as exc:
        # BEGIN IMMEDIATE serializes normal API writes; retain a safe conflict
        # response if an external writer still wins the unique-key race.
        with read_connection(database_path) as connection:
            duplicate = connection.execute(
                "SELECT 1 FROM users WHERE username_key = ?", (username_key,)
            ).fetchone()
        if duplicate is not None:
            raise AppError(
                409,
                "username_taken",
                "That username is already in use.",
            ) from exc
        raise

    assert row is not None
    return _public_user(row)


def login_user(database_path: str | Path, username: str) -> dict[str, str | None]:
    """Look up a normalized username or create it without changing its casing."""
    display, username_key = normalize_username(username)
    user_id = new_uuid()
    with write_transaction(database_path) as connection:
        row = connection.execute(
            "SELECT id, username, phone FROM users WHERE username_key = ?",
            (username_key,),
        ).fetchone()
        if row is None:
            # A keyed conflict is intentionally ignored so concurrent login
            # requests converge on the row that won the insertion race.
            cursor = connection.execute(
                "INSERT INTO users (id, username, username_key, phone) "
                "VALUES (?, ?, ?, NULL) ON CONFLICT(username_key) DO NOTHING",
                (user_id, display, username_key),
            )
            if cursor.rowcount == 1:
                row = connection.execute(
                    "SELECT id, username, phone FROM users WHERE id = ?",
                    (user_id,),
                ).fetchone()
            else:
                row = connection.execute(
                    "SELECT id, username, phone FROM users WHERE username_key = ?",
                    (username_key,),
                ).fetchone()
    if row is None:
        # The only ignored conflict is username_key, so this indicates a
        # corrupted or externally modified database rather than a client error.
        raise RuntimeError("Login insert did not produce a user row.")
    return _public_user(row)


def patch_user(
    database_path: str | Path,
    user_id: str,
    changes: dict[str, Any],
) -> dict[str, str | None]:
    """Patch a user while preserving UUID references in other records."""
    if not changes:
        raise AppError(422, "validation_error", "PATCH must include at least one field.")
    unknown = set(changes) - {"username", "phone"}
    if unknown:
        raise AppError(422, "validation_error", "PATCH contains unsupported fields.")

    with write_transaction(database_path) as connection:
        current = connection.execute(
            "SELECT id, username, username_key, phone FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        if current is None:
            raise AppError(404, "user_not_found", "User not found.")

        updated_username = current["username"]
        updated_key = current["username_key"]
        if "username" in changes:
            if changes["username"] is None:
                raise AppError(422, "validation_error", "Username cannot be null.")
            updated_username, updated_key = normalize_username(changes["username"])
            other = connection.execute(
                "SELECT 1 FROM users WHERE username_key = ? AND id <> ?",
                (updated_key, user_id),
            ).fetchone()
            if other is not None:
                raise AppError(
                    409,
                    "username_taken",
                    "That username is already in use.",
                )

        updated_phone = (
            clean_phone(changes["phone"])
            if "phone" in changes
            else current["phone"]
        )
        connection.execute(
            "UPDATE users SET username = ?, username_key = ?, phone = ? WHERE id = ?",
            (updated_username, updated_key, updated_phone, user_id),
        )
        row = connection.execute(
            "SELECT id, username, phone FROM users WHERE id = ?", (user_id,)
        ).fetchone()

    assert row is not None
    return _public_user(row)


def delete_user(database_path: str | Path, user_id: str) -> None:
    """Delete only an unreferenced user, atomically with all protections."""
    with write_transaction(database_path) as connection:
        exists = connection.execute(
            "SELECT 1 FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        if exists is None:
            raise AppError(404, "user_not_found", "User not found.")

        expense_payer = connection.execute(
            "SELECT 1 FROM expenses WHERE payer_id = ? LIMIT 1", (user_id,)
        ).fetchone()
        settlement_participant = connection.execute(
            "SELECT 1 FROM settlements "
            "WHERE payer_id = ? OR target_user_id = ? LIMIT 1",
            (user_id, user_id),
        ).fetchone()
        everyone_expense = connection.execute(
            "SELECT 1 FROM expenses WHERE target_ids IS NULL LIMIT 1"
        ).fetchone()

        explicit_target = False
        for row in connection.execute(
            "SELECT target_ids FROM expenses WHERE target_ids IS NOT NULL"
        ):
            try:
                target_ids = deserialize_target_ids(row["target_ids"])
            except ValueError:
                # A malformed stored target list cannot safely establish that
                # this user is not referenced, so preserve the user row.
                explicit_target = True
                break
            if target_ids is None or user_id in target_ids:
                # The helper maps both SQL NULL and a stored empty array to
                # None; both represent everyone under the shared contract.
                explicit_target = True
                break

        if (
            expense_payer is not None
            or settlement_participant is not None
            or everyone_expense is not None
            or explicit_target
        ):
            raise AppError(
                409,
                "user_in_use",
                "This person is used by existing records.",
            )

        connection.execute("DELETE FROM users WHERE id = ?", (user_id,))
