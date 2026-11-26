"""Zero-dependency Python reverse proxy and portal server for All_Projects.

Serves gateway/index.html at `/` and routes `/<project-name>/...` to the
corresponding local backend/frontend port. Also inspects the Referer header
so root-relative assets/APIs (e.g. `/v1/...`, `/app.js`) still resolve to the
originating project.
"""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
import http.client
import os

PORT = int(os.getenv("GATEWAY_PORT", "8080"))
PORTAL_HTML = Path(__file__).with_name("index.html")

ROUTES: dict[str, tuple[str, int, bool]] = {
    # prefix: (host, port, strip_prefix)
    "Agent_Assurence": ("127.0.0.1", 8001, True),
    "AI-operations-Diagonostic": ("127.0.0.1", 3001, False),
    "Construction-variation-tracker": ("127.0.0.1", 5173, False),
    "Contract-Invoice-Leakage-Finder": ("127.0.0.1", 5174, False),
    "Industry-Specific-Lead-to-Order-Agent": ("127.0.0.1", 5175, False),
    "Procurement-Quote-Comparison-Agent": ("127.0.0.1", 3002, False),
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


def resolve_target(path: str, referer: str | None) -> tuple[str, int, str] | None:
    """Resolve (host, port, upstream_path) from request path or Referer."""
    parsed = urlsplit(path)
    clean_path = parsed.path
    query = f"?{parsed.query}" if parsed.query else ""

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
        if self.path in ("/", "/index.html"):
            body = PORTAL_HTML.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)
            return

        # Redirect /ProjectName -> /ProjectName/ for clean relative resolution
        for prefix in ROUTES:
            if self.path == f"/{prefix}":
                self.send_response(302)
                self.send_header("Location", f"/{prefix}/")
                self.end_headers()
                return

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
            conn = http.client.HTTPConnection(host, port, timeout=30)
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
    server = ThreadingHTTPServer(("0.0.0.0", PORT), GatewayHandler)
    print(f"All_Projects gateway listening on http://localhost:{PORT}")
    print("Routes:")
    for name, (h, p, _) in ROUTES.items():
        print(f"  http://localhost:{PORT}/{name}/ -> http://{h}:{p}")
    server.serve_forever()
