# Backend Logging Implementation Plan

> Implement the steps below in order, keeping the changes test-first.

**Goal:** Make backend failures and slow operations easy to trace through structured, privacy-safe JSON logs.

**Architecture:** Add a standard-library logging module for JSON formatting, correlation context, and ASGI request logging. Integrate it with FastAPI and add targeted workflow/provider outcome records, keeping existing API responses and console deployment intact.

**Tech Stack:** Python 3.12, FastAPI/Starlette ASGI middleware, `logging`, pytest, FastAPI TestClient.

---

### Task 1: Add structured logging primitives

**Files:**
- Create: `api/app/observability.py`
- Test: `api/tests/test_logging.py`

**Steps:**
1. Write tests for a single-line JSON log record containing UTC timestamp, severity, logger, event, and safe extra fields.
2. Run `cd api; .\.venv\Scripts\python.exe -m pytest tests\test_logging.py -q` and confirm the tests fail because the module is missing.
3. Implement a small JSON formatter, request-context fields, and validation/generation for correlation IDs using only the standard library.
4. Rerun the targeted tests and confirm they pass; add cases for invalid/oversized incoming IDs and JSON escaping.

### Task 2: Log HTTP request outcomes

**Files:**
- Modify: `api/app/observability.py`
- Modify: `api/app/main.py`
- Test: `api/tests/test_logging.py`

**Steps:**
1. Add failing TestClient tests for generated and supplied correlation IDs, route templates, status codes, elapsed time, and exception logging.
2. Run the targeted test and verify it fails for missing request-log behavior.
3. Implement ASGI middleware that logs one completion record per request, captures unexpected exceptions without swallowing them, and does not record query strings or request/response bodies.
4. Configure the application logger for console JSON output and reuse the middleware correlation ID in the existing HTTP error envelope.
5. Run the targeted tests, including a 500-path test with `raise_server_exceptions=False`, and verify API error response behavior remains unchanged.

### Task 3: Add high-value workflow and provider diagnostics

**Files:**
- Modify: `api/app/main.py`
- Modify: `api/app/services/providers.py`
- Test: `api/tests/test_logging.py`

**Steps:**
1. Write failing log-capture tests for assessment workflow context and provider failures returned as structured error results.
2. Run the targeted tests and verify the missing events cause the failures.
3. Add concise stage/outcome/duration events for analysis, uploads/extraction, persistence, submit/approve, and report generation; include `assessment_id` only where available.
4. Log provider fallback/error codes without logging prompts, extracted content, credentials, or raw exception secrets.
5. Rerun the targeted tests and assert that tokens, submitted bodies, file contents, and query strings do not appear in captured logs.

### Task 4: Verify regression and document operation

**Files:**
- Modify: `docs/backend-logging-design.md`

**Steps:**
1. Run `cd api; .\.venv\Scripts\python.exe -m pytest -q`.
2. If failures occur, inspect whether they are caused by logging configuration or pre-existing behavior before changing code.
3. Confirm the Docker API process still writes logs to its existing stdout/stderr console destination and document the emitted fields and privacy exclusions.
