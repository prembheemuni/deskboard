"""Deskboard API. Run: uv run uvicorn app.main:app --port 8787"""

import asyncio
import contextlib
from collections.abc import AsyncIterator
from urllib.parse import urlsplit

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import Settings, get_settings
from .models import ApiErrorBody
from .routes.notes import VaultUnavailableError, router
from .vault.fs import ConflictError, FolderMissingError
from .vault.paths import BadPathError
from .vault.watch import ChangeHub, watch_vault

LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}


def error(status: int, body: ApiErrorBody) -> JSONResponse:
    return JSONResponse(body.model_dump(by_alias=True, exclude_none=True), status_code=status)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    hub = ChangeHub()

    @contextlib.asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        task = None
        if settings.watch and settings.vault_path and settings.vault_path.is_dir():
            task = asyncio.create_task(watch_vault(settings.vault_path, hub, settings.watch_polling))
        yield
        if task:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task

    app = FastAPI(title="Deskboard API", lifespan=lifespan)
    app.state.settings = settings
    app.state.hub = hub

    @app.middleware("http")
    async def local_only(request: Request, call_next):  # type: ignore[no-untyped-def]
        # Notes are private: only answer pages served from this machine. The Host check
        # stops DNS-rebinding sites; the Origin check stops other sites writing notes.
        host = urlsplit(f"//{request.headers.get('host', '')}").hostname
        origin = request.headers.get("origin")
        if host not in LOCAL_HOSTS or (origin and urlsplit(origin).hostname not in LOCAL_HOSTS):
            return JSONResponse({"message": "Only local pages can use this server"}, status_code=403)
        return await call_next(request)

    @app.exception_handler(BadPathError)
    async def bad_path(_r: Request, e: BadPathError) -> JSONResponse:
        return error(400, ApiErrorBody(code="bad_path", message=str(e)))

    @app.exception_handler(VaultUnavailableError)
    async def vault_unavailable(_r: Request, e: VaultUnavailableError) -> JSONResponse:
        return error(503, ApiErrorBody(code="vault_unavailable", message=str(e)))

    @app.exception_handler(FolderMissingError)
    async def folder_missing(_r: Request, e: FolderMissingError) -> JSONResponse:
        return error(409, ApiErrorBody(code="folder_missing", message=str(e), folder=e.folder))

    @app.exception_handler(ConflictError)
    async def conflict(_r: Request, e: ConflictError) -> JSONResponse:
        return error(409, ApiErrorBody(code="conflict", message=str(e), disk=e.disk))

    app.include_router(router)

    if settings.frontend_dist.is_dir():
        app.mount("/", StaticFiles(directory=settings.frontend_dist, html=True), name="frontend")

    return app


app = create_app()
