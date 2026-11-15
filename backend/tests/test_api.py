from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from .conftest import make_client


def test_vault_info(client: TestClient, vault: Path) -> None:
    assert client.get("/api/vault").json() == {"status": "ready", "name": "vault", "path": str(vault)}


def test_vault_not_configured_or_missing(tmp_path: Path) -> None:
    c = make_client(None, tmp_path)
    assert c.get("/api/vault").json() == {"status": "not_configured", "name": None, "path": None}
    r = c.get("/api/notes")
    assert r.status_code == 503 and r.json()["code"] == "vault_unavailable"

    c = make_client(tmp_path / "gone", tmp_path)
    assert c.get("/api/vault").json()["status"] == "missing"
    assert c.get("/api/file", params={"path": "a.md"}).status_code == 503


def test_list_notes_skips_hidden_and_drawings(client: TestClient) -> None:
    notes = client.get("/api/notes").json()
    assert [n["path"] for n in notes] == ["Daily Updates/2026-11-15.md", "Projects/Plan.md", "Top.md"]
    plan = notes[1]
    assert plan["name"] == "Plan" and plan["folder"] == "Projects"
    assert plan["text"] == "line 1\nline 2\n"  # always \n
    assert isinstance(plan["mtime"], int) and plan["mtime"] > 1_600_000_000_000  # ms


def test_read_file(client: TestClient) -> None:
    r = client.get("/api/file", params={"path": "Projects/Plan.md"}).json()
    assert r["text"] == "line 1\nline 2\n" and r["exists"] and r["crlf"]

    missing = client.get("/api/file", params={"path": "Nope/x.md"}).json()
    assert missing == {"text": "", "mtime": 0, "exists": False, "crlf": False}


def test_utf8_bom_is_dropped(client: TestClient, vault: Path) -> None:
    (vault / "Bom.md").write_bytes("\ufeffhello".encode())
    assert client.get("/api/file", params={"path": "Bom.md"}).json()["text"] == "hello"


@pytest.mark.parametrize(
    "path",
    ["../secret.md", "/etc/x.md", "C:/x.md", ".obsidian/app.md", "a/./b.md", "a//b.md",
     "node_modules/x.md", "image.png", "Drawing.excalidraw.md", ""],
)
def test_rejects_paths_outside_notes(client: TestClient, path: str) -> None:
    assert client.get("/api/file", params={"path": path}).status_code == 400
    r = client.put("/api/file", json={"path": path, "text": "x"})
    assert r.status_code == 400 and r.json()["code"] == "bad_path"


def test_write_and_read_back(client: TestClient, vault: Path) -> None:
    r = client.put("/api/file", json={"path": "Top.md", "text": "new\ntext"})
    assert r.status_code == 200
    assert (vault / "Top.md").read_bytes() == b"new\ntext"
    disk = client.get("/api/file", params={"path": "Top.md"}).json()
    assert disk["mtime"] == r.json()["mtime"]


def test_write_keeps_crlf(client: TestClient, vault: Path) -> None:
    client.put("/api/file", json={"path": "Projects/Plan.md", "text": "a\nb\n", "crlf": True})
    assert (vault / "Projects" / "Plan.md").read_bytes() == b"a\r\nb\r\n"


def test_write_never_creates_a_folder_silently(client: TestClient, vault: Path) -> None:
    r = client.put("/api/file", json={"path": "Moved/Sub/n.md", "text": "x"})
    assert r.status_code == 409
    assert r.json() == {"code": "folder_missing", "message": r.json()["message"], "folder": "Moved/Sub"}
    assert not (vault / "Moved").exists()

    r = client.put("/api/file", json={"path": "Moved/Sub/n.md", "text": "x", "createFolder": True})
    assert r.status_code == 200 and (vault / "Moved" / "Sub" / "n.md").read_text() == "x"


def test_write_refuses_when_changed_on_disk(client: TestClient, vault: Path) -> None:
    seen = client.get("/api/file", params={"path": "Top.md"}).json()
    base = {"text": seen["text"], "mtime": seen["mtime"]}

    # someone edits the note in Obsidian
    import os

    (vault / "Top.md").write_text("from obsidian", encoding="utf-8")
    os.utime(vault / "Top.md", ns=(0, (seen["mtime"] + 5000) * 1_000_000))

    r = client.put("/api/file", json={"path": "Top.md", "text": "mine", "base": base})
    assert r.status_code == 409
    body = r.json()
    assert body["code"] == "conflict" and body["disk"]["text"] == "from obsidian"
    assert (vault / "Top.md").read_text() == "from obsidian"

    # without a base (the user chose "keep mine") it overwrites
    assert client.put("/api/file", json={"path": "Top.md", "text": "mine"}).status_code == 200
    assert (vault / "Top.md").read_text() == "mine"


def test_write_with_matching_base_succeeds(client: TestClient) -> None:
    seen = client.get("/api/file", params={"path": "Top.md"}).json()
    base = {"text": seen["text"], "mtime": seen["mtime"]}
    assert client.put("/api/file", json={"path": "Top.md", "text": "ok", "base": base}).status_code == 200
    # a new note: nothing on disk to conflict with
    base = {"text": "", "mtime": 0}
    assert client.put("/api/file", json={"path": "New.md", "text": "n", "base": base}).status_code == 200


def test_only_local_pages_are_served(vault: Path, tmp_path: Path) -> None:
    c = make_client(vault, tmp_path)
    assert c.get("/api/vault", headers={"origin": "http://localhost:5173"}).status_code == 200
    assert c.get("/api/vault", headers={"host": "evil.example"}).status_code == 403
    r = c.put("/api/file", json={"path": "Top.md", "text": "x"}, headers={"origin": "https://evil.example"})
    assert r.status_code == 403
    assert (vault / "Top.md").read_text() == "top"
