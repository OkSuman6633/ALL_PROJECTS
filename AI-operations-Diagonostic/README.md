# AI Operations Diagnostic

Evidence-driven B2B workflow diagnostic MVP based on the supplied product, DevOps, business-model and BA/UAT specifications (20 October 2026).

> **Status:** local MVP implementation scaffold with a working FastAPI assessment workflow, deterministic calculations, human confirmation, PDF export, a Next.js dashboard, tests and an initial Terraform baseline. It is **not production-ready** and has not been deployed to Google Cloud. The local demo authentication token is public by design and must never be used for real customer data.

## Quick start (Windows)

### Option A — local development

Prerequisites: Python 3.12+, Node.js 20+, npm. From PowerShell:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\start-local.ps1
```

Open two PowerShell terminals after setup:

**Terminal 1 — API**

```powershell
cd api
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**Terminal 2 — web**

```powershell
cd web
npm run dev
```

Open `http://localhost:3000`. API docs: `http://localhost:8000/docs`; health: `http://localhost:8000/healthz`.

Local demo bearer token: `local-demo-token-change-me`. The UI sends this token from browser code. This is only for local synthetic-data testing; it is not secure authentication.

### Option B — Docker Compose

Install Docker Desktop and run from the repository root:

```powershell
Copy-Item api/.env.example .env
# Optional: edit .env and add AOD_GEMINI_API_KEY for model-assisted extraction.
docker compose up --build
```

Open `http://localhost:3000`. Stop with `Ctrl+C`, then `docker compose down`. Persistent local JSON/source data is stored in the named `aod_data` volume. Do not use production data.

## Test the backend

```powershell
cd api
python -m pip install -r requirements.txt
python -m pytest -q
```

The suite covers calculations, confirmed-only totals, input validation, authentication, assessment review/approval, extraction, evidence provenance, PDF generation, CORS preflight for the analyse step and the guided enquiry flow (`tests/test_enquiry_workflow.py`). Tests that need uploaded evidence build their own SOP PDF and CSV in memory via `tests/_documents.py`, so the suite passes on a clean checkout and in CI where the gitignored `api/data/` directory does not exist.

Frontend checks, from `web/`:

```powershell
node --test tests/
npm run lint
npm run build
```

## The simple 4-step workflow

Open `http://localhost:3000`; the app redirects `/` to the guided enquiry flow at `/start`.

1. **Create an enquiry** — give the process a name and write the business question you want answered (for example, "How can we reduce the cost of processing supplier invoices?"). Choose sector, period, unit and currency.
2. **Add supporting evidence** — drop in the SOP PDF and the CSV of activity data. File extraction is best-effort; model output is untrusted and never treated as confirmed financial facts.
3. **Send to analyse** — the AI reads the documents with your question as context and proposes activities; the deterministic engine then calculates annual hours, effort cost and scenarios. You can add, edit or remove activity rows and change volumes, handling times and hourly rates before the report is produced.
4. **Generate the report** — a detailed PDF is produced for that enquiry. It opens with your question, shows effort and cost KPIs, capacity-release scenarios, a cost-reduction priorities section and evidence-linked recommendations, and states its assumptions.

The enquiry, its files and the generated report are listed at `/enquiries`. The question reaches the extraction model as untrusted context, never as instructions, and it is recorded in the report's accepted assumptions.

### Under the hood (the same steps in API terms)

The wizard drives the existing auditable workflow; the long form is still available under `/assessments`.

1. `POST /v1/assessments` with the process name and `goals` (the enquiry question).
2. `POST /v1/assessments/{id}/analyze` with the PDF/CSV files.
3. Confirm the activity facts with `PATCH /v1/assessments/{id}/facts` — only confirmed activities enter the authoritative totals.
4. `POST /v1/assessments/{id}/submit`, `POST /v1/assessments/{id}/approve`, then `GET /v1/assessments/{id}/report` for the PDF.

## API routes

All `/v1/*` routes except health/readiness require `Authorization: Bearer <AOD_DEMO_TOKEN>` in local mode.

| Method | Route | Purpose |
|---|---|---|
| GET | `/healthz` | Liveness check |
| GET | `/readyz` | Local state-store readiness |
| GET | `/v1/providers` | Provider configuration status |
| GET | `/v1/templates` | Available process templates |
| POST | `/v1/assessments` | Create an assessment |
| GET | `/v1/assessments` | List local tenant assessments |
| GET | `/v1/assessments/{id}` | Read assessment state |
| POST | `/v1/assessments/{id}/uploads` | Upload PDF/CSV evidence |
| POST | `/v1/assessments/{id}/analyze` | Upload PDF/CSV evidence, extract and merge candidate activities |
| POST | `/v1/assessments/{id}/reextract` | Re-run extraction across all uploaded sources |
| PATCH | `/v1/assessments/{id}/facts` | Update reviewer facts with expected revision |
| POST | `/v1/assessments/{id}/submit` | Run deterministic analysis |
| POST | `/v1/assessments/{id}/approve` | Approve the report after confirmation |
| GET | `/v1/assessments/{id}/report` | Download approved PDF |

