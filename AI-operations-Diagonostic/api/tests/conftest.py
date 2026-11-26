from __future__ import annotations

import pytest

from app import main
from app.storage.auth_db import AuthDB
from app.storage.sqlite_store import SqliteStateStore


@pytest.fixture(autouse=True)
def _isolated_sqlite_store(tmp_path, monkeypatch):
    """Ensure test runs never write into workspace data/ or api/data/."""
    test_db = tmp_path / "test_aod.db"
    monkeypatch.setattr(main, "store", SqliteStateStore(test_db))
    monkeypatch.setattr(main, "auth_db", AuthDB(test_db))
    monkeypatch.setattr(main.settings, "data_dir", str(tmp_path))
