from __future__ import annotations

import hashlib
import io
import json
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from .json_store import RevisionConflict


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _extract_docx_text(raw_bytes: bytes) -> str:
    try:
        from docx import Document

        doc = Document(io.BytesIO(raw_bytes))
        parts: list[str] = []
        for para in doc.paragraphs:
            text = para.text.strip()
            if text:
                parts.append(text)
        for table in doc.tables:
            for row in table.rows:
                cells = [cell.text.strip() for cell in row.cells if cell.text.strip()]
                if cells:
                    parts.append(" | ".join(cells))
        return "\n".join(parts)
    except Exception:
        return ""


class SqliteStateStore:
    """Unified local SQLite store for assessments, activities, calculations, source blobs, and docs."""

    def __init__(self, db_path: str | Path):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        return conn

    def _init_schema(self) -> None:
        with self._lock, self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS assessments (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL,
                    owner_id TEXT NOT NULL DEFAULT '',
                    process_name TEXT NOT NULL DEFAULT '',
                    sector TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'CREATED',
                    is_sandbox INTEGER NOT NULL DEFAULT 0,
                    revision INTEGER NOT NULL DEFAULT 1,
                    report_ready INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL DEFAULT '',
                    updated_at TEXT NOT NULL DEFAULT '',
                    data_json TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_assessments_tenant
                    ON assessments(tenant_id, updated_at DESC);

                CREATE TABLE IF NOT EXISTS assessment_activities (
                    activity_id TEXT NOT NULL,
                    assessment_id TEXT NOT NULL,
                    tenant_id TEXT NOT NULL,
                    label TEXT NOT NULL DEFAULT '',
                    monthly_volume REAL,
                    minutes_per_unit REAL,
                    hourly_rate REAL,
                    currency TEXT NOT NULL DEFAULT 'GBP',
                    confirmed INTEGER NOT NULL DEFAULT 0,
                    rejected INTEGER NOT NULL DEFAULT 0,
                    data_json TEXT NOT NULL,
                    PRIMARY KEY (assessment_id, activity_id),
                    FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_activities_tenant
                    ON assessment_activities(tenant_id, assessment_id);

                CREATE TABLE IF NOT EXISTS assessment_calculations (
                    assessment_id TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL,
                    currency TEXT NOT NULL DEFAULT 'GBP',
                    annual_hours TEXT,
                    annual_effort_cost TEXT,
                    confirmed_count INTEGER NOT NULL DEFAULT 0,
                    unconfirmed_count INTEGER NOT NULL DEFAULT 0,
                    data_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL DEFAULT '',
                    FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS source_blobs (
                    sha256 TEXT PRIMARY KEY,
                    kind TEXT NOT NULL,
                    size INTEGER NOT NULL,
                    content BLOB NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS assessment_sources (
                    assessment_id TEXT NOT NULL,
                    tenant_id TEXT NOT NULL,
                    source_id TEXT NOT NULL,
                    sha256 TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    PRIMARY KEY (assessment_id, source_id),
                    FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE,
                    FOREIGN KEY (sha256) REFERENCES source_blobs(sha256)
                );

                CREATE INDEX IF NOT EXISTS idx_assessment_sources_sha
                    ON assessment_sources(sha256);

                CREATE TABLE IF NOT EXISTS docs_documents (
                    path TEXT PRIMARY KEY,
                    filename TEXT NOT NULL,
                    extension TEXT NOT NULL,
                    size INTEGER NOT NULL,
                    sha256 TEXT NOT NULL,
                    text_content TEXT NOT NULL DEFAULT '',
                    raw_content BLOB NOT NULL,
                    imported_at TEXT NOT NULL
                );
                """
            )

    def _sync_child_tables(self, conn: sqlite3.Connection, item: dict[str, Any]) -> None:
        assessment_id = item["id"]
        tenant_id = item["tenant_id"]

        conn.execute(
            "DELETE FROM assessment_activities WHERE assessment_id = ?",
            (assessment_id,),
        )
        for act in item.get("activities") or []:
            act_id = act.get("activity_id")
            if not act_id:
                continue
            conn.execute(
                """
                INSERT INTO assessment_activities (
                    activity_id, assessment_id, tenant_id, label,
                    monthly_volume, minutes_per_unit, hourly_rate,
                    currency, confirmed, rejected, data_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    act_id,
                    assessment_id,
                    tenant_id,
                    act.get("label", ""),
                    act.get("monthly_volume"),
                    act.get("minutes_per_unit"),
                    act.get("hourly_rate"),
                    act.get("currency", item.get("currency", "GBP")) or "GBP",
                    1 if act.get("confirmed") else 0,
                    1 if act.get("rejected") else 0,
                    json.dumps(act, ensure_ascii=False),
                ),
            )

        calcs = item.get("calculations")
        if calcs is not None:
            conn.execute(
                """
                INSERT INTO assessment_calculations (
                    assessment_id, tenant_id, currency,
                    annual_hours, annual_effort_cost,
                    confirmed_count, unconfirmed_count, data_json, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(assessment_id) DO UPDATE SET
                    tenant_id = excluded.tenant_id,
                    currency = excluded.currency,
                    annual_hours = excluded.annual_hours,
                    annual_effort_cost = excluded.annual_effort_cost,
                    confirmed_count = excluded.confirmed_count,
                    unconfirmed_count = excluded.unconfirmed_count,
                    data_json = excluded.data_json,
                    updated_at = excluded.updated_at
                """,
                (
                    assessment_id,
                    tenant_id,
                    calcs.get("currency", item.get("currency", "GBP")) or "GBP",
                    str(calcs.get("annual_hours")) if calcs.get("annual_hours") is not None else None,
                    str(calcs.get("annual_effort_cost")) if calcs.get("annual_effort_cost") is not None else None,
                    int(calcs.get("confirmed_activity_count", 0) or 0),
                    int(calcs.get("unconfirmed_activity_count", 0) or 0),
                    json.dumps(calcs, ensure_ascii=False),
                    item.get("updated_at", _utc_now_iso()),
                ),
            )
        else:
            conn.execute(
                "DELETE FROM assessment_calculations WHERE assessment_id = ?",
                (assessment_id,),
            )

    def create(self, item: dict[str, Any]) -> dict[str, Any]:
        payload = json.dumps(item, ensure_ascii=False)
        with self._lock, self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            existing = conn.execute(
                "SELECT id FROM assessments WHERE id = ?", (item["id"],)
            ).fetchone()
            if existing:
                raise FileExistsError(item["id"])

            conn.execute(
                """
                INSERT INTO assessments (
                    id, tenant_id, owner_id, process_name, sector,
                    status, is_sandbox, revision, report_ready,
                    created_at, updated_at, data_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    item["id"],
                    item["tenant_id"],
                    item.get("owner_id", ""),
                    item.get("process_name", ""),
                    item.get("sector", ""),
                    item.get("status", "CREATED"),
                    1 if item.get("is_sandbox") else 0,
                    int(item.get("revision", 1)),
                    1 if item.get("report_ready") else 0,
                    item.get("created_at", ""),
                    item.get("updated_at", ""),
                    payload,
                ),
            )
            self._sync_child_tables(conn, item)
        return item

    def get(self, tenant_id: str, assessment_id: str) -> dict[str, Any] | None:
        with self._lock, self._connect() as conn:
            row = conn.execute(
                "SELECT data_json FROM assessments WHERE tenant_id = ? AND id = ?",
                (tenant_id, assessment_id),
            ).fetchone()
            if not row:
                return None
            return json.loads(row["data_json"])

    def list(self, tenant_id: str) -> list[dict[str, Any]]:
        with self._lock, self._connect() as conn:
            rows = conn.execute(
                "SELECT data_json FROM assessments WHERE tenant_id = ? ORDER BY updated_at DESC",
                (tenant_id,),
            ).fetchall()
            return [json.loads(r["data_json"]) for r in rows]

    def update(
        self,
        tenant_id: str,
        assessment_id: str,
        expected_revision: int,
        mutator: Callable[[dict[str, Any]], dict[str, Any]],
    ) -> dict[str, Any] | None:
        with self._lock, self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute(
                "SELECT revision, data_json FROM assessments WHERE tenant_id = ? AND id = ?",
                (tenant_id, assessment_id),
            ).fetchone()
            if not row:
                return None
            if int(row["revision"]) != expected_revision:
                raise RevisionConflict()

            item = json.loads(row["data_json"])
            changed = mutator(item)
            new_revision = expected_revision + 1
            changed["revision"] = new_revision
            payload = json.dumps(changed, ensure_ascii=False)

            cur = conn.execute(
                """
                UPDATE assessments
                SET process_name = ?,
                    sector = ?,
                    status = ?,
                    is_sandbox = ?,
                    revision = ?,
                    report_ready = ?,
                    updated_at = ?,
                    data_json = ?
                WHERE id = ? AND tenant_id = ? AND revision = ?
                """,
                (
                    changed.get("process_name", ""),
                    changed.get("sector", ""),
                    changed.get("status", "CREATED"),
                    1 if changed.get("is_sandbox") else 0,
                    new_revision,
                    1 if changed.get("report_ready") else 0,
                    changed.get("updated_at", ""),
                    payload,
                    assessment_id,
                    tenant_id,
                    expected_revision,
                ),
            )
            if cur.rowcount != 1:
                raise RevisionConflict()

            self._sync_child_tables(conn, changed)
            return changed

    def delete(self, tenant_id: str, assessment_id: str) -> bool:
        with self._lock, self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            shas = [
                r["sha256"]
                for r in conn.execute(
                    "SELECT sha256 FROM assessment_sources WHERE tenant_id = ? AND assessment_id = ?",
                    (tenant_id, assessment_id),
                ).fetchall()
            ]
            cur = conn.execute(
                "DELETE FROM assessments WHERE tenant_id = ? AND id = ?",
                (tenant_id, assessment_id),
            )
            if cur.rowcount == 0:
                return False

            for sha in shas:
                remaining = conn.execute(
                    "SELECT 1 FROM assessment_sources WHERE sha256 = ? LIMIT 1",
                    (sha,),
                ).fetchone()
                if not remaining:
                    conn.execute("DELETE FROM source_blobs WHERE sha256 = ?", (sha,))
            return True

    def save_source_blob(
        self,
        tenant_id: str,
        assessment_id: str,
        source_id: str,
        sha256: str,
        filename: str,
        kind: str,
        content: bytes,
    ) -> None:
        now = _utc_now_iso()
        with self._lock, self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute(
                """
                INSERT OR IGNORE INTO source_blobs (sha256, kind, size, content, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (sha256, kind, len(content), sqlite3.Binary(content), now),
            )
            conn.execute(
                """
                INSERT INTO assessment_sources (
                    assessment_id, tenant_id, source_id, sha256, filename, kind, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(assessment_id, source_id) DO UPDATE SET
                    sha256 = excluded.sha256,
                    filename = excluded.filename,
                    kind = excluded.kind
                """,
                (assessment_id, tenant_id, source_id, sha256, filename, kind, now),
            )

    def get_source_blob(
        self, tenant_id: str, assessment_id: str, sha256: str
    ) -> bytes | None:
        with self._lock, self._connect() as conn:
            row = conn.execute(
                """
                SELECT b.content
                FROM assessment_sources s
                JOIN source_blobs b ON s.sha256 = b.sha256
                WHERE s.tenant_id = ? AND s.assessment_id = ? AND s.sha256 = ?
                LIMIT 1
                """,
                (tenant_id, assessment_id, sha256),
            ).fetchone()
            if row:
                return bytes(row["content"])

            fallback = conn.execute(
                "SELECT content FROM source_blobs WHERE sha256 = ? LIMIT 1",
                (sha256,),
            ).fetchone()
            return bytes(fallback["content"]) if fallback else None

    def import_docs_dir(self, docs_dir: str | Path) -> int:
        root = Path(docs_dir)
        if not root.exists():
            return 0
        imported = 0
        now = _utc_now_iso()
        with self._lock, self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            for file_path in sorted(root.rglob("*")):
                if not file_path.is_file():
                    continue
                rel = file_path.relative_to(root).as_posix()
                raw = file_path.read_bytes()
                sha = hashlib.sha256(raw).hexdigest()
                ext = file_path.suffix.lower()
                if ext == ".docx":
                    text_content = _extract_docx_text(raw)
                else:
                    try:
                        text_content = raw.decode("utf-8")
                    except UnicodeDecodeError:
                        text_content = raw.decode("latin-1", errors="replace")

                conn.execute(
                    """
                    INSERT INTO docs_documents (
                        path, filename, extension, size, sha256,
                        text_content, raw_content, imported_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(path) DO UPDATE SET
                        filename = excluded.filename,
                        extension = excluded.extension,
                        size = excluded.size,
                        sha256 = excluded.sha256,
                        text_content = excluded.text_content,
                        raw_content = excluded.raw_content,
                        imported_at = excluded.imported_at
                    """,
                    (
                        rel,
                        file_path.name,
                        ext,
                        len(raw),
                        sha,
                        text_content,
                        sqlite3.Binary(raw),
                        now,
                    ),
                )
                imported += 1
        return imported

    def list_docs(self) -> list[dict[str, Any]]:
        with self._lock, self._connect() as conn:
            rows = conn.execute(
                """
                SELECT path, filename, extension, size, sha256, imported_at,
                       LENGTH(text_content) AS text_length
                FROM docs_documents
                ORDER BY path ASC
                """
            ).fetchall()
            return [dict(r) for r in rows]

    def get_doc(self, doc_path: str) -> dict[str, Any] | None:
        normalized = doc_path.strip().lstrip("/").replace("\\", "/")
        with self._lock, self._connect() as conn:
            row = conn.execute(
                """
                SELECT path, filename, extension, size, sha256, text_content, imported_at
                FROM docs_documents
                WHERE path = ?
                """,
                (normalized,),
            ).fetchone()
            return dict(row) if row else None

    def migrate_legacy_auth_db(self, legacy_auth_db_path: str | Path) -> dict[str, int]:
        src = Path(legacy_auth_db_path)
        if not src.exists() or src.resolve() == self.db_path.resolve():
            return {"workspaces": 0, "users": 0, "sessions": 0}

        counts = {"workspaces": 0, "users": 0, "sessions": 0}
        with self._lock, self._connect() as dst_conn:
            # Ensure auth tables exist before copying
            from .auth_db import AuthDB

            AuthDB(self.db_path)
            with sqlite3.connect(str(src)) as src_conn:
                src_conn.row_factory = sqlite3.Row
                for table in ("workspaces", "users", "sessions"):
                    exists = src_conn.execute(
                        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
                        (table,),
                    ).fetchone()
                    if not exists:
                        continue
                    rows = src_conn.execute(f"SELECT * FROM {table}").fetchall()
                    for r in rows:
                        cols = r.keys()
                        placeholders = ", ".join(["?"] * len(cols))
                        col_list = ", ".join(cols)
                        cur = dst_conn.execute(
                            f"INSERT OR IGNORE INTO {table} ({col_list}) VALUES ({placeholders})",
                            tuple(r[c] for c in cols),
                        )
                        counts[table] += cur.rowcount
        return counts

    def migrate_legacy_json_dir(self, data_root: str | Path) -> dict[str, int]:
        root = Path(data_root)
        if not root.exists():
            return {"assessments": 0, "sources": 0}

        imported_assessments = 0
        imported_sources = 0

        for tenant_dir in sorted(root.iterdir()):
            if not tenant_dir.is_dir():
                continue
            tenant_id = tenant_dir.name
            for json_file in sorted(tenant_dir.glob("*.json")):
                try:
                    item = json.loads(json_file.read_text(encoding="utf-8"))
                except Exception:
                    continue
                if not isinstance(item, dict) or "id" not in item:
                    continue
                item.setdefault("tenant_id", tenant_id)
                try:
                    self.create(item)
                    imported_assessments += 1
                except FileExistsError:
                    pass

                assessment_id = item["id"]
                uploads_by_sha = {
                    u.get("sha256"): u
                    for u in (item.get("uploads") or [])
                    if isinstance(u, dict) and u.get("sha256")
                }
                sources_dir = tenant_dir / assessment_id / "sources"
                if sources_dir.is_dir():
                    for src_file in sorted(sources_dir.iterdir()):
                        if not src_file.is_file():
                            continue
                        raw = src_file.read_bytes()
                        sha = src_file.stem
                        ext = src_file.suffix.lower()
                        kind = "pdf" if ext == ".pdf" else "csv"
                        upload_meta = uploads_by_sha.get(sha, {})
                        source_id = upload_meta.get("id") or hashlib.sha256(
                            f"{assessment_id}:{sha}".encode("utf-8")
                        ).hexdigest()[:16]
                        filename = upload_meta.get("filename") or src_file.name
                        self.save_source_blob(
                            tenant_id=item["tenant_id"],
                            assessment_id=assessment_id,
                            source_id=source_id,
                            sha256=sha,
                            filename=filename,
                            kind=kind,
                            content=raw,
                        )
                        imported_sources += 1

        return {"assessments": imported_assessments, "sources": imported_sources}
