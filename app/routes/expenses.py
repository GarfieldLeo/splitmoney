"""HTTP endpoints for expense CRUD."""

from __future__ import annotations

from fastapi import APIRouter, Request, Response, status

from app.schemas import ExpenseCreate, ExpensePatch, ExpenseResponse, UUIDString
from app.services import expenses

router = APIRouter(prefix="/api")


def _database_path(request: Request):
    return request.app.state.database_path


@router.get("/expenses", response_model=list[ExpenseResponse])
def list_expenses(request: Request) -> list[dict]:
    return expenses.list_expenses(_database_path(request))


@router.post(
    "/expenses", response_model=ExpenseResponse, status_code=status.HTTP_201_CREATED
)
def create_expense(payload: ExpenseCreate, request: Request) -> dict:
    return expenses.create_expense(
        _database_path(request),
        payload.payer_id,
        payload.target_user_ids,
        payload.amount,
    )


@router.get("/expenses/{expense_id}", response_model=ExpenseResponse)
def get_expense(expense_id: UUIDString, request: Request) -> dict:
    return expenses.get_expense(_database_path(request), expense_id)


@router.patch("/expenses/{expense_id}", response_model=ExpenseResponse)
def patch_expense(
    expense_id: UUIDString,
    payload: ExpensePatch,
    request: Request,
) -> dict:
    return expenses.patch_expense(
        _database_path(request), expense_id, payload.model_dump(exclude_unset=True)
    )


@router.delete("/expenses/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(expense_id: UUIDString, request: Request) -> Response:
    expenses.delete_expense(_database_path(request), expense_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
