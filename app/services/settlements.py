"""Settlement CRUD operations backed by the configured SQLite database."""

from __future__ import annotations

from pathlib import Path
import sqlite3
from typing import Any

from app.db import new_uuid, read_connection, utc_timestamp, write_transaction
from app.errors import AppError
from app.money import format_amount, parse_amount
from app.schemas import validate_settlement_participants


_SETTLEMENT_SELECT = (
    "SELECT s.id, s.payer_id, payer.username AS payer_username, "
    "s.target_user_id, recipient.username AS target_username, "
    "s.amount_cents, s.created_at, s.modified_at "
    "FROM settlements AS s "
    "JOIN users AS payer ON payer.id = s.payer_id "
    "JOIN users AS recipient ON recipient.id = s.target_user_id"
)


def _serialize_settlement(row: sqlite3.Row) -> dict[str, Any]:
    """Build the public settlement shape from one joined DB snapshot."""
    return {
        "id": row["id"],
        "payer_id": row["payer_id"],
        "payer_username": row["payer_username"],
        "target_user_id": row["target_user_id"],
        "target_username": row["target_username"],
        "amount": format_amount(row["amount_cents"]),
        "created_at": row["created_at"],
        "modified_at": row["modified_at"],
    }


def _validate_participants(payer_id: str, target_user_id: str) -> None:
    try:
        validate_settlement_participants(payer_id, target_user_id)
    except ValueError as exc:
        raise AppError(
            422,
            "validation_error",
            "Payer and recipient must be different users.",
        ) from exc


def _validate_references(
    connection: sqlite3.Connection, payer_id: str, target_user_id: str
) -> None:
    """Reject unknown sender or recipient IDs inside the write transaction."""
    referenced_ids = {payer_id, target_user_id}
    placeholders = ", ".join("?" for _ in referenced_ids)
    rows = connection.execute(
        f"SELECT id FROM users WHERE id IN ({placeholders})",
        tuple(referenced_ids),
    ).fetchall()
    if {row["id"] for row in rows} != referenced_ids:
        raise AppError(
            422,
            "invalid_reference",
            "Sender and recipient users must exist.",
        )


def list_settlements(database_path: str | Path) -> list[dict[str, Any]]:
    """Return settlements in contract order with current participant names."""
    with read_connection(database_path) as connection:
        rows = connection.execute(
            _SETTLEMENT_SELECT + " ORDER BY s.created_at DESC, s.id ASC"
        ).fetchall()
        return [_serialize_settlement(row) for row in rows]


def get_settlement(database_path: str | Path, settlement_id: str) -> dict[str, Any]:
    """Return one settlement or its specific missing-record error."""
    with read_connection(database_path) as connection:
        row = connection.execute(
            _SETTLEMENT_SELECT + " WHERE s.id = ?", (settlement_id,)
        ).fetchone()
        if row is None:
            raise AppError(404, "settlement_not_found", "Settlement not found.")
        return _serialize_settlement(row)


def create_settlement(
    database_path: str | Path,
    payer_id: str,
    target_user_id: str,
    amount: str,
) -> dict[str, Any]:
    """Validate both participants and create a payment atomically."""
    _validate_participants(payer_id, target_user_id)
    settlement_id = new_uuid()
    timestamp = utc_timestamp()
    amount_cents = parse_amount(amount)

    with write_transaction(database_path) as connection:
        _validate_references(connection, payer_id, target_user_id)
        connection.execute(
            "INSERT INTO settlements "
            "(id, payer_id, target_user_id, amount_cents, created_at, modified_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (
                settlement_id,
                payer_id,
                target_user_id,
                amount_cents,
                timestamp,
                timestamp,
            ),
        )
        row = connection.execute(
            _SETTLEMENT_SELECT + " WHERE s.id = ?", (settlement_id,)
        ).fetchone()
        assert row is not None
        return _serialize_settlement(row)


def patch_settlement(
    database_path: str | Path,
    settlement_id: str,
    changes: dict[str, Any],
) -> dict[str, Any]:
    """Merge a partial update, validate the final record, and preserve creation time."""
    if not changes:
        raise AppError(422, "validation_error", "PATCH must include at least one field.")
    unknown = set(changes) - {"payer_id", "target_user_id", "amount"}
    if unknown:
        raise AppError(422, "validation_error", "PATCH contains unsupported fields.")

    with write_transaction(database_path) as connection:
        current = connection.execute(
            "SELECT id, payer_id, target_user_id, amount_cents, created_at "
            "FROM settlements WHERE id = ?",
            (settlement_id,),
        ).fetchone()
        if current is None:
            raise AppError(404, "settlement_not_found", "Settlement not found.")

        payer_id = changes.get("payer_id", current["payer_id"])
        target_user_id = changes.get("target_user_id", current["target_user_id"])
        amount_cents = (
            parse_amount(changes["amount"])
            if "amount" in changes
            else current["amount_cents"]
        )

        _validate_participants(payer_id, target_user_id)
        _validate_references(connection, payer_id, target_user_id)
        modified_at = utc_timestamp()
        connection.execute(
            "UPDATE settlements SET payer_id = ?, target_user_id = ?, "
            "amount_cents = ?, modified_at = ? WHERE id = ?",
            (payer_id, target_user_id, amount_cents, modified_at, settlement_id),
        )
        row = connection.execute(
            _SETTLEMENT_SELECT + " WHERE s.id = ?", (settlement_id,)
        ).fetchone()
        assert row is not None
        return _serialize_settlement(row)


def delete_settlement(database_path: str | Path, settlement_id: str) -> None:
    """Delete one settlement or raise its specific missing-record error."""
    with write_transaction(database_path) as connection:
        cursor = connection.execute(
            "DELETE FROM settlements WHERE id = ?", (settlement_id,)
        )
        if cursor.rowcount == 0:
            raise AppError(404, "settlement_not_found", "Settlement not found.")
