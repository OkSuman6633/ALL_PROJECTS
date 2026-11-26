from __future__ import annotations

import json
import logging
import re
import sys
import time
import traceback
import uuid
from contextvars import ContextVar
from datetime import datetime, timezone
from pathlib import Path
from types import TracebackType
from typing import Any
from starlette.types import ASGIApp, Message, Receive, Scope, Send


_CORRELATION_ID_PATTERN = re.compile(r"[A-Za-z0-9._:-]{1,128}\Z")
_request_id: ContextVar[str | None] = ContextVar("aod_request_id", default=None)
_LOG_FIELDS = (
    "event",
    "request_id",
    "assessment_id",
    "method",
    "route",
    "status_code",
    "duration_ms",
    "stage",
    "outcome",
    "provider",
    "error_code",
)
ExceptionInfo = tuple[type[BaseException], BaseException, TracebackType | None]


class JsonLogFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, timezone.utc)
            .isoformat(timespec="milliseconds")
            .replace("+00:00", "Z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "source": {
                "file": Path(record.pathname).name,
                "line": record.lineno,
                "function": record.funcName,
            },
        }
        for field in _LOG_FIELDS:
            value = getattr(record, field, None)
            if value is not None:
                entry[field] = value
        if record.exc_info:
            exception_type, _, tb = record.exc_info
            entry["exception_type"] = exception_type.__name__ if exception_type else "Exception"
            entry["stack_trace"] = [
                {
                    "file": Path(frame.filename).name,
                    "line": frame.lineno,
                    "function": frame.name,
                }
                for frame in traceback.extract_tb(tb)
            ]
        return json.dumps(entry, ensure_ascii=True, separators=(",", ":"), default=str)


def configure_logging() -> None:
    app_logger = logging.getLogger("aod")
    app_logger.setLevel(logging.INFO)
    if any(getattr(handler, "_aod_json_handler", False) for handler in app_logger.handlers):
        return

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonLogFormatter())
    handler._aod_json_handler = True
    app_logger.addHandler(handler)
    app_logger.propagate = False


def emit_event(
    level: int, event: str, *, exc_info: ExceptionInfo | None = None, **fields: Any
) -> None:
    safe_fields = {key: value for key, value in fields.items() if key in _LOG_FIELDS}
    safe_fields["event"] = event
    safe_fields.setdefault("request_id", _request_id.get())
    if "assessment_id" in safe_fields:
        safe_fields["assessment_id"] = _safe_assessment_id(safe_fields["assessment_id"])
    logging.getLogger("aod.workflow").log(
        level, event, extra=safe_fields, exc_info=exc_info
    )


def _correlation_id(value: str | None) -> str:
    if value and _CORRELATION_ID_PATTERN.fullmatch(value):
        return value
    return str(uuid.uuid4())


class RequestLoggingMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = {
            key.lower(): value
            for key, value in scope.get("headers", [])
        }
        incoming_id = headers.get(b"x-correlation-id", b"").decode("latin-1")
        request_id = _correlation_id(incoming_id)
        scope.setdefault("state", {})["correlation_id"] = request_id
        request_token = _request_id.set(request_id)
        started = time.perf_counter()
        status_code = None

        async def send_with_status(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
                headers = list(message.get("headers", []))
                if not any(name.lower() == b"x-correlation-id" for name, _ in headers):
                    headers.append((b"x-correlation-id", request_id.encode("ascii")))
                message["headers"] = headers
            await send(message)

        try:
            await self.app(scope, receive, send_with_status)
        except Exception:
            logging.getLogger("aod.http").exception(
                "http_request_failed",
                extra={
                    "event": "http_request_failed",
                    "request_id": request_id,
                    "method": scope.get("method"),
                    "route": _route_template(scope),
                    "assessment_id": _assessment_id(scope),
                },
            )
            raise
        finally:
            logging.getLogger("aod.http").info(
                "http_request_completed",
                extra={
                    "event": "http_request_completed",
                    "request_id": request_id,
                    "method": scope.get("method"),
                    "route": _route_template(scope),
                    "assessment_id": _assessment_id(scope),
                    "status_code": status_code or 500,
                    "duration_ms": round((time.perf_counter() - started) * 1000, 3),
                },
            )
            _request_id.reset(request_token)


def _route_template(scope: Scope) -> str:
    route = scope.get("route")
    return getattr(route, "path", "<unmatched>")


def _assessment_id(scope: Scope) -> str | None:
    return _safe_assessment_id(scope.get("path_params", {}).get("assessment_id"))


def _safe_assessment_id(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    try:
        return str(uuid.UUID(value))
    except ValueError:
        return None
