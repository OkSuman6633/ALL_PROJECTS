# All Projects Monorepo

Unified repository, subpath gateway, and single-instance Google Cloud Run deployment for all six AI/engineering projects.

## Projects

| Project | URL Path | Internal UI Port | Internal API Port | Folder |
| --- | --- | --- | --- | --- |
| Agent Assurance Laboratory | `/Agent_Assurence` | `8000` (FastAPI static) | `8000` | [`Agent_Assurence`](./Agent_Assurence) |
| AI Operations Diagnostic | `/AI-operations-Diagonostic` | `3001` (Next.js) | `8001` | [`AI-operations-Diagonostic`](./AI-operations-Diagonostic) |
| Construction Variation Tracker | `/Construction-variation-tracker` | `5173` / Nginx static | `8002` | [`Construction-variation-tracker`](./Construction-variation-tracker) |
| Contract & Invoice Leakage Finder | `/Contract-Invoice-Leakage-Finder` | `5174` / Nginx static | `8003` | [`Contract-Invoice-Leakage-Finder`](./Contract-Invoice-Leakage-Finder) |
| Industry-Specific Lead-to-Order Agent | `/Industry-Specific-Lead-to-Order-Agent` | `5175` / Nginx static | `8004` | [`Industry-Specific-Lead-to-Order-Agent`](./Industry-Specific-Lead-to-Order-Agent) |
| Procurement Quote Comparison Agent | `/Procurement-Quote-Comparison-Agent` | `3002` (Next.js) | `8005` | [`Procurement-Quote-Comparison-Agent`](./Procurement-Quote-Comparison-Agent) |

## Unified Google Cloud Run Deployment (1 Instance for All 6 Apps)

All 6 applications (6 FastAPI backends, 2 Next.js standalone servers, 3 pre-built Vite React SPAs, and Nginx reverse proxy) are packaged into one container via [`Dockerfile`](./Dockerfile) and supervised by [`gateway/start_cloudrun.py`](./gateway/start_cloudrun.py).

### Quick Deploy (PowerShell)

```powershell
.\deploy.ps1 -ProjectId <YOUR_GCP_PROJECT_ID> -Region us-central1 -GeminiApiKey <YOUR_GEMINI_API_KEY>
```

### Quick Deploy (Bash / Cloud Shell)

```bash
PROJECT_ID=<YOUR_GCP_PROJECT_ID> REGION=us-central1 GEMINI_API_KEY=<YOUR_GEMINI_API_KEY> ./deploy.sh
```

### Unified Deployment Files

- [`Dockerfile`](./Dockerfile): Multi-stage image building all 5 JS frontends with subpath + `/api` routing and 6 isolated Python virtualenvs under `/opt/venvs/`.
- [`.dockerignore`](./.dockerignore): Excludes local `node_modules`, `.venv`, `.db`, logs, and dev artifacts from Cloud Build uploads.
- [`gateway/nginx.cloudrun.conf.template`](./gateway/nginx.cloudrun.conf.template): Nginx reverse proxy on `$PORT` serving `/` portal, `/health`, static Vite SPAs, Next.js servers, and `/<project>/api/*` backend proxies.
- [`gateway/start_cloudrun.py`](./gateway/start_cloudrun.py): Container entrypoint that configures unified env vars, seeds demo data idempotently, starts all 8 upstream processes, waits for port readiness, and launches Nginx.
- [`deploy.ps1`](./deploy.ps1) / [`deploy.sh`](./deploy.sh) / [`cloudbuild.yaml`](./cloudbuild.yaml): Unified build and Cloud Run deployment scripts.
- [`.env.cloudrun.example`](./.env.cloudrun.example): Reference environment variables for all 6 applications.

## Local Gateway (Python, zero external dependencies)

Start all 6 projects and the local reverse proxy:

```powershell
python gateway/server.py
```

Then open:
- Portal hub: `http://localhost:8080/`
- Any project directly: `http://localhost:8080/<project-name>/`
