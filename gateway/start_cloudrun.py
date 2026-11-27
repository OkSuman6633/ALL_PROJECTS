"""Production process supervisor and Nginx entrypoint for Cloud Run.

Runs all 6 FastAPI backends, both Next.js standalone servers, and Nginx on $PORT
inside a single Google Cloud Run container.
"""

from __future__ import annotations

import os
import signal
import socket
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

APP_ROOT = Path("/app")
DATA_ROOT = Path(os.getenv("UNIFIED_DATA_DIR", "/app/data"))
NGINX_TEMPLATE = APP_ROOT / "gateway" / "nginx.cloudrun.conf.template"
NGINX_CONF_OUT = Path("/etc/nginx/conf.d/default.conf")
NGINX_SITES_DEFAULT = Path("/etc/nginx/sites-enabled/default")


@dataclass
class ServiceSpec:
    name: str
    port: int
    cmd: list[str]
    cwd: Path
    env: dict[str, str] = field(default_factory=dict)
    proc: subprocess.Popen | None = None
    restarts: int = 0


def _ensure_dirs() -> None:
    for rel in (
        "agent_assurance",
        "ai_ops",
        "construction",
        "leakage/uploads",
        "leakage/exports",
        "lead_to_order",
        "procureai",
    ):
        (DATA_ROOT / rel).mkdir(parents=True, exist_ok=True)


def _render_nginx_config(port: str) -> None:
    template = NGINX_TEMPLATE.read_text(encoding="utf-8")
    rendered = template.replace("__PORT__", port)
    NGINX_CONF_OUT.parent.mkdir(parents=True, exist_ok=True)
    NGINX_CONF_OUT.write_text(rendered, encoding="utf-8")
    if NGINX_SITES_DEFAULT.exists():
        NGINX_SITES_DEFAULT.unlink()


def _base_env() -> dict[str, str]:
    env = os.environ.copy()
    gemini_key = env.get("GEMINI_API_KEY") or env.get("GOOGLE_API_KEY") or ""
    if gemini_key:
        env.setdefault("GEMINI_API_KEY", gemini_key)
        env.setdefault("GOOGLE_API_KEY", gemini_key)
        env.setdefault("AOD_GEMINI_API_KEY", gemini_key)
    return env


def _seed_leakage_finder(base_env: dict[str, str], leakage_env: dict[str, str]) -> None:
    seed_script = APP_ROOT / "Contract-Invoice-Leakage-Finder" / "backend" / "seed_data.py"
    python_bin = "/opt/venvs/leakage/bin/python"
    if not seed_script.exists():
        return
    env = {**base_env, **leakage_env}
    print("[supervisor] Seeding Contract-Invoice-Leakage-Finder database (idempotent)...", flush=True)
    result = subprocess.run(
        [python_bin, str(seed_script)],
        cwd=str(APP_ROOT / "Contract-Invoice-Leakage-Finder"),
        env=env,
        check=False,
    )
    if result.returncode != 0:
        print(f"[supervisor] Warning: seed_data.py exited with {result.returncode}", flush=True)


