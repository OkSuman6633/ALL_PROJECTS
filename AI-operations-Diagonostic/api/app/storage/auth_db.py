from __future__ import annotations

import hashlib
import hmac
import re
import secrets
import sqlite3
import threading
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
VALID_ROLES = ("owner", "admin", "analyst", "viewer")


class EmailAlreadyExistsError(Exception):
    pass


class InvalidCredentialsError(Exception):
    pass


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _utc_now_iso() -> str:
    return _utc_now().isoformat()


def normalize_email(email: str) -> str:
    return email.strip().lower()


def validate_email(email: str) -> str:
    normalized = normalize_email(email)
    if not normalized or not _EMAIL_RE.match(normalized):
        raise ValueError("Enter a valid email address.")
    return normalized


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    iterations = 310_000
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"pbkdf2_sha256${iterations}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        scheme, iter_str, salt_hex, digest_hex = stored_hash.split("$", 3)
        if scheme != "pbkdf2_sha256":
            return False
        iterations = int(iter_str)
        salt = bytes.fromhex(salt_hex)
        expected_digest = bytes.fromhex(digest_hex)
    except (ValueError, TypeError):
        return False

    actual_digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(actual_digest, expected_digest)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _row_to_user(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "email": row["email"],
        "full_name": row["full_name"],
        "job_title": row["job_title"],
        "workspace_id": row["workspace_id"],
        "workspace_name": row["workspace_name"],
        "sector": row["sector"] if "sector" in row.keys() else "Professional services",
        "default_currency": row["default_currency"] if "default_currency" in row.keys() else "GBP",
        "role": row["role"],
        "onboarding_completed": bool(row["onboarding_completed"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


class AuthDB:
    """Local SQLite store for user credentials, workspaces, RBAC roles, and session tokens."""

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
                CREATE TABLE IF NOT EXISTS workspaces (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    sector TEXT NOT NULL DEFAULT 'Professional services',
                    default_currency TEXT NOT NULL DEFAULT 'GBP',
                    owner_user_id TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    full_name TEXT NOT NULL DEFAULT '',
                    job_title TEXT NOT NULL DEFAULT '',
                    workspace_id TEXT NOT NULL,
                    workspace_name TEXT NOT NULL DEFAULT '',
                    role TEXT NOT NULL DEFAULT 'owner',
                    onboarding_completed INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS sessions (
                    token_hash TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    revoked INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
                CREATE INDEX IF NOT EXISTS idx_users_workspace ON users(workspace_id);
                CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
                """
            )

    def register_user(self, email: str, password: str) -> dict[str, Any]:
        normalized_email = validate_email(email)
        user_id = str(uuid.uuid4())
        workspace_id = f"ws-{uuid.uuid4()}"
        now = _utc_now_iso()
        pw_hash = hash_password(password)

        with self._lock, self._connect() as conn:
            existing = conn.execute(
                "SELECT id FROM users WHERE email = ?", (normalized_email,)
            ).fetchone()
            if existing:
                raise EmailAlreadyExistsError("An account with this email already exists.")

            conn.execute(
                """
                INSERT INTO users (
                    id, email, password_hash, full_name, job_title,
                    workspace_id, workspace_name, role, onboarding_completed,
                    created_at, updated_at
                ) VALUES (?, ?, ?, '', '', ?, '', 'owner', 0, ?, ?)
                """,
                (user_id, normalized_email, pw_hash, workspace_id, now, now),
            )
            row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
            return _row_to_user(row)

    def complete_onboarding(
        self,
        user_id: str,
        workspace_name: str,
        full_name: str,
        job_title: str = "Operations Lead",
        sector: str = "Professional services",
        default_currency: str = "GBP",
    ) -> dict[str, Any]:
        clean_workspace = workspace_name.strip()
        clean_name = full_name.strip()
        clean_title = job_title.strip() or "Operations Lead"
        clean_sector = sector.strip() or "Professional services"
        clean_currency = (default_currency.strip() or "GBP").upper()
        now = _utc_now_iso()

        with self._lock, self._connect() as conn:
            user_row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
            if not user_row:
                raise ValueError("User not found.")

            workspace_id = user_row["workspace_id"]
            ws_row = conn.execute("SELECT id FROM workspaces WHERE id = ?", (workspace_id,)).fetchone()
            if ws_row:
                conn.execute(
                    """
                    UPDATE workspaces
                    SET name = ?, sector = ?, default_currency = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (clean_workspace, clean_sector, clean_currency, now, workspace_id),
                )
            else:
                conn.execute(
                    """
                    INSERT INTO workspaces (id, name, sector, default_currency, owner_user_id, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (workspace_id, clean_workspace, clean_sector, clean_currency, user_id, now, now),
                )

            conn.execute(
                """
                UPDATE users
                SET full_name = ?, job_title = ?, workspace_name = ?, onboarding_completed = 1, updated_at = ?
                WHERE id = ?
                """,
                (clean_name, clean_title, clean_workspace, now, user_id),
            )

            updated = conn.execute(
                """
                SELECT u.*, w.sector AS sector, w.default_currency AS default_currency
                FROM users u
                LEFT JOIN workspaces w ON u.workspace_id = w.id
                WHERE u.id = ?
                """,
                (user_id,),
            ).fetchone()
            return _row_to_user(updated)

    def authenticate(self, email: str, password: str) -> dict[str, Any] | None:
        normalized_email = normalize_email(email)
        with self._lock, self._connect() as conn:
            row = conn.execute(
                """
                SELECT u.*, w.sector AS sector, w.default_currency AS default_currency
                FROM users u
                LEFT JOIN workspaces w ON u.workspace_id = w.id
                WHERE u.email = ?
                """,
                (normalized_email,),
            ).fetchone()
            if not row or not verify_password(password, row["password_hash"]):
                return None
            return _row_to_user(row)

    def create_session(self, user_id: str, ttl_days: int = 30) -> str:
        token = secrets.token_urlsafe(32)
        token_hash = _hash_token(token)
        now = _utc_now()
        expires = now + timedelta(days=ttl_days)

        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO sessions (token_hash, user_id, created_at, expires_at, revoked)
                VALUES (?, ?, ?, ?, 0)
                """,
                (token_hash, user_id, now.isoformat(), expires.isoformat()),
            )
        return token

    def get_user_by_token(self, token: str) -> dict[str, Any] | None:
        if not token:
            return None
        token_hash = _hash_token(token)
        now_iso = _utc_now_iso()

        with self._lock, self._connect() as conn:
            row = conn.execute(
                """
                SELECT u.*, w.sector AS sector, w.default_currency AS default_currency
                FROM sessions s
                JOIN users u ON s.user_id = u.id
                LEFT JOIN workspaces w ON u.workspace_id = w.id
                WHERE s.token_hash = ? AND s.revoked = 0 AND s.expires_at > ?
                """,
                (token_hash, now_iso),
            ).fetchone()
            if not row:
                return None
            return _row_to_user(row)

    def revoke_session(self, token: str) -> None:
        if not token:
            return
        token_hash = _hash_token(token)
        with self._lock, self._connect() as conn:
            conn.execute(
                "UPDATE sessions SET revoked = 1 WHERE token_hash = ?",
                (token_hash,),
            )

    def list_workspace_users(self, workspace_id: str) -> list[dict[str, Any]]:
        with self._lock, self._connect() as conn:
            rows = conn.execute(
                """
                SELECT u.*, w.sector AS sector, w.default_currency AS default_currency
                FROM users u
                LEFT JOIN workspaces w ON u.workspace_id = w.id
                WHERE u.workspace_id = ?
                ORDER BY u.created_at ASC
                """,
                (workspace_id,),
            ).fetchall()
            return [_row_to_user(r) for r in rows]

    def create_workspace_member(
        self,
        workspace_id: str,
        workspace_name: str,
        email: str,
        password: str,
        full_name: str,
        role: str = "analyst",
        job_title: str = "",
    ) -> dict[str, Any]:
        if role not in VALID_ROLES or role == "owner":
            raise ValueError("Member role must be admin, analyst, or viewer.")
        normalized_email = validate_email(email)
        user_id = str(uuid.uuid4())
        now = _utc_now_iso()
        pw_hash = hash_password(password)

        with self._lock, self._connect() as conn:
            existing = conn.execute(
                "SELECT id FROM users WHERE email = ?", (normalized_email,)
            ).fetchone()
            if existing:
                raise EmailAlreadyExistsError("An account with this email already exists.")

            conn.execute(
                """
                INSERT INTO users (
                    id, email, password_hash, full_name, job_title,
                    workspace_id, workspace_name, role, onboarding_completed,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                """,
                (
                    user_id,
                    normalized_email,
                    pw_hash,
                    full_name.strip(),
                    job_title.strip() or role.capitalize(),
                    workspace_id,
                    workspace_name,
                    role,
                    now,
                    now,
                ),
            )
            row = conn.execute(
                """
                SELECT u.*, w.sector AS sector, w.default_currency AS default_currency
                FROM users u
                LEFT JOIN workspaces w ON u.workspace_id = w.id
                WHERE u.id = ?
                """,
                (user_id,),
            ).fetchone()
            return _row_to_user(row)

    def update_member_role(
        self, workspace_id: str, target_user_id: str, new_role: str
    ) -> dict[str, Any] | None:
        if new_role not in VALID_ROLES or new_role == "owner":
            raise ValueError("Role must be admin, analyst, or viewer.")
        now = _utc_now_iso()
        with self._lock, self._connect() as conn:
            target = conn.execute(
                "SELECT * FROM users WHERE id = ? AND workspace_id = ?",
                (target_user_id, workspace_id),
            ).fetchone()
            if not target:
                return None
            if target["role"] == "owner":
                raise ValueError("Workspace owner role cannot be changed.")
            conn.execute(
                "UPDATE users SET role = ?, updated_at = ? WHERE id = ?",
                (new_role, now, target_user_id),
            )
            row = conn.execute(
                """
                SELECT u.*, w.sector AS sector, w.default_currency AS default_currency
                FROM users u
                LEFT JOIN workspaces w ON u.workspace_id = w.id
                WHERE u.id = ?
                """,
                (target_user_id,),
            ).fetchone()
            return _row_to_user(row)
