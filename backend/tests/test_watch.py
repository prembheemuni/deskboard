import asyncio
from pathlib import Path

from watchfiles import Change

from app.models import FileChange
from app.vault.watch import ChangeHub, Event, to_event


def test_note_changes(vault: Path) -> None:
    (vault / "Top.md").unlink()
    event = to_event(
        vault,
        {
            (Change.modified, str(vault / "Projects" / "Plan.md")),
            (Change.deleted, str(vault / "Top.md")),
            # an atomic save: deleted + re-created, file still there
            (Change.deleted, str(vault / "Daily Updates" / "2026-11-15.md")),
            (Change.added, str(vault / "Daily Updates" / "2026-11-15.md")),
            # ignored
            (Change.modified, str(vault / ".obsidian" / "workspace.json")),
            (Change.modified, str(vault / "image.png")),
        },
    )
    assert event == Event(
        "changes",
        [
            FileChange(kind="changed", path="Daily Updates/2026-11-15.md"),
            FileChange(kind="changed", path="Projects/Plan.md"),
            FileChange(kind="deleted", path="Top.md"),
        ],
    )


def test_folder_events_resync(vault: Path) -> None:
    assert to_event(vault, {(Change.deleted, str(vault / "Old Folder"))}) == Event("resync")


def test_nothing_relevant(vault: Path) -> None:
    assert to_event(vault, {(Change.modified, str(vault / ".obsidian" / "x.md"))}) is None


def test_hub_overflow_turns_into_resync() -> None:
    async def run() -> list[Event]:
        hub = ChangeHub(max_queued=2)
        q = hub.subscribe()
        for i in range(5):
            hub.publish(Event("changes", [FileChange(kind="changed", path=f"{i}.md")]))
        out = []
        while not q.empty():
            out.append(q.get_nowait())
        hub.unsubscribe(q)
        hub.publish(Event("resync"))  # no subscribers: nothing happens
        return out

    events = asyncio.run(run())
    assert events[0] == Event("resync")
    assert len(events) <= 2
