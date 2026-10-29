"""Shared HTTP error types and response handlers."""

from __future__ import annotations

import logging
from typing import Any, TypedDict

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

_LOGGER = logging.getLogger(__name__)


class ValidationIssue(TypedDict):
    loc: list[str | int]
    msg: str
    type: str


class AppError(Exception):
    """An expected application failure safe to show to an API caller."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        fields: list[ValidationIssue] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.fields = fields


def error_body(
    code: str,
    message: str,
    fields: list[ValidationIssue] | None = None,
) -> dict[str, Any]:
    """Build the shared public error envelope."""

    error: dict[str, Any] = {"code": code, "message": message}
    if fields:
        error["fields"] = fields
    return {"error": error}


def install_error_handlers(app: FastAPI) -> None:
    """Install JSON handlers for application and framework request errors."""

    @app.exception_handler(AppError)
    async def app_error_handler(_request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=error_body(exc.code, exc.message, exc.fields),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        _request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        fields: list[ValidationIssue] = [
            {
                "loc": [
                    part if isinstance(part, int) else str(part)
                    for part in error.get("loc", ())
                ],
                "msg": str(error.get("msg", "Invalid value")),
                "type": str(error.get("type", "value_error")),
            }
            for error in exc.errors()
        ]
        return JSONResponse(
            status_code=422,
            content=error_body(
                "validation_error", "Request validation failed.", fields
            ),
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_error_handler(
        _request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        if exc.status_code == 404:
            code, message = "not_found", "Not found."
        elif exc.status_code == 405:
            code, message = "method_not_allowed", "Method not allowed."
        else:
            code, message = "http_error", "Request could not be completed."
        return JSONResponse(
            status_code=exc.status_code,
            content=error_body(code, message),
            headers=exc.headers,
        )

    @app.exception_handler(Exception)
    async def unexpected_error_handler(
        request: Request, exc: Exception
    ) -> JSONResponse:
        """Log internal details while returning only a safe public envelope."""
        _LOGGER.exception(
            "Unhandled API error for %s %s",
            request.method,
            request.url.path,
            exc_info=(type(exc), exc, exc.__traceback__),
        )
        return JSONResponse(
            status_code=500,
            content=error_body(
                "internal_error", "An unexpected server error occurred."
            ),
        )
