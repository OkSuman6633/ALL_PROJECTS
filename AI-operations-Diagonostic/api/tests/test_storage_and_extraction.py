import pytest
from fastapi.testclient import TestClient

from app import main
from app.storage.auth_db import AuthDB
from app.storage.json_store import JsonStateStore, RevisionConflict
from app.storage.sqlite_store import SqliteStateStore
from app.services.extraction import extract_file

def test_json_store_revision_conflict(tmp_path):
    store=JsonStateStore(str(tmp_path))
    item={"id":"assessment-1", "tenant_id":"tenant-a", "revision":1, "status":"CREATED"}
    store.create(item)
    updated=store.update("tenant-a", "assessment-1", 1, lambda x: {**x, "status":"REVIEW"})
    assert updated["revision"] == 2
    with pytest.raises(RevisionConflict):
        store.update("tenant-a", "assessment-1", 1, lambda x: {**x, "status":"COMPLETE"})


def test_sqlite_store_revision_conflict_blobs_and_docs(tmp_path, monkeypatch):
    db_path = tmp_path / "aod.db"
    store = SqliteStateStore(db_path)
    auth_db = AuthDB(db_path)
    monkeypatch.setattr(main, "store", store)
    monkeypatch.setattr(main, "auth_db", auth_db)

    item = {
        "id": "assessment-sqlite-1",
        "tenant_id": "tenant-a",
        "revision": 1,
        "status": "CREATED",
        "activities": [
            {
                "activity_id": "act-1",
                "label": "Review invoice",
                "monthly_volume": 100,
                "minutes_per_unit": 5,
                "hourly_rate": 30,
                "confirmed": True,
            }
        ],
    }
    store.create(item)
    updated = store.update("tenant-a", "assessment-sqlite-1", 1, lambda x: {**x, "status": "REVIEW"})
    assert updated["revision"] == 2
    with pytest.raises(RevisionConflict):
        store.update("tenant-a", "assessment-sqlite-1", 1, lambda x: {**x, "status": "COMPLETE"})

    # Source blob deduplication and retrieval
    raw_csv = b"activity,monthly_volume\nReview invoice,100\n"
    store.save_source_blob("tenant-a", "assessment-sqlite-1", "src-1", "sha-abc", "log.csv", "csv", raw_csv)
    assert store.get_source_blob("tenant-a", "assessment-sqlite-1", "sha-abc") == raw_csv

    # Docs import & API retrieval from SQLite
    docs_dir = tmp_path / "docs"
    docs_dir.mkdir()
    (docs_dir / "README.md").write_text("# Operations Guide\nStored in SQLite.", encoding="utf-8")
    assert store.import_docs_dir(docs_dir) == 1

    client = TestClient(main.app)
    headers = {"Authorization": f"Bearer {main.settings.demo_token}"}
    docs_list = client.get("/v1/docs", headers=headers)
    assert docs_list.status_code == 200
    assert docs_list.json()["items"][0]["path"] == "README.md"

    doc_item = client.get("/v1/docs/README.md", headers=headers)
    assert doc_item.status_code == 200
    assert "Stored in SQLite." in doc_item.json()["text_content"]

    assert store.delete("tenant-a", "assessment-sqlite-1") is True
    assert store.get_source_blob("tenant-a", "assessment-sqlite-1", "sha-abc") is None

def test_csv_extraction_hashes_and_reads_rows():
    result=extract_file("sample.csv", "text/csv", b"step,volume\nReview,10\n")
    assert result["kind"] == "csv"
    assert result["row_count"] == 1
    assert result["rows"][0]["step"] == "Review"
    assert len(result["sha256"]) == 64

def test_rejects_unapproved_file_type():
    with pytest.raises(ValueError):
        extract_file("script.exe", "application/octet-stream", b"not a document")
