"""Pytest fixtures. Tests use temporary database files only."""

from __future__ import annotations

import pytest

from app.config import clear_settings_cache
from app.database import initialize_schema


@pytest.fixture
def tmp_db_path(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    backup_dir = tmp_path / "backups"
    db_path = data_dir / "test.db"
    data_dir.mkdir()
    backup_dir.mkdir()
    monkeypatch.setenv("DUKAANVOICE_DATA_DIR", str(data_dir))
    monkeypatch.setenv("DUKAANVOICE_DATABASE_PATH", str(db_path))
    monkeypatch.setenv("DUKAANVOICE_BACKUP_DIR", str(backup_dir))
    monkeypatch.setenv("DUKAANVOICE_HOST", "127.0.0.1")
    clear_settings_cache()
    yield db_path
    clear_settings_cache()


@pytest.fixture
def initialized_db(tmp_db_path):
    initialize_schema(tmp_db_path)
    return tmp_db_path
