"""Settings, read from environment variables or backend/.env (prefix DESKBOARD_)."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env", env_prefix="DESKBOARD_", extra="ignore"
    )

    # The Obsidian vault folder, e.g. G:/My Drive/obsidian
    vault_path: Path | None = None
    # Built frontend, served at / when it exists (npm run build)
    frontend_dist: Path = BACKEND_DIR.parent / "frontend" / "dist"
    # Push changes made in Obsidian to the browser
    watch: bool = True
    # Poll instead of OS events. Needed when the vault is on a drive that doesn't
    # report changes (some Google Drive for Desktop setups).
    watch_polling: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
