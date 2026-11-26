# Backend logging design

## Understanding

- Improve diagnostics for the Python FastAPI backend so maintainers can locate and fix failures.
- Capture HTTP outcomes, unexpected exceptions, and important processing stages.
- Write structured JSON logs to stdout for Docker log collection.
- Correlate requests and multi-request operations with a request ID and, when available, an assessment UUID.
- Keep operational logging separate from a durable audit trail.
- Do not log credentials, request/response bodies, query strings, evidence contents, provider secrets, or identifiers other than valid assessment UUIDs.

## Assumptions

- The existing deployment scale and single-process local JSON-store model remain unchanged.
- Log persistence, collection, and retention are managed by the deployment environment.
- Logging should add minimal overhead and must not break request handling.
- Python's standard `logging` package is sufficient; no external logging service or SDK is needed.
- Exception details are operationally useful, but must not contain credentials or submitted evidence.

## Decision log

1. **Use standard-library logging and JSON console output.** A third-party structured-logging framework offers more features than needed; Uvicorn access logs alone lack consistent application context.
2. **Add request-level and targeted workflow logs.** HTTP-only logs do not reveal which processing stage failed; targeted events provide troubleshooting context without logging every internal step.
3. **Include request correlation IDs and assessment UUIDs where available.** This connects log records for one request and related assessment operations.
4. **Keep sensitive input out of logs.** Do not log request/response bodies, query strings, tokens, evidence contents, or provider secrets.
5. **Preserve API behavior and console-based deployment.** Logging should not alter existing error responses or require local log files.
6. **Return the correlation ID in a response header.** This lets API clients report the exact log context without changing response bodies; CORS allows and exposes the header.

## Proposed design

Configure application logging to emit one-line JSON records with a UTC timestamp, severity, logger, event name, and safe contextual fields. Request middleware should log method, route template, response status, elapsed time, and a validated incoming or generated correlation ID, without recording query strings.

Add targeted stage events around assessment analysis, uploads, extraction/provider calls, state persistence, submission/approval, and report generation. Include the assessment UUID, stage, outcome, and duration when available. Unexpected failures should include exception diagnostics; expected client errors should be represented by their HTTP status and existing error code without a stack trace. Reuse the request correlation ID in the existing error envelope.

Keep logs on the container console. Logging errors or client disconnects must not mask application errors or change endpoint behavior. Do not log credentials, bodies, evidence contents, provider secrets, or query strings.

## Implemented behavior

- Application records are one-line JSON on stdout with a UTC timestamp, severity, logger, event, source file/function/line, and allowlisted context.
- Request records include a validated/generated `X-Correlation-ID`, HTTP method, route template, status, duration, and a valid assessment UUID when present. Arbitrary path values are omitted. The ID is also returned in the response header and reused in the existing error envelope; CORS allows and exposes the header.
- HTTP errors include their stable error code. Unexpected exceptions include the exception type and source stack frames, but not exception text or local variables.
- Workflow events identify extraction/provider fallback, evidence processing, state persistence, submission, approval, and report generation outcomes and durations where relevant.
- Fields are allowlisted before JSON serialization; request bodies, query strings, filenames, evidence contents, and credentials are not included.

## Verification plan

- Test JSON request records, route-template and duration fields, correlation ID generation/reuse, and status capture.
- Test workflow context and unexpected exception diagnostics.
- Assert credentials and submitted content do not appear in captured logs.
- Run the existing API test suite to verify API responses and workflows remain unchanged.