OpenAPI is available dynamically at `/openapi.json` (OpenAPI 3.1). Request/response examples are in `docs/API.md`.

## Calculation rules

Annual handling effort = monthly volume × minutes per unit × 12 ÷ 60. Annual effort cost = annual handling hours × fully loaded hourly rate. Scenario capacity value is calculated using 10%, 20% and 35% illustrative reductions. These are assumptions, not forecasts. Capacity released is not automatically cashable labour savings. Only explicitly confirmed activities are included in aggregate totals.

## Architecture and persistence

The app follows a bounded workflow: evidence parsing → candidate extraction → human confirmation → deterministic calculation → report validation/approval → PDF. LLM output is treated as untrusted input. A non-active, example-only pricing catalogue is included under `config/`; it is not connected to billing or entitlements. BA interview and UAT starter templates are in `templates/`. The local adapter stores state as JSON with atomic replacement and a process-local lock. That is suitable only for local development and **does not provide distributed compare-and-swap guarantees**.

The supplied spec names GCS as authoritative state/source/report storage, BigQuery as append-only analytics, and Cloud Tasks for at-least-once background jobs. Terraform under `infra/environments/dev` is an initial resource baseline for private versioned buckets, BigQuery and a bounded queue. The API does not yet use those cloud services; Cloud Run deployment, service identities and IAM, GCS generation preconditions, task dispatch/worker, BigQuery event writers, Secret Manager, signed URLs, budgets/alerts, malware scanning, and GitHub OIDC still need implementation and verification. The local JSON store must not be deployed as a multi-instance backend.

## Security and privacy limitations

- Demo auth is a single shared token; no registration, password management, OIDC/JWT identity provider, roles or real tenant isolation is implemented.
- Uploads are size/extension/page-count limited but malware scanning and full content sanitization are not implemented. `scan_status` explicitly says `not_scanned_local_only`.
- Files are stored on the local filesystem. Do not upload personal, confidential, regulated, or customer data.
- CORS is restricted to localhost development origins.
- No production data retention/erasure workflow, signed download URL, rate limiter, billing integration, or production usage ledger exists.
- Gemini integration is optional. Set `AOD_GEMINI_API_KEY` in a private local `.env`; never commit it. Model results are untrusted and require human review. No key means manual-review fallback.
- The frontend demo token is a public browser variable and is not a security boundary.

## Google Cloud baseline

See `infra/environments/dev/README.md`. Use a dedicated non-production project, inspect `terraform plan`, and do not apply to production. Terraform state backend is not configured. Do not put service-account JSON keys in the repository.

## Repository layout

```text
api/                  FastAPI application, domain, services, tests
web/                  Next.js dashboard
fixtures/              Synthetic example input
infra/environments/dev Initial GCP Terraform baseline
docs/                  API, architecture, security, release checklist and original specs
Dockerfile.api         API image
Dockerfile.web         Web image
docker-compose.yml     Local container setup
start-local.ps1        Windows setup helper
```

## Release gates before any external pilot

1. Replace demo auth with a real identity provider; enforce tenant membership on every route and storage operation.
2. Implement GCS-backed state with generation preconditions and retry bounds; test concurrent updates across instances.
3. Implement authenticated Cloud Tasks worker with idempotency and terminal-state transitions.
4. Add malware scanning, signed upload/download URLs, file content sanitization, retention/erasure and a documented data classification.
5. Wire least-privilege IAM, Secret Manager, BigQuery analytics, budget alerts, logging/monitoring and spend guardrails.
6. Add 40 manually labelled synthetic documents and report extraction precision/recall; demonstrate 100% accepted monetary claims trace to confirmed inputs.
7. Run frontend lint/build, accessibility, E2E, tenant-isolation, prompt-injection, oversized file, CSV formula injection, concurrency, load and rollback tests.
8. Have product, security and DevOps owners sign off before any production deployment.

See `docs/IMPLEMENTATION_STATUS.md` for the verified scope and remaining work.

## Premium dashboard UI

The dashboard includes a premium evergreen/mint visual refresh, responsive layouts, inline animated hero illustration, subtle panel and chart motion, refined form controls, hover/focus states, and reduced-motion support. See `docs/PREMIUM_UI.md` for details. The visual refresh does not change API behavior or security properties.
