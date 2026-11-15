from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


@pytest.fixture
def vault(tmp_path: Path) -> Path:
    root = tmp_path / "vault"
    (root / "Daily Updates").mkdir(parents=True)
    (root / "Daily Updates" / "2026-11-15.md").write_text("## Todo\n- [ ] one\n", encoding="utf-8")
    (root / "Projects").mkdir()
    (root / "Projects" / "Plan.md").write_bytes(b"line 1\r\nline 2\r\n")
    (root / "Top.md").write_text("top", encoding="utf-8")
    # ignored
    (root / ".obsidian").mkdir()
    (root / ".obsidian" / "app.md").write_text("x", encoding="utf-8")
    (root / "node_modules").mkdir()
    (root / "node_modules" / "x.md").write_text("x", encoding="utf-8")
    (root / "Drawing.excalidraw.md").write_text("x", encoding="utf-8")
    (root / "image.png").write_bytes(b"\x89PNG")
    return root


def make_client(vault_path: Path | None, tmp_path: Path) -> TestClient:
    settings = Settings(vault_path=vault_path, watch=False, frontend_dist=tmp_path / "no-dist")
    return TestClient(create_app(settings), base_url="http://localhost")


@pytest.fixture
def client(vault: Path, tmp_path: Path) -> TestClient:
    return make_client(vault, tmp_path)