def _build_services(base_env: dict[str, str]) -> list[ServiceSpec]:
    leakage_env = {
        "ENVIRONMENT": base_env.get("LEAKAGE_ENVIRONMENT", "production"),
        "DATABASE_URL": f"sqlite:///{DATA_ROOT}/leakage/leakage_finder.db",
        "LOCAL_STORAGE_DIR": f"{DATA_ROOT}/leakage/uploads",
        "LOCAL_EXPORT_DIR": f"{DATA_ROOT}/leakage/exports",
        "SECRET_KEY": base_env.get("LEAKAGE_SECRET_KEY", base_env.get("SECRET_KEY", "leakage-cloudrun-secret-key-change-me-2026")),
    }
    _seed_leakage_finder(base_env, leakage_env)

    return [
        ServiceSpec(
            name="agent-assurence",
            port=8000,
            cmd=["/opt/venvs/agent-assurence/bin/python", "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"],
            cwd=APP_ROOT / "Agent_Assurence" / "backend",
            env={
                "PORT": "8000",
                "ENVIRONMENT": base_env.get("AGENT_ASSURENCE_ENVIRONMENT", "production"),
                "AUTH_DISABLED": base_env.get("AGENT_ASSURENCE_AUTH_DISABLED", "false"),
                "AGENT_ASSURANCE_DEV_ALLOW_PRIVATE_HOSTS": base_env.get("AGENT_ASSURANCE_DEV_ALLOW_PRIVATE_HOSTS", "true"),
                "AGENT_ASSURANCE_DB": f"{DATA_ROOT}/agent_assurance/agent_assurance.db",
            },
        ),
        ServiceSpec(
            name="ai-ops-api",
            port=8001,
            cmd=["/opt/venvs/ai-ops/bin/python", "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8001"],
            cwd=APP_ROOT / "AI-operations-Diagonostic" / "api",
            env={
                "AOD_ENVIRONMENT": base_env.get("AOD_ENVIRONMENT", "local"),
                "AOD_DATA_DIR": f"{DATA_ROOT}/ai_ops",
                "AOD_AUTH_MODE": base_env.get("AOD_AUTH_MODE", "demo"),
                "AOD_DEMO_TOKEN": base_env.get("AOD_DEMO_TOKEN", "local-demo-token-change-me"),
            },
        ),
        ServiceSpec(
            name="ai-ops-web",
            port=3001,
            cmd=["/usr/local/bin/node", "server.js"],
            cwd=APP_ROOT / "AI-operations-Diagonostic" / "web-standalone",
            env={
                "NODE_ENV": "production",
                "HOSTNAME": "127.0.0.1",
                "PORT": "3001",
            },
        ),
        ServiceSpec(
            name="construction-api",
            port=8002,
            cmd=["/opt/venvs/construction/bin/python", "-m", "uvicorn", "app.main:create_app", "--factory", "--host", "127.0.0.1", "--port", "8002"],
            cwd=APP_ROOT / "Construction-variation-tracker" / "backend",
            env={
                "APP_ENV": base_env.get("CONSTRUCTION_APP_ENV", "local"),
                "STORAGE_BACKEND": base_env.get("CONSTRUCTION_STORAGE_BACKEND", "sqlite"),
                "AUDIT_BACKEND": base_env.get("CONSTRUCTION_AUDIT_BACKEND", "sqlite"),
                "TASK_QUEUE_BACKEND": base_env.get("CONSTRUCTION_TASK_QUEUE_BACKEND", "inline_thread"),
                "SCANNER_BACKEND": base_env.get("CONSTRUCTION_SCANNER_BACKEND", "dev_noop"),
                "LOCAL_DATA_DIR": f"{DATA_ROOT}/construction",
                "SQLITE_DATABASE_PATH": f"{DATA_ROOT}/construction/cvea.db",
                "AUTH_DEV_HS256_SECRET": base_env.get("AUTH_DEV_HS256_SECRET", "cvea-cloudrun-secret-key-min-32-chars-2026"),
            },
        ),
        ServiceSpec(
            name="leakage-api",
            port=8003,
            cmd=["/opt/venvs/leakage/bin/python", "-m", "uvicorn", "backend.app.main:app", "--host", "127.0.0.1", "--port", "8003"],
            cwd=APP_ROOT / "Contract-Invoice-Leakage-Finder",
            env=leakage_env,
        ),
        ServiceSpec(
            name="lead-to-order-api",
            port=8004,
            cmd=["/opt/venvs/lead-to-order/bin/python", "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8004"],
            cwd=APP_ROOT / "Industry-Specific-Lead-to-Order-Agent" / "backend",
            env={
                "ENVIRONMENT": base_env.get("LEAD_TO_ORDER_ENVIRONMENT", "production"),
                "DATABASE_PATH": f"{DATA_ROOT}/lead_to_order/brilliant_brains.db",
                "JWT_SECRET": base_env.get("LEAD_TO_ORDER_JWT_SECRET", base_env.get("JWT_SECRET", "bb-cloudrun-jwt-secret-key-change-me-2026")),
                "ALLOW_DEMO_LOGIN": base_env.get("ALLOW_DEMO_LOGIN", "true"),
            },
        ),
        ServiceSpec(
            name="procureai-api",
            port=8005,
            cmd=["/opt/venvs/procureai/bin/python", "-m", "uvicorn", "app.main:app", "--app-dir", "services/api", "--host", "127.0.0.1", "--port", "8005"],
            cwd=APP_ROOT / "Procurement-Quote-Comparison-Agent",
            env={
                "PYTHONPATH": str(APP_ROOT / "Procurement-Quote-Comparison-Agent" / "services" / "api"),
                "APP_ENV": base_env.get("PROCUREAI_APP_ENV", "production"),
                "DATABASE_URL": f"sqlite:///{DATA_ROOT}/procureai/procureai.db",
                "FRONTEND_URL": "/Procurement-Quote-Comparison-Agent",
                "SESSION_COOKIE_SECURE": base_env.get("PROCUREAI_SESSION_COOKIE_SECURE", "false"),
                "SESSION_SECRET_KEY": base_env.get("PROCUREAI_SESSION_SECRET_KEY", "procureai-cloudrun-session-secret-key-2026"),
            },
        ),
        ServiceSpec(
            name="procureai-web",
            port=3002,
            cmd=["/usr/local/bin/node", "server.js"],
            cwd=APP_ROOT / "Procurement-Quote-Comparison-Agent" / "web-standalone",
            env={
                "NODE_ENV": "production",
                "HOSTNAME": "127.0.0.1",
                "PORT": "3002",
            },
        ),
    ]


