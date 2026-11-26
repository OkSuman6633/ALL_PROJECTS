from __future__ import annotations
import json, os, tempfile, threading
from pathlib import Path
from typing import Any

class RevisionConflict(Exception): pass

class JsonStateStore:
    """Local development adapter. Atomic replace + process lock; not a distributed CAS store."""
    def __init__(self, root: str):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
    def _path(self, tenant_id: str, assessment_id: str) -> Path:
        return self.root / tenant_id / f"{assessment_id}.json"
    def create(self, item: dict[str, Any]) -> dict[str, Any]:
        path = self._path(item["tenant_id"], item["id"])
        path.parent.mkdir(parents=True, exist_ok=True)
        with self._lock:
            if path.exists(): raise FileExistsError(item["id"])
            self._write(path, item)
        return item
    def get(self, tenant_id: str, assessment_id: str) -> dict[str, Any] | None:
        path = self._path(tenant_id, assessment_id)
        with self._lock:
            if not path.exists(): return None
            return json.loads(path.read_text(encoding="utf-8"))
    def list(self, tenant_id: str) -> list[dict[str, Any]]:
        folder = self.root / tenant_id
        if not folder.exists(): return []
        with self._lock:
            items = [json.loads(p.read_text(encoding="utf-8")) for p in folder.glob("*.json")]
        return sorted(items, key=lambda x: x.get("updated_at", ""), reverse=True)
    def update(self, tenant_id: str, assessment_id: str, expected_revision: int, mutator) -> dict[str, Any]:
        path = self._path(tenant_id, assessment_id)
        with self._lock:
            if not path.exists(): return None
            item = json.loads(path.read_text(encoding="utf-8"))
            if item["revision"] != expected_revision: raise RevisionConflict()
            changed = mutator(item)
            changed["revision"] = expected_revision + 1
            self._write(path, changed)
            return changed
    def delete(self, tenant_id: str, assessment_id: str) -> bool:
        path = self._path(tenant_id, assessment_id)
        with self._lock:
            if path.exists():
                path.unlink()
                return True
            return False
    def _write(self, path: Path, item: dict[str, Any]):
        fd, tmp = tempfile.mkstemp(prefix=".state-", dir=str(path.parent))
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(item, f, ensure_ascii=False, indent=2)
                f.flush(); os.fsync(f.fileno())
            os.replace(tmp, path)
        finally:
            if os.path.exists(tmp): os.unlink(tmp)
