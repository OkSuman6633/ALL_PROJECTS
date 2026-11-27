"""Zero-dependency Python reverse proxy, auto-launcher, and portal server for All_Projects.

Starts all 6 projects (backends + frontends) automatically when launched on the
main port (8080), serves gateway/index.html at `/`, and routes `/<project-name>/...`
(plus `/<project-name>/api/...`) to the corresponding local port. Pass `--no-autostart`
(or set GATEWAY_AUTOSTART=0) to run the proxy alone.
"""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
import atexit
import http.client
import json
import os
import shutil
import socket
import subprocess
import sys

ROOT_DIR = Path(__file__).resolve().parent.parent
PORT = int(os.getenv("GATEWAY_PORT", "8080"))
PORTAL_HTML = Path(__file__).with_name("index.html")
LOG_DIR = Path(__file__).with_name("logs")

AGENT_ASSURENCE_PORT = int(os.getenv("AGENT_ASSURENCE_PORT", "8000"))
AI_OPS_API_PORT = int(os.getenv("AI_OPS_API_PORT", "8001"))
AI_OPS_PORT = int(os.getenv("AI_OPS_PORT", "3001"))
CONSTRUCTION_API_PORT = int(os.getenv("CONSTRUCTION_API_PORT", "8002"))
CONSTRUCTION_PORT = int(os.getenv("CONSTRUCTION_PORT", "5173"))
LEAKAGE_API_PORT = int(os.getenv("LEAKAGE_API_PORT", "8003"))
LEAKAGE_PORT = int(os.getenv("LEAKAGE_PORT", "5174"))
LEAD_TO_ORDER_API_PORT = int(os.getenv("LEAD_TO_ORDER_API_PORT", "8004"))
LEAD_TO_ORDER_PORT = int(os.getenv("LEAD_TO_ORDER_PORT", "5175"))
PROCUREAI_API_PORT = int(os.getenv("PROCUREAI_API_PORT", "8005"))
PROCUREAI_PORT = int(os.getenv("PROCUREAI_PORT", "3002"))

ROUTES: dict[str, tuple[str, int, bool]] = {
    # prefix: (host, port, strip_prefix)
    "Agent_Assurence": ("127.0.0.1", AGENT_ASSURENCE_PORT, True),
    "AI-operations-Diagonostic": ("127.0.0.1", AI_OPS_PORT, False),
    "Construction-variation-tracker": ("127.0.0.1", CONSTRUCTION_PORT, False),
    "Contract-Invoice-Leakage-Finder": ("127.0.0.1", LEAKAGE_PORT, False),
    "Industry-Specific-Lead-to-Order-Agent": ("127.0.0.1", LEAD_TO_ORDER_PORT, False),
    "Procurement-Quote-Comparison-Agent": ("127.0.0.1", PROCUREAI_PORT, False),
}

API_ROUTES: dict[str, int] = {
    "AI-operations-Diagonostic": AI_OPS_API_PORT,
    "Construction-variation-tracker": CONSTRUCTION_API_PORT,
    "Contract-Invoice-Leakage-Finder": LEAKAGE_API_PORT,
    "Industry-Specific-Lead-to-Order-Agent": LEAD_TO_ORDER_API_PORT,
    "Procurement-Quote-Comparison-Agent": PROCUREAI_API_PORT,
}

API_ROUTES: dict[str, tuple[str, int]] = {
    "AI-operations-Diagonostic": ("127.0.0.1", AI_OPS_API_PORT),
    "Construction-variation-tracker": ("127.0.0.1", CONSTRUCTION_API_PORT),
    "Contract-Invoice-Leakage-Finder": ("127.0.0.1", LEAKAGE_API_PORT),
    "Industry-Specific-Lead-to-Order-Agent": ("127.0.0.1", LEAD_TO_ORDER_API_PORT),
    "Procurement-Quote-Comparison-Agent": ("127.0.0.1", PROCUREAI_API_PORT),
}

