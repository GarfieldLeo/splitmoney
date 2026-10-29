"""Read-only database aggregation for current group balances."""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Iterable, Any

from app.balances import (
    Contribution,
    ExpenseInput,
    SettlementInput,
    combine_balances,
    expense_contributions,
    settlement_contributions,
    suggest_payments,
)
from app.db import deserialize_target_ids, read_connection
from app.money import format_amount


def query_expense_contributions(
    connection: sqlite3.Connection, users: Iterable[str]
) -> dict[str, Contribution]:
    """Load expense rows once and delegate all cent arithmetic to B07."""
    user_ids = list(users)
    rows = connection.execute(
        "SELECT payer_id, target_ids, amount_cents FROM expenses ORDER BY id ASC"
    ).fetchall()
    expenses = [
        ExpenseInput(
            payer_id=row["payer_id"],
            target_user_ids=deserialize_target_ids(row["target_ids"]),
            amount_cents=row["amount_cents"],
        )
        for row in rows
    ]
    return expense_contributions(user_ids, expenses)


def query_settlement_contributions(
    connection: sqlite3.Connection, users: Iterable[str]
) -> dict[str, Contribution]:
    """Load settlement rows once and delegate all cent arithmetic to B07."""
    user_ids = list(users)
    rows = connection.execute(
        "SELECT payer_id, target_user_id, amount_cents "
        "FROM settlements ORDER BY id ASC"
    ).fetchall()
    settlements = [
        SettlementInput(
            payer_id=row["payer_id"],
            target_user_id=row["target_user_id"],
            amount_cents=row["amount_cents"],
        )
        for row in rows
    ]
    return settlement_contributions(user_ids, settlements)


def get_balances(database_path: str | Path) -> dict[str, Any]:
    """Calculate a complete response from one explicit SQLite read snapshot."""
    with read_connection(database_path) as connection:
        user_rows = connection.execute(
            "SELECT id, username FROM users ORDER BY username_key ASC, id ASC"
        ).fetchall()
        user_ids = [row["id"] for row in user_rows]
        usernames = {row["id"]: row["username"] for row in user_rows}

        expense_values = query_expense_contributions(connection, user_ids)
        settlement_values = query_settlement_contributions(connection, user_ids)
        balances = combine_balances(user_ids, expense_values, settlement_values)
        suggestions = suggest_payments(
            {user_id: balance.net for user_id, balance in balances.items()}
        )

        response_users = [
            {
                "user_id": row["id"],
                "username": row["username"],
                "expense_paid": format_amount(balances[row["id"]].expense_paid),
                "expense_share": format_amount(balances[row["id"]].expense_share),
                "settlement_sent": format_amount(
                    balances[row["id"]].settlement_sent
                ),
                "settlement_received": format_amount(
                    balances[row["id"]].settlement_received
                ),
                "net": format_amount(balances[row["id"]].net),
            }
            for row in user_rows
        ]
        response_suggestions = [
            {
                "from_user_id": item.from_user_id,
                "from_username": usernames[item.from_user_id],
                "to_user_id": item.to_user_id,
                "to_username": usernames[item.to_user_id],
                "amount": format_amount(item.amount_cents),
            }
            for item in suggestions
        ]
        return {
            "users": response_users,
            "totals": {
                "expenses": format_amount(
                    sum(value.money_out for value in expense_values.values())
                ),
                "settlements": format_amount(
                    sum(value.money_out for value in settlement_values.values())
                ),
            },
            "suggested_payments": response_suggestions,
        }
