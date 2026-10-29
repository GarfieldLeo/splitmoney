"""FastAPI application factory and initial routes."""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import AppConfig, PathValue, resolve_config
from app.db import initialize_database
from app.errors import install_error_handlers
from app.routes.balances import router as balances_router
from app.routes.expenses import router as expenses_router
from app.routes.settlements import router as settlements_router
from app.routes.users import router as users_router

_STATIC_DIR = Path(__file__).parent / "static"


def create_app(database_path: PathValue | None = None) -> FastAPI:
    """Create an isolated application configured for one database path."""

    config: AppConfig = resolve_config(database_path)

    @asynccontextmanager
    async def lifespan(_application: FastAPI) -> AsyncIterator[None]:
        initialize_database(config.database_path)
        yield

    application = FastAPI(title="Splitmoney", lifespan=lifespan)
    application.state.config = config
    # Keep the direct alias convenient for database helpers and integrations.
    application.state.database_path = config.database_path

    install_error_handlers(application)
    application.include_router(users_router)
    application.include_router(expenses_router)
    application.include_router(settlements_router)
    application.include_router(balances_router)

    @application.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @application.get("/", include_in_schema=False)
    def index() -> FileResponse:
        return FileResponse(_STATIC_DIR / "index.html", media_type="text/html")

    application.mount(
        "/static", StaticFiles(directory=_STATIC_DIR), name="static"
    )
    return application


app = create_app()
