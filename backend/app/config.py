"""Application configuration loaded from environment variables."""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

BACKEND_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DATA_DIR = BACKEND_ROOT / "data"
DEFAULT_BACKUP_DIR = BACKEND_ROOT / "backups"

load_dotenv(BACKEND_ROOT / ".env")


@dataclass(frozen=True)
class Settings:
    """Runtime settings. Secrets must stay in environment files, not source."""

    host: str
    port: int
    data_dir: Path
    database_path: Path
    backup_dir: Path
    cors_origins: tuple[str, ...]


def _parse_origins(raw: str) -> tuple[str, ...]:
    origins = tuple(item.strip() for item in raw.split(",") if item.strip())
    return origins or ("http://127.0.0.1:5173", "http://localhost:5173")


def load_settings() -> Settings:
    data_dir = Path(
        os.getenv("DUKAANVOICE_DATA_DIR", str(DEFAULT_DATA_DIR))
    ).expanduser().resolve()
    database_path = Path(
        os.getenv(
            "DUKAANVOICE_DATABASE_PATH",
            str(data_dir / "dukaanvoice.db"),
        )
    ).expanduser().resolve()
    backup_dir = Path(
        os.getenv("DUKAANVOICE_BACKUP_DIR", str(DEFAULT_BACKUP_DIR))
    ).expanduser().resolve()
    host = os.getenv("DUKAANVOICE_HOST", "127.0.0.1").strip() or "127.0.0.1"
    port = int(os.getenv("DUKAANVOICE_PORT", "8000"))
    cors_origins = _parse_origins(
        os.getenv(
            "DUKAANVOICE_CORS_ORIGINS",
            "http://127.0.0.1:5173,http://localhost:5173",
        )
    )
    return Settings(
        host=host,
        port=port,
        data_dir=data_dir,
        database_path=database_path,
        backup_dir=backup_dir,
        cors_origins=cors_origins,
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return load_settings()


def clear_settings_cache() -> None:
    get_settings.cache_clear()
