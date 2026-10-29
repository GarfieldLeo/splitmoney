"""Read-only HTTP endpoint for the current calculated ledger."""

from __future__ import annotations

from fastapi import APIRouter, Request

from app.schemas import BalancesResponse
from app.services import balances

router = APIRouter(prefix="/api")


@router.get(
    "/balances",
    response_model=BalancesResponse,
    summary="Read current balances and suggested payments",
    description=(
        "Returns every current user, including users with zero activity. "
        "Positive net means the user should receive money; negative net means "
        "the user should pay. Expense shares for records with null or empty "
        "targets include everyone currently in the users table, so adding a "
        "person can change historical everyone-expense shares. Amounts are "
        "decimal strings in USD. Suggested payments are recommendations only; "
        "this GET does not record payments or write to the database."
    ),
)
def get_balances(request: Request) -> dict:
    return balances.get_balances(request.app.state.database_path)
