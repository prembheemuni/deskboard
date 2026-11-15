"""Request/response shapes. JSON uses camelCase to match the TypeScript frontend."""

from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class Note(ApiModel):
    """A markdown note. Text always uses \\n line endings."""

    path: str  # inside the vault, with "/", e.g. "Daily Updates/2026-11-15.md"
    name: str  # file name without ".md"
    folder: str  # "" for the top of the vault
    text: str
    mtime: int  # last modified, in ms


class DiskFile(ApiModel):
    text: str
    mtime: int
    exists: bool
    crlf: bool  # the file uses Windows (\r\n) line endings


class BaseVersion(ApiModel):
    """The version the client last saw. The write is refused if the note changed since."""

    text: str
    mtime: int


class WriteRequest(ApiModel):
    path: str
    text: str
    # otherwise a missing folder is an error: it's never re-created silently
    create_folder: bool = False
    crlf: bool = False
    base: BaseVersion | None = None


class WriteResult(ApiModel):
    mtime: int


class VaultInfo(ApiModel):
    status: Literal["ready", "not_configured", "missing"]
    name: str | None = None
    path: str | None = None


class FileChange(ApiModel):
    kind: Literal["changed", "deleted"]
    path: str


class ApiErrorBody(ApiModel):
    code: Literal["bad_path", "folder_missing", "conflict", "vault_unavailable"]
    message: str
    folder: str | None = None  # folder_missing
    disk: DiskFile | None = None  # conflict: the version now on disk
