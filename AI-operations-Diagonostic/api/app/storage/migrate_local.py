from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from .auth_db import AuthDB
from .sqlite_store import SqliteStateStore


def run_migration(
    db_path: Path,
    legacy_auth_dbs: list[Path],
    legacy_json_dirs: list[Path],
    docs_dir: Path | None = None,
    cleanup_legacy: bool = False,
) -> dict[str, object]:
    store = SqliteStateStore(db_path)
    AuthDB(db_path)

    auth_totals = {"workspaces": 0, "users": 0, "sessions": 0}
    for auth_path in legacy_auth_dbs:
        res = store.migrate_legacy_auth_db(auth_path)
        for k, v in res.items():
            auth_totals[k] += v
        if cleanup_legacy and auth_path.exists() and auth_path.resolve() != db_path.resolve():
            try:
                auth_path.unlink()
            except PermissionError:
                pass

    json_totals = {"assessments": 0, "sources": 0}
    for json_dir in legacy_json_dirs:
        res = store.migrate_legacy_json_dir(json_dir)
        for k, v in res.items():
            json_totals[k] += v
        if cleanup_legacy and json_dir.exists():
            for child in list(json_dir.iterdir()):
                if child.is_dir():
                    shutil.rmtree(child, ignore_errors=True)

    docs_imported = store.import_docs_dir(docs_dir) if docs_dir else 0

    return {
        "db_path": str(db_path),
        "auth": auth_totals,
        "legacy_json": json_totals,
        "docs_imported": docs_imported,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate local JSON/auth/docs into unified aod.db")
    parser.add_argument("--cleanup", action="store_true", help="Remove legacy JSON dirs and auth.db after migration")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[3]
    api_data = repo_root / "api" / "data"
    root_data = repo_root / "data"
    docs_dir = repo_root / "docs"

    result = run_migration(
        db_path=api_data / "aod.db",
        legacy_auth_dbs=[api_data / "auth.db", root_data / "auth.db"],
        legacy_json_dirs=[api_data, root_data],
        docs_dir=docs_dir,
        cleanup_legacy=args.cleanup,
    )
    print(result)


if __name__ == "__main__":
    main()
