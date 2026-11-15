"""Reading and writing notes in the vault folder."""

import os
import threading
from pathlib import Path

from ..models import BaseVersion, DiskFile, Note
from .paths import is_hidden_part, is_note_name, resolve_note_path


class FolderMissingError(Exception):
    def __init__(self, folder: str) -> None:
        super().__init__(f"The folder “{folder}” isn't in your vault")
        self.folder = folder


class ConflictError(Exception):
    def __init__(self, disk: DiskFile) -> None:
        super().__init__("The note was changed on disk after it was loaded")
        self.disk = disk


# Requests run on a thread pool: keep the check-then-write below in one piece.
_write_lock = threading.Lock()


def normalize_eol(text: str) -> str:
    return text.replace("\r\n", "\n")


def split_path(path: str) -> tuple[str, str]:
    parts = [p for p in path.split("/") if p]
    name = parts.pop() if parts else ""
    return "/".join(parts), name


def note_from_path(path: str, text: str, mtime: int) -> Note:
    folder, name = split_path(path)
    return Note(path=path, name=name.removesuffix(".md"), folder=folder, text=text, mtime=mtime)


def _mtime_ms(st: os.stat_result) -> int:
    return st.st_mtime_ns // 1_000_000


def _read(full: Path) -> DiskFile:
    with open(full, "rb") as f:
        raw = f.read().decode("utf-8-sig", errors="replace")
        mtime = _mtime_ms(os.fstat(f.fileno()))
    return DiskFile(text=normalize_eol(raw), mtime=mtime, exists=True, crlf="\r\n" in raw)


def scan_vault(root: Path) -> list[Note]:
    """Every markdown note in the vault (skips hidden folders and Excalidraw drawings)."""
    out: list[Note] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if not is_hidden_part(d)]
        for name in filenames:
            if name.startswith(".") or not is_note_name(name):
                continue
            full = Path(dirpath, name)
            try:
                disk = _read(full)
            except FileNotFoundError:  # deleted while scanning
                continue
            out.append(note_from_path(full.relative_to(root).as_posix(), disk.text, disk.mtime))
    out.sort(key=lambda n: n.path)
    return out


def read_file(root: Path, path: str) -> DiskFile:
    """Read one note. A missing note is not an error: it comes back with exists=False."""
    full = resolve_note_path(root, path)
    try:
        return _read(full)
    except (FileNotFoundError, NotADirectoryError):
        return DiskFile(text="", mtime=0, exists=False, crlf=False)


def write_file(
    root: Path,
    path: str,
    text: str,
    *,
    create_folder: bool = False,
    crlf: bool = False,
    base: BaseVersion | None = None,
) -> int:
    """
    Write one note and return its new modified time (ms).

    The folder is never created silently (a folder moved in Obsidian would otherwise be
    re-created): pass create_folder to allow it, otherwise FolderMissingError is raised.
    With base, the write is refused (ConflictError) if the note changed on disk since then.
    """
    full = resolve_note_path(root, path)
    with _write_lock:
        if not full.parent.is_dir():
            if not create_folder:
                raise FolderMissingError(split_path(path)[0])
            full.parent.mkdir(parents=True, exist_ok=True)

        if base is not None:
            disk = read_file(root, path)
            if disk.exists and disk.text != base.text and disk.mtime > base.mtime:
                raise ConflictError(disk)

        with open(full, "w", encoding="utf-8", newline="") as f:
            f.write(text.replace("\n", "\r\n") if crlf else text)
        return _mtime_ms(full.stat())
