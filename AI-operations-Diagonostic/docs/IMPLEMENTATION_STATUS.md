# Implementation status and verification report

## Implemented in this package

- FastAPI service with OpenAPI 3.1, health/readiness and local demo bearer-token check.
- Assessment create/list/detail endpoints.
- PDF and CSV file upload with SHA-256 digest, size/type/page/row bounds and extracted text/table metadata.
- Optional Gemini-assisted candidate extraction; safe manual-review fallback when no key is configured.
- Human-editable/confirmable activity facts and optimistic revision checking (local adapter only).
- Deterministic annual effort/cost calculation, confirmed-input filtering and conservative/base/optimistic capacity scenarios.
- Human approval gate and PDF report with assumptions, activity evidence register and no-realised-savings disclaimer.
- Next.js/TypeScript dashboard for creating, selecting, reviewing, analyzing and approving assessments and downloading PDF reports.
- Docker Compose, Windows PowerShell setup helper, synthetic fixture, backend tests, and initial GCP Terraform baseline.

## Checks run in this build environment

- `python -m pytest -q` from `api/`: **10 passed**.
- The first test run exposed an empty-total Decimal edge case; it was corrected and the suite rerun successfully.
- Frontend `npm install` did not finish before the environment timeout, so `npm run build` and `npm run lint` could not be verified here. Run both locally after installing dependencies.
- No Google Cloud resources were provisioned. Terraform was not applied. Cloud service integration is not yet implemented.

## Not implemented / not production-ready

- Real user registration, SSO/OIDC/JWT, RBAC, secure tenant isolation and consent-version audit.
- GCS state adapter with generation CAS, signed uploads/downloads, lifecycle/erasure processing.
- Cloud Tasks worker, task-level idempotency persisted across replicas, BigQuery event/usage/extraction-quality writers.
- Cloud Run services, service accounts/IAM bindings, Secret Manager wiring, budget alerts, dashboards, GitHub OIDC, SBOM/scans and release promotion.
- Antivirus/malware scanning, comprehensive document sanitization, content-disarm, formula-injection defense for exported CSV, and robust PDF decompression-bomb defenses.
- Full 40-document labelled evaluation, Playwright E2E, accessibility audit, concurrency/load testing and rollback rehearsal.
- Subscription billing, customer research evidence, commercial validation, and live ERP connectors.

## Correct interpretation

This ZIP is an integrated **local MVP starting point**, not a completed secure SaaS deployment. The local app can exercise the principal create → review → calculate → approve → PDF flow. External customer data and production deployment remain blocked until the security, cloud persistence, identity and release gates in the root README are satisfied.
