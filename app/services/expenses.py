"""Expense CRUD operations backed by the configured SQLite database."""

from __future__ import annotations

from pathlib import Path
import sqlite3
from typing import Any, Sequence

from app.db import (
    deserialize_target_ids,
    new_uuid,
    read_connection,
    serialize_target_ids,
    utc_timestamp,
    write_transaction,
)
from app.errors import AppError
from app.money import format_amount, parse_amount


def _usernames(connection: sqlite3.Connection) -> dict[str, str]:
    """Fetch one current username map for the response snapshot."""
    return {
        row["id"]: row["username"]
        for row in connection.execute("SELECT id, username FROM users")
    }


def _serialize_expense(
    row: sqlite3.Row, usernames: dict[str, str]
) -> dict[str, Any]:
    """Build the public expense shape using names from this DB snapshot."""
    target_ids = deserialize_target_ids(row["target_ids"])
    payer_username = usernames.get(row["payer_id"])
    if payer_username is None:
        raise RuntimeError("Expense payer is missing from the users table.")

    if target_ids is None:
        target_usernames = None
    else:
        try:
            target_usernames = [usernames[user_id] for user_id in target_ids]
        except KeyError as exc:
            raise RuntimeError("Expense target is missing from the users table.") from exc

    return {
        "id": row["id"],
        "payer_id": row["payer_id"],
        "payer_username": payer_username,
        "target_user_ids": target_ids,
        "target_usernames": target_usernames,
        "amount": format_amount(row["amount_cents"]),
        "created_at": row["created_at"],
        "modified_at": row["modified_at"],
    }


def _validate_references(
    connection: sqlite3.Connection,
    payer_id: str,
    target_ids: Sequence[str] | None,
) -> None:
    """Reject unknown payer or explicit targets inside the write transaction."""
    referenced_ids = {payer_id}
    if target_ids is not None:
        referenced_ids.update(target_ids)
    placeholders = ", ".join("?" for _ in referenced_ids)
    rows = connection.execute(
        f"SELECT id FROM users WHERE id IN ({placeholders})",
        tuple(referenced_ids),
    ).fetchall()
    found_ids = {row["id"] for row in rows}
    if found_ids != referenced_ids:
        raise AppError(
            422,
            "invalid_reference",
            "Payer and target users must exist.",
        )


def list_expenses(database_path: str | Path) -> list[dict[str, Any]]:
    """Return expenses in contract order with current usernames."""
    with read_connection(database_path) as connection:
        rows = connection.execute(
            "SELECT id, payer_id, target_ids, amount_cents, created_at, modified_at "
            "FROM expenses ORDER BY created_at DESC, id ASC"
        ).fetchall()
        usernames = _usernames(connection)
        return [_serialize_expense(row, usernames) for row in rows]


def get_expense(database_path: str | Path, expense_id: str) -> dict[str, Any]:
    """Return one expense or the specific missing-expense error."""
    with read_connection(database_path) as connection:
        row = connection.execute(
            "SELECT id, payer_id, target_ids, amount_cents, created_at, modified_at "
            "FROM expenses WHERE id = ?",
            (expense_id,),
        ).fetchone()
        if row is None:
            raise AppError(404, "expense_not_found", "Expense not found.")
        usernames = _usernames(connection)
        return _serialize_expense(row, usernames)


def create_expense(
    database_path: str | Path,
    payer_id: str,
    target_user_ids: list[str] | None,
    amount: str,
) -> dict[str, Any]:
    """Validate all references and create an expense atomically."""
    expense_id = new_uuid()
    timestamp = utc_timestamp()
    amount_cents = parse_amount(amount)
    target_json = serialize_target_ids(target_user_ids)
    canonical_targets = deserialize_target_ids(target_json)

    with write_transaction(database_path) as connection:
        _validate_references(connection, payer_id, canonical_targets)
        connection.execute(
            "INSERT INTO expenses "
            "(id, payer_id, target_ids, amount_cents, created_at, modified_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (
                expense_id,
                payer_id,
                target_json,
                amount_cents,
                timestamp,
                timestamp,
            ),
        )
        row = connection.execute(
            "SELECT id, payer_id, target_ids, amount_cents, created_at, modified_at "
            "FROM expenses WHERE id = ?",
            (expense_id,),
        ).fetchone()
        assert row is not None
        usernames = _usernames(connection)
        return _serialize_expense(row, usernames)


def patch_expense(
    database_path: str | Path,
    expense_id: str,
    changes: dict[str, Any],
) -> dict[str, Any]:
    """Validate the merged record and update it without changing created_at."""
    if not changes:
        raise AppError(422, "validation_error", "PATCH must include at least one field.")
    unknown = set(changes) - {"payer_id", "target_user_ids", "amount"}
    if unknown:
        raise AppError(422, "validation_error", "PATCH contains unsupported fields.")

    with write_transaction(database_path) as connection:
        current = connection.execute(
            "SELECT id, payer_id, target_ids, amount_cents, created_at, modified_at "
            "FROM expenses WHERE id = ?",
            (expense_id,),
        ).fetchone()
        if current is None:
            raise AppError(404, "expense_not_found", "Expense not found.")

        payer_id = changes.get("payer_id", current["payer_id"])
        target_ids = (
            changes["target_user_ids"]
            if "target_user_ids" in changes
            else deserialize_target_ids(current["target_ids"])
        )
        amount_cents = (
            parse_amount(changes["amount"])
            if "amount" in changes
            else current["amount_cents"]
        )
        target_json = serialize_target_ids(target_ids)
        canonical_targets = deserialize_target_ids(target_json)

        _validate_references(connection, payer_id, canonical_targets)
        modified_at = utc_timestamp()
        connection.execute(
            "UPDATE expenses SET payer_id = ?, target_ids = ?, amount_cents = ?, "
            "modified_at = ? WHERE id = ?",
            (payer_id, target_json, amount_cents, modified_at, expense_id),
        )
        row = connection.execute(
            "SELECT id, payer_id, target_ids, amount_cents, created_at, modified_at "
            "FROM expenses WHERE id = ?",
            (expense_id,),
        ).fetchone()
        assert row is not None
        usernames = _usernames(connection)
        return _serialize_expense(row, usernames)


def delete_expense(database_path: str | Path, expense_id: str) -> None:
    """Delete one expense or raise the specific missing-expense error."""
    with write_transaction(database_path) as connection:
        cursor = connection.execute("DELETE FROM expenses WHERE id = ?", (expense_id,))
        if cursor.rowcount == 0:
            raise AppError(404, "expense_not_found", "Expense not found.")
