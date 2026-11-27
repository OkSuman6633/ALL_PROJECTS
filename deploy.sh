#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-all-projects-hub}"
REPO_NAME="${REPO_NAME:-all-projects}"
GEMINI_SECRET_NAME="${GEMINI_SECRET_NAME:-google-api-key}"
GEMINI_API_KEY="${GEMINI_API_KEY:-}"
MIN_INSTANCES="${MIN_INSTANCES:-0}"
MAX_INSTANCES="${MAX_INSTANCES:-1}"

if [[ -z "$PROJECT_ID" ]]; then
  echo "ERROR: No GCP project configured. Set PROJECT_ID=<id> or run: gcloud config set project <id>" >&2
  exit 1
fi

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}:latest"

echo "=== Deploying ALL_PROJECTS (6 use cases) to ONE Cloud Run service ==="
echo "Project:  $PROJECT_ID ($PROJECT_NUMBER)"
echo "Region:   $REGION"
echo "Service:  $SERVICE_NAME"
echo "Image:    $IMAGE_URI"
echo "Secret:   $GEMINI_SECRET_NAME"

echo ""
echo "[1/5] Enabling required Google Cloud APIs..."
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  --project "$PROJECT_ID"

echo ""
echo "[2/5] Ensuring Artifact Registry repository '$REPO_NAME' exists..."
if ! gcloud artifacts repositories describe "$REPO_NAME" --location "$REGION" --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$REPO_NAME" \
    --repository-format=docker \
    --location="$REGION" \
    --description="Unified All_Projects container images" \
    --project="$PROJECT_ID"
fi

echo ""
echo "[3/5] Verifying Secret Manager secret '$GEMINI_SECRET_NAME'..."
if ! gcloud secrets describe "$GEMINI_SECRET_NAME" --project "$PROJECT_ID" >/dev/null 2>&1; then
  if [[ -z "$GEMINI_API_KEY" && -f "$ROOT_DIR/.env" ]]; then
    GEMINI_API_KEY="$(grep -E '^(GEMINI_API_KEY|GOOGLE_API_KEY)=' "$ROOT_DIR/.env" | head -n1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
  fi
  if [[ -z "$GEMINI_API_KEY" ]]; then
    echo "ERROR: Secret '$GEMINI_SECRET_NAME' does not exist and GEMINI_API_KEY is unset." >&2
    exit 1
  fi
  printf '%s' "$GEMINI_API_KEY" | gcloud secrets create "$GEMINI_SECRET_NAME" --data-file=- --replication-policy="automatic" --project "$PROJECT_ID"
fi

gcloud secrets add-iam-policy-binding "$GEMINI_SECRET_NAME" \
  --member="serviceAccount:${COMPUTE_SA}" \
  --role="roles/secretmanager.secretAccessor" \
  --project "$PROJECT_ID" >/dev/null

echo ""
echo "[4/5] Building unified container via Cloud Build (E2_HIGHCPU_8)..."
gcloud builds submit . \
  --tag "$IMAGE_URI" \
  --machine-type=e2-highcpu-8 \
  --timeout=1800s \
  --project "$PROJECT_ID"

echo ""
echo "[5/5] Deploying unified Cloud Run service '$SERVICE_NAME'..."
ENV_VARS="UNIFIED_DATA_DIR=/app/data,AGENT_ASSURENCE_ENVIRONMENT=production,AGENT_ASSURENCE_AUTH_DISABLED=false,AGENT_ASSURANCE_DEV_ALLOW_PRIVATE_HOSTS=true,AOD_AUTH_MODE=demo,CONSTRUCTION_APP_ENV=local,ALLOW_DEMO_LOGIN=true"
SECRET_VARS="GEMINI_API_KEY=${GEMINI_SECRET_NAME}:latest,GOOGLE_API_KEY=${GEMINI_SECRET_NAME}:latest,AOD_GEMINI_API_KEY=${GEMINI_SECRET_NAME}:latest"

gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE_URI" \
  --region "$REGION" \
  --platform managed \
  --port 8080 \
  --memory 4Gi \
  --cpu 2 \
  --cpu-boost \
  --timeout 300 \
  --concurrency 80 \
  --min-instances "$MIN_INSTANCES" \
  --max-instances "$MAX_INSTANCES" \
  --allow-unauthenticated \
  --set-secrets "$SECRET_VARS" \
  --set-env-vars "$ENV_VARS" \
  --project "$PROJECT_ID"

SERVICE_URL="$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --project "$PROJECT_ID" --format='value(status.url)')"
echo ""
echo "=== Deployment Complete ==="
echo "Hub URL: ${SERVICE_URL}/"
echo "  1. ${SERVICE_URL}/Agent_Assurence/"
echo "  2. ${SERVICE_URL}/AI-operations-Diagonostic"
echo "  3. ${SERVICE_URL}/Construction-variation-tracker/"
echo "  4. ${SERVICE_URL}/Contract-Invoice-Leakage-Finder/"
echo "  5. ${SERVICE_URL}/Industry-Specific-Lead-to-Order-Agent/"
echo "  6. ${SERVICE_URL}/Procurement-Quote-Comparison-Agent"
