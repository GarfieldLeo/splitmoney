"""HTTP endpoints for settlement CRUD."""

from __future__ import annotations

from fastapi import APIRouter, Request, Response, status

from app.schemas import SettlementCreate, SettlementPatch, SettlementResponse, UUIDString
from app.services import settlements

router = APIRouter(prefix="/api")


def _database_path(request: Request):
    return request.app.state.database_path


@router.get("/settlements", response_model=list[SettlementResponse])
def list_settlements(request: Request) -> list[dict]:
    return settlements.list_settlements(_database_path(request))


@router.post(
    "/settlements",
    response_model=SettlementResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_settlement(payload: SettlementCreate, request: Request) -> dict:
    return settlements.create_settlement(
        _database_path(request),
        payload.payer_id,
        payload.target_user_id,
        payload.amount,
    )


@router.get("/settlements/{settlement_id}", response_model=SettlementResponse)
def get_settlement(settlement_id: UUIDString, request: Request) -> dict:
    return settlements.get_settlement(_database_path(request), settlement_id)


@router.patch("/settlements/{settlement_id}", response_model=SettlementResponse)
def patch_settlement(
    settlement_id: UUIDString,
    payload: SettlementPatch,
    request: Request,
) -> dict:
    return settlements.patch_settlement(
        _database_path(request),
        settlement_id,
        payload.model_dump(exclude_unset=True),
    )


@router.delete("/settlements/{settlement_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_settlement(settlement_id: UUIDString, request: Request) -> Response:
    settlements.delete_settlement(_database_path(request), settlement_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
