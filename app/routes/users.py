"""HTTP endpoints for username login and user management."""

from __future__ import annotations

from fastapi import APIRouter, Request, Response, status

from app.schemas import LoginRequest, UserCreate, UserPatch, UserResponse, UUIDString
from app.services import users

router = APIRouter(prefix="/api")


def _database_path(request: Request):
    return request.app.state.database_path


@router.post("/login", response_model=UserResponse)
def login(payload: LoginRequest, request: Request) -> dict[str, str | None]:
    """Return the existing normalized identity or create it."""
    return users.login_user(_database_path(request), payload.username)


@router.get("/users", response_model=list[UserResponse])
def list_users(request: Request) -> list[dict[str, str | None]]:
    return users.list_users(_database_path(request))


@router.post(
    "/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED
)
def create_user(payload: UserCreate, request: Request) -> dict[str, str | None]:
    return users.create_user(
        _database_path(request), payload.username, payload.phone
    )


@router.get("/users/{user_id}", response_model=UserResponse)
def get_user(
    user_id: UUIDString,
    request: Request,
) -> dict[str, str | None]:
    return users.get_user(_database_path(request), user_id)


@router.patch("/users/{user_id}", response_model=UserResponse)
def patch_user(
    user_id: UUIDString,
    payload: UserPatch,
    request: Request,
) -> dict[str, str | None]:
    return users.patch_user(
        _database_path(request), user_id, payload.model_dump(exclude_unset=True)
    )


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: UUIDString, request: Request) -> Response:
    users.delete_user(_database_path(request), user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