HOP_BY_HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
}

_CHILDREN: list[tuple[str, subprocess.Popen]] = []


def _python_for(project_dir: Path) -> str:
    """Return project venv python if present, otherwise current sys.executable."""
    for rel in (
        ".venv/Scripts/python.exe",
        "api/.venv/Scripts/python.exe",
        "backend/.venv/Scripts/python.exe",
        ".venv/bin/python",
        "api/.venv/bin/python",
        "backend/.venv/bin/python",
    ):
        candidate = project_dir / rel
        if candidate.exists():
            return str(candidate)
    return sys.executable


def _npm_cmd() -> str:
    return shutil.which("npm.cmd") or shutil.which("npm") or "npm"


def _port_open(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.3)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def _spawn(name: str, port: int, cmd: list[str], cwd: Path, extra_env: dict[str, str] | None = None) -> None:
    if _port_open(port):
        print(f"  [=] {name} already listening on :{port}")
        return
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    log_file = open(LOG_DIR / f"{name}.log", "w", encoding="utf-8")
    env = os.environ.copy()
    if extra_env:
        env.update(extra_env)
    try:
        proc = subprocess.Popen(
            cmd,
            cwd=str(cwd),
            env=env,
            stdout=log_file,
            stderr=subprocess.STDOUT,
        )
        _CHILDREN.append((name, proc))
        print(f"  [+] Started {name} (:{port}, PID {proc.pid}) -> gateway/logs/{name}.log")
    except OSError as exc:
        log_file.close()
        print(f"  [!] Failed to start {name} (:{port}): {exc}")