def _start_service(spec: ServiceSpec, base_env: dict[str, str]) -> None:
    env = {**base_env, **spec.env}
    spec.proc = subprocess.Popen(spec.cmd, cwd=str(spec.cwd), env=env)
    print(f"[supervisor] Started {spec.name} on :{spec.port} (PID {spec.proc.pid})", flush=True)


def _port_open(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.25)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def _wait_for_services(services: list[ServiceSpec], timeout_seconds: int = 90) -> None:
    deadline = time.monotonic() + timeout_seconds
    pending = {s.name: s for s in services}
    while pending and time.monotonic() < deadline:
        for name in list(pending):
            svc = pending[name]
            if svc.proc and svc.proc.poll() is not None:
                raise RuntimeError(f"Service {name} exited prematurely with code {svc.proc.returncode}")
            if _port_open(svc.port):
                print(f"[supervisor] Ready: {name} (:{svc.port})", flush=True)
                del pending[name]
        if pending:
            time.sleep(0.4)
    if pending:
        missing = ", ".join(f"{s.name}:{s.port}" for s in pending.values())
        raise TimeoutError(f"Timed out waiting for services: {missing}")


def main() -> int:
    port = os.getenv("PORT", "8080")
    _ensure_dirs()
    _render_nginx_config(port)

    base_env = _base_env()
    services = _build_services(base_env)

    stopping = False
    nginx_proc: subprocess.Popen | None = None

    def _shutdown(signum: int, _frame: object) -> None:
        nonlocal stopping
        if stopping:
            return
        stopping = True
        print(f"[supervisor] Received signal {signum}, shutting down...", flush=True)
        if nginx_proc and nginx_proc.poll() is None:
            nginx_proc.terminate()
        for svc in services:
            if svc.proc and svc.proc.poll() is None:
                svc.proc.terminate()

    signal.signal(signal.SIGTERM, _shutdown)
    signal.signal(signal.SIGINT, _shutdown)

    for svc in services:
        _start_service(svc, base_env)

    _wait_for_services(services, timeout_seconds=90)

    print(f"[supervisor] Starting Nginx gateway on :{port}...", flush=True)
    nginx_proc = subprocess.Popen(["nginx", "-g", "daemon off;"])

    exit_code = 0
    try:
        while not stopping:
            if nginx_proc.poll() is not None:
                print(f"[supervisor] Nginx exited with code {nginx_proc.returncode}", flush=True)
                exit_code = nginx_proc.returncode or 1
                break
            for svc in services:
                if svc.proc and svc.proc.poll() is not None and not stopping:
                    code = svc.proc.returncode
                    svc.restarts += 1
                    if svc.restarts > 5:
                        print(f"[supervisor] {svc.name} crashed too many times (last code {code}); aborting.", flush=True)
                        exit_code = 1
                        stopping = True
                        break
                    print(f"[supervisor] {svc.name} exited ({code}); restarting (#{svc.restarts})...", flush=True)
                    time.sleep(1.0)
                    _start_service(svc, base_env)
            time.sleep(1.0)
    finally:
        stopping = True
        if nginx_proc and nginx_proc.poll() is None:
            nginx_proc.terminate()
            try:
                nginx_proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                nginx_proc.kill()
        for svc in services:
            if svc.proc and svc.proc.poll() is None:
                svc.proc.terminate()
                try:
                    svc.proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    svc.proc.kill()

    return exit_code


if __name__ == "__main__":
    sys.exit(main())
