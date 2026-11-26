# Security checklist

## Local demo controls

- Shared bearer token is intended for localhost only and is visible to browser JavaScript.
- CORS permits only localhost web origins by default.
- Upload size capped at 10 MB; allowed extensions are PDF/CSV; PDFs capped at 100 pages; CSV processing capped at 1,001 data rows.
- Uploaded files are stored locally and marked `not_scanned_local_only`.
- No secrets are committed; optional Gemini key belongs in ignored `.env`.

## Required before a pilot

- Replace shared token with a maintained identity provider and server-validated JWTs.
- Derive tenant and role from trusted identity claims, never user-supplied IDs. Add cross-tenant negative tests for every route and object operation.
- Use private GCS buckets, short-lived signed URLs, generation preconditions, least-privilege service accounts and audit logs.
- Add malware scanning, MIME sniffing, decompression and resource limits, PDF active-content policy, CSV formula neutralization where exporting, and isolated parser execution.
- Complete data classification, retention, deletion and customer consent/legal review. Avoid sending unnecessary PII to an LLM; review provider data-use and residency terms.
- Add rate limits, quotas, request-size limits, model spend guardrails, redaction, alerting and incident runbooks.
- Store no secrets in images, Git history, logs or Terraform state. Use Secret Manager and workload identity federation.
- Perform an independent threat-model and security review before any external customer data is accepted.