def stop_all_services() -> None:
    for name, proc in _CHILDREN:
        if proc.poll() is None:
            if os.name == "nt":
                subprocess.run(
                    ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            else:
                proc.terminate()
                try:
                    proc.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    proc.kill()
            print(f"  [-] Stopped {name}")
    _CHILDREN.clear()


def start_all_services() -> None:
    npm = _npm_cmd()
    print("Starting all project services...")

    # 1. Agent_Assurence
    p1 = ROOT_DIR / "Agent_Assurence"
    _spawn(
        "agent-assurence",
        AGENT_ASSURENCE_PORT,
        [_python_for(p1), "run.py"],
        p1,
        {
            "PORT": str(AGENT_ASSURENCE_PORT),
            "AUTH_DISABLED": os.getenv("AGENT_ASSURENCE_AUTH_DISABLED", "false"),
        },
    )

    # 2. AI-operations-Diagonostic
    p2 = ROOT_DIR / "AI-operations-Diagonostic"
    _spawn(
        "ai-ops-api",
        AI_OPS_API_PORT,
        [_python_for(p2), "-m", "uvicorn", "app.main:app", "--port", str(AI_OPS_API_PORT)],
        p2 / "api",
    )
    _spawn(
        "ai-ops-web",
        AI_OPS_PORT,
        [npm, "run", "dev", "--", "-p", str(AI_OPS_PORT)],
        p2 / "web",
        {
            "NEXT_PUBLIC_BASE_PATH": "/AI-operations-Diagonostic",
            "NEXT_PUBLIC_API_URL": "/AI-operations-Diagonostic/api",
        },
    )

    # 3. Construction-variation-tracker
    p3 = ROOT_DIR / "Construction-variation-tracker"
    _spawn(
        "construction-api",
        CONSTRUCTION_API_PORT,
        [_python_for(p3), "-m", "uvicorn", "app.main:create_app", "--factory", "--reload", "--port", str(CONSTRUCTION_API_PORT)],
        p3 / "backend",
        {
            "APP_ENV": os.getenv("APP_ENV", "local"),
            "AUTH_DEV_HS256_SECRET": os.getenv("AUTH_DEV_HS256_SECRET", "cvea-local-dev-secret-key-min-32-chars"),
        },
    )
    _spawn(
        "construction-web",
        CONSTRUCTION_PORT,
        [npm, "run", "dev", "--", "--host", "0.0.0.0", "--port", str(CONSTRUCTION_PORT), "--strictPort"],
        p3 / "frontend",
        {
            "VITE_BASE_PATH": "/Construction-variation-tracker/",
            "VITE_API_BASE_URL": "/Construction-variation-tracker/api",
            "VITE_API_URL": f"http://127.0.0.1:{CONSTRUCTION_API_PORT}",
        },
    )

    # 4. Contract-Invoice-Leakage-Finder
    p4 = ROOT_DIR / "Contract-Invoice-Leakage-Finder"
    if not (p4 / "leakage_finder.db").exists():
        subprocess.run([_python_for(p4), "backend/seed_data.py"], cwd=str(p4), check=False)
    _spawn(
        "leakage-api",
        LEAKAGE_API_PORT,
        [_python_for(p4), "-m", "uvicorn", "backend.app.main:app", "--host", "127.0.0.1", "--port", str(LEAKAGE_API_PORT)],
        p4,
    )
    _spawn(
        "leakage-web",
        LEAKAGE_PORT,
        [npm, "run", "dev", "--", "--host", "0.0.0.0", "--port", str(LEAKAGE_PORT), "--strictPort"],
        p4 / "frontend",
        {
            "VITE_BASE_PATH": "/Contract-Invoice-Leakage-Finder/",
            "VITE_API_URL": "/Contract-Invoice-Leakage-Finder/api",
        },
    )

    # 5. Industry-Specific-Lead-to-Order-Agent
    p5 = ROOT_DIR / "Industry-Specific-Lead-to-Order-Agent"
    _spawn(
        "lead-to-order-api",
        LEAD_TO_ORDER_API_PORT,
        [_python_for(p5), "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", str(LEAD_TO_ORDER_API_PORT)],
        p5 / "backend",
    )
    _spawn(
        "lead-to-order-web",
        LEAD_TO_ORDER_PORT,
        [npm, "run", "dev", "--", "--port", str(LEAD_TO_ORDER_PORT), "--strictPort"],
        p5 / "frontend",
        {
            "VITE_BASE_PATH": "/Industry-Specific-Lead-to-Order-Agent/",
            "VITE_API_URL": "/Industry-Specific-Lead-to-Order-Agent/api/v1",
        },
    )

    # 6. Procurement-Quote-Comparison-Agent
    p6 = ROOT_DIR / "Procurement-Quote-Comparison-Agent"
    _spawn(
        "procureai-api",
        PROCUREAI_API_PORT,
        [_python_for(p6), "-m", "uvicorn", "app.main:app", "--app-dir", "services/api", "--host", "0.0.0.0", "--port", str(PROCUREAI_API_PORT)],
        p6,
        {
            "PYTHONPATH": "services/api",
            "FRONTEND_URL": "/Procurement-Quote-Comparison-Agent",
        },
    )
    _spawn(
        "procureai-web",
        PROCUREAI_PORT,
        [npm, "run", "dev", "--", "-p", str(PROCUREAI_PORT)],
        p6 / "apps" / "web",
        {
            "NEXT_PUBLIC_BASE_PATH": "/Procurement-Quote-Comparison-Agent",
            "NEXT_PUBLIC_API_URL": "/Procurement-Quote-Comparison-Agent/api",
        },
    )


def resolve_target(path: str, referer: str | None) -> tuple[str, int, str] | None:
    """Resolve (host, port, upstream_path) from request path or Referer."""
    parsed = urlsplit(path)
    clean_path = parsed.path
    query = f"?{parsed.query}" if parsed.query else ""

    for prefix, (host, port) in API_ROUTES.items():
        api_base = f"/{prefix}/api"
        if clean_path == api_base or clean_path.startswith(api_base + "/"):
            rest = clean_path[len(api_base):] or "/"
            return host, port, rest + query

    for prefix, (host, port, strip_prefix) in ROUTES.items():
        base = f"/{prefix}"
        if clean_path == base or clean_path.startswith(base + "/"):
            if strip_prefix:
                rest = clean_path[len(base):] or "/"
                return host, port, rest + query
            return host, port, clean_path + query

    if referer:
        ref_path = urlsplit(referer).path
        for prefix, (host, port, _strip) in ROUTES.items():
            base = f"/{prefix}"
            if ref_path == base or ref_path.startswith(base + "/"):
                return host, port, clean_path + query

    return None


class GatewayHandler(BaseHTTPRequestHandler):
    """HTTP handler that serves the portal or proxies to a project."""

    def _handle_all(self) -> None:
        if self.path in ("/health", "/healthz"):
            body = json.dumps({"status": "ok", "service": "all-projects-gateway", "projects": len(ROUTES)}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)
            return

        if self.path in ("/", "/index.html"):
            body = PORTAL_HTML.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)
            return

        # Redirect /ProjectName -> /ProjectName/ for Vite/static apps (Next.js expects no trailing slash)
        nextjs_prefixes = {"AI-operations-Diagonostic", "Procurement-Quote-Comparison-Agent"}
        for prefix in ROUTES:
            if self.path == f"/{prefix}" and prefix not in nextjs_prefixes:
                self.send_response(302)
                self.send_header("Location", f"/{prefix}/")
                self.end_headers()
                return
            if self.path == f"/{prefix}/" and prefix in nextjs_prefixes:
                self.path = f"/{prefix}"
                break

        target = resolve_target(self.path, self.headers.get("Referer"))
        if not target:
            msg = b"Project route not found. Open / to see available projects."
            self.send_response(404)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(msg)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(msg)
            return

        host, port, upstream_path = target
        length = int(self.headers.get("Content-Length", "0") or "0")
        req_body = self.rfile.read(length) if length > 0 else None

        fwd_headers = {
            k: v
            for k, v in self.headers.items()
            if k.lower() not in HOP_BY_HOP and k.lower() != "host"
        }
        fwd_headers["Host"] = f"{host}:{port}"

        try:
            conn = http.client.HTTPConnection(host, port, timeout=120)
            conn.request(self.command, upstream_path, body=req_body, headers=fwd_headers)
            resp = conn.getresponse()
            resp_body = resp.read()
        except OSError as exc:
            err = f"Upstream {host}:{port} unavailable: {exc}".encode("utf-8")
            self.send_response(502)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(err)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(err)
            return

        self.send_response(resp.status, resp.reason)
        for k, v in resp.getheaders():
            if k.lower() not in HOP_BY_HOP:
                self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(resp_body)
        conn.close()

    def do_GET(self) -> None:  # noqa: N802
        self._handle_all()

    def do_POST(self) -> None:  # noqa: N802
        self._handle_all()

    def do_PUT(self) -> None:  # noqa: N802
        self._handle_all()

    def do_PATCH(self) -> None:  # noqa: N802
        self._handle_all()

    def do_DELETE(self) -> None:  # noqa: N802
        self._handle_all()

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._handle_all()


if __name__ == "__main__":
    autostart = "--no-autostart" not in sys.argv and os.getenv("GATEWAY_AUTOSTART", "1") != "0"
    try:
        server = ThreadingHTTPServer(("0.0.0.0", PORT), GatewayHandler)
    except OSError as exc:
        print(f"ERROR: Could not bind gateway on port {PORT}: {exc}")
        print("Stop the old process using port 8080 first, then run python gateway/server.py again.")
        sys.exit(1)

    if autostart:
        atexit.register(stop_all_services)
        start_all_services()

    print(f"\nAll_Projects gateway listening on http://localhost:{PORT}")
    print("Routes:")
    for name, (h, p, _) in ROUTES.items():
        print(f"  http://localhost:{PORT}/{name}/ -> http://{h}:{p}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down gateway and child services...")
    finally:
        server.server_close()
        if autostart:
            stop_all_services()
