"""Watching the vault and pushing note changes to connected browsers."""

import asyncio
import logging
from dataclasses import dataclass, field
from pathlib import Path

from watchfiles import Change, awatch

from ..models import FileChange
from .paths import is_note_name, to_vault_path

log = logging.getLogger(__name__)


@dataclass
class Event:
    name: str  # "changes" or "resync" (reload every note)
    changes: list[FileChange] = field(default_factory=list)


class ChangeHub:
    """Fan-out of change events: one queue per connected browser."""

    def __init__(self, max_queued: int = 100) -> None:
        self._subs: set[asyncio.Queue[Event]] = set()
        self._max = max_queued

    def subscribe(self) -> "asyncio.Queue[Event]":
        q: asyncio.Queue[Event] = asyncio.Queue(self._max)
        self._subs.add(q)
        return q

    def unsubscribe(self, q: "asyncio.Queue[Event]") -> None:
        self._subs.discard(q)

    def publish(self, event: Event) -> None:
        for q in list(self._subs):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                # a slow client: drop what it missed and tell it to reload everything
                while not q.empty():
                    q.get_nowait()
                q.put_nowait(Event("resync"))


def to_event(root: Path, changes: set[tuple[Change, str]]) -> Event | None:
    """Turn raw file events into note changes. Folder events can't be followed file by file: resync."""
    touched: set[str] = set()
    for _change, raw in changes:
        path = to_vault_path(root, Path(raw))
        if path is None:
            continue
        if is_note_name(path):
            touched.add(path)
        elif "." not in path.rsplit("/", 1)[-1]:  # most likely a folder added, moved or removed
            return Event("resync")
    if not touched:
        return None
    # The batch is unordered (a save can be delete + create), so ask the disk what's there now.
    return Event(
        "changes",
        [
            FileChange(kind="changed" if root.joinpath(*p.split("/")).is_file() else "deleted", path=p)
            for p in sorted(touched)
        ],
    )


async def watch_vault(root: Path, hub: ChangeHub, polling: bool = False) -> None:
    log.info("Watching %s for changes", root)
    try:
        async for changes in awatch(root, force_polling=polling, recursive=True):
            event = to_event(root, changes)
            if event:
                hub.publish(event)
    except asyncio.CancelledError:
        raise
    except Exception:  # the app keeps working without live updates
        log.exception("Stopped watching %s", root)
