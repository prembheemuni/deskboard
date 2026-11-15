"""The vault API: status, notes, single files and live change events."""

import asyncio
import json
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from sse_starlette.sse import EventSourceResponse

from ..config import Settings
from ..models import ApiErrorBody, DiskFile, Note, VaultInfo, WriteRequest, WriteResult
from ..vault.fs import read_file, scan_vault, write_file
from ..vault.watch import ChangeHub

router = APIRouter(prefix="/api")


class VaultUnavailableError(Exception):
    pass


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def vault_root(settings: Annotated[Settings, Depends(get_settings)]) -> Path:
    if settings.vault_path is None:
        raise VaultUnavailableError("No vault folder is set (DESKBOARD_VAULT_PATH in backend/.env)")
    if not settings.vault_path.is_dir():
        raise VaultUnavailableError(f"The vault folder {settings.vault_path} can't be found")
    return settings.vault_path


Root = Annotated[Path, Depends(vault_root)]

ERRORS = {
    400: {"model": ApiErrorBody, "description": "Not a markdown note inside the vault"},
    503: {"model": ApiErrorBody, "description": "The vault folder isn't set or can't be found"},
}


@router.get("/vault")
def vault_info(settings: Annotated[Settings, Depends(get_settings)]) -> VaultInfo:
    path = settings.vault_path
    if path is None:
        return VaultInfo(status="not_configured")
    status = "ready" if path.is_dir() else "missing"
    return VaultInfo(status=status, name=path.name, path=str(path))


# Plain `def` endpoints run on a thread pool, so disk access doesn't block the event loop.
@router.get("/notes", responses=ERRORS)
def list_notes(root: Root) -> list[Note]:
    return scan_vault(root)


@router.get("/file", responses=ERRORS)
def get_file(root: Root, path: Annotated[str, Query()]) -> DiskFile:
    return read_file(root, path)


@router.put(
    "/file",
    responses={
        **ERRORS,
        409: {"model": ApiErrorBody, "description": "folder_missing, or conflict (changed on disk)"},
    },
)
def put_file(root: Root, body: WriteRequest) -> WriteResult:
    mtime = write_file(
        root, body.path, body.text, create_folder=body.create_folder, crlf=body.crlf, base=body.base
    )
    return WriteResult(mtime=mtime)


@router.get("/events", response_class=EventSourceResponse)
async def events(request: Request) -> EventSourceResponse:
    """Server-sent events: `changes` (a list of FileChange) and `resync` (reload all notes)."""
    hub: ChangeHub = request.app.state.hub
    queue = hub.subscribe()

    async def stream():
        try:
            while True:
                event = await queue.get()
                data = [c.model_dump(by_alias=True) for c in event.changes]
                yield {"event": event.name, "data": json.dumps(data)}
        except asyncio.CancelledError:
            raise
        finally:
            hub.unsubscribe(queue)

    return EventSourceResponse(stream(), ping=15)
