"""Turning client-supplied note paths into safe paths inside the vault."""

from pathlib import Path

SKIP_DIRS = frozenset({".obsidian", ".trash", ".git", "node_modules"})


class BadPathError(ValueError):
    pass


def is_note_name(name: str) -> bool:
    return name.endswith(".md") and not name.endswith(".excalidraw.md")


def is_hidden_part(part: str) -> bool:
    return part.startswith(".") or part in SKIP_DIRS


def resolve_note_path(root: Path, rel: str) -> Path:
    """Map "Folder/Note.md" to a file under root: only markdown notes, never outside the vault."""
    if not rel or rel.startswith(("/", "\\")) or ":" in rel:
        raise BadPathError(f"Not a vault path: {rel!r}")
    parts = rel.replace("\\", "/").split("/")
    if any(p in ("", ".", "..") or is_hidden_part(p) for p in parts):
        raise BadPathError(f"Not a vault path: {rel!r}")
    if not is_note_name(parts[-1]):
        raise BadPathError(f"Only markdown notes can be read or written: {rel!r}")

    full = root.joinpath(*parts)
    try:  # also catches symlinks that point out of the vault
        full.resolve().relative_to(root.resolve())
    except ValueError:
        raise BadPathError(f"Not a vault path: {rel!r}") from None
    return full


def to_vault_path(root: Path, full: Path) -> str | None:
    """The vault path of a file on disk, or None if it's outside the vault or hidden."""
    try:
        parts = full.relative_to(root).parts
    except ValueError:
        return None
    if not parts or any(is_hidden_part(p) for p in parts):
        return None
    return "/".join(parts)
