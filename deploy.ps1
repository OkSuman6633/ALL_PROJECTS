param(
    [string]$ProjectId = (gcloud config get-value project 2>$null),
    [string]$Region = "us-central1",
    [string]$ServiceName = "all-projects-hub",
    [string]$RepoName = "all-projects",
    [string]$GeminiSecretName = "google-api-key",
    [string]$GeminiApiKey = $env:GEMINI_API_KEY,
    [int]$MinInstances = 0,
    [int]$MaxInstances = 1
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

if (-not $ProjectId) {
    throw "No GCP project configured. Pass -ProjectId or run: gcloud config set project <PROJECT_ID>"
}

$ProjectNumber = (gcloud projects describe $ProjectId --format="value(projectNumber)")
$ComputeSa = "$ProjectNumber-compute@developer.gserviceaccount.com"
$ImageUri = "$Region-docker.pkg.dev/$ProjectId/$RepoName/$ServiceName`:latest"

Write-Host "=== Deploying ALL_PROJECTS (6 use cases) to ONE Cloud Run service ===" -ForegroundColor Cyan
Write-Host "Project:  $ProjectId ($ProjectNumber)"
Write-Host "Region:   $Region"
Write-Host "Service:  $ServiceName"
Write-Host "Image:    $ImageUri"
Write-Host "Secret:   $GeminiSecretName"

Write-Host "`n[1/5] Enabling required Google Cloud APIs..." -ForegroundColor Yellow
gcloud services enable `
    run.googleapis.com `
    cloudbuild.googleapis.com `
    artifactregistry.googleapis.com `
    secretmanager.googleapis.com `
    --project $ProjectId

function Test-GcloudResource {
    param([scriptblock]$Command)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & $Command *> $null
        return ($LASTEXITCODE -eq 0)
    } finally {
        $ErrorActionPreference = $prev
    }
}

Write-Host "`n[2/5] Ensuring Artifact Registry repository '$RepoName' exists..." -ForegroundColor Yellow
if (-not (Test-GcloudResource { gcloud artifacts repositories describe $RepoName --location $Region --project $ProjectId })) {
    gcloud artifacts repositories create $RepoName `
        --repository-format=docker `
        --location=$Region `
        --description="Unified All_Projects container images" `
        --project=$ProjectId
}

Write-Host "`n[3/5] Verifying Secret Manager secret '$GeminiSecretName'..." -ForegroundColor Yellow
if (-not (Test-GcloudResource { gcloud secrets describe $GeminiSecretName --project $ProjectId })) {
    if (-not $GeminiApiKey -and (Test-Path "$Root\.env")) {
        $envLine = Get-Content "$Root\.env" | Where-Object { $_ -match '^(GEMINI_API_KEY|GOOGLE_API_KEY)=' } | Select-Object -First 1
        if ($envLine) {
            $GeminiApiKey = ($envLine -split '=', 2)[1].Trim().Trim('"').Trim("'")
        }
    }
    if (-not $GeminiApiKey) {
        throw "Secret '$GeminiSecretName' does not exist and no GeminiApiKey / .env key was found."
    }
    $GeminiApiKey | gcloud secrets create $GeminiSecretName --data-file=- --replication-policy="automatic" --project $ProjectId
}

gcloud secrets add-iam-policy-binding $GeminiSecretName `
    --member="serviceAccount:$ComputeSa" `
    --role="roles/secretmanager.secretAccessor" `
    --project $ProjectId | Out-Null

Write-Host "`n[4/5] Building unified container via Cloud Build (E2_HIGHCPU_8)..." -ForegroundColor Yellow
gcloud builds submit . `
    --tag $ImageUri `
    --machine-type=e2-highcpu-8 `
    --timeout=1800s `
    --project $ProjectId

Write-Host "`n[5/5] Deploying unified Cloud Run service '$ServiceName'..." -ForegroundColor Yellow
$envPairs = @(
    "UNIFIED_DATA_DIR=/app/data",
    "AGENT_ASSURENCE_ENVIRONMENT=production",
    "AGENT_ASSURENCE_AUTH_DISABLED=false",
    "AGENT_ASSURANCE_DEV_ALLOW_PRIVATE_HOSTS=true",
    "AOD_AUTH_MODE=demo",
    "CONSTRUCTION_APP_ENV=local",
    "ALLOW_DEMO_LOGIN=true"
) -join ","

$secretPairs = @(
    "GEMINI_API_KEY=${GeminiSecretName}:latest",
    "GOOGLE_API_KEY=${GeminiSecretName}:latest",
    "AOD_GEMINI_API_KEY=${GeminiSecretName}:latest"
) -join ","

gcloud run deploy $ServiceName `
    --image $ImageUri `
    --region $Region `
    --platform managed `
    --port 8080 `
    --memory 4Gi `
    --cpu 2 `
    --cpu-boost `
    --timeout 300 `
    --concurrency 80 `
    --min-instances $MinInstances `
    --max-instances $MaxInstances `
    --allow-unauthenticated `
    --set-secrets $secretPairs `
    --set-env-vars $envPairs `
    --project $ProjectId

$ServiceUrl = (gcloud run services describe $ServiceName --region $Region --project $ProjectId --format="value(status.url)")
Write-Host "`n=== Deployment Complete ===" -ForegroundColor Green
Write-Host "Hub URL: $ServiceUrl/" -ForegroundColor White
Write-Host "  1. $ServiceUrl/Agent_Assurence/"
Write-Host "  2. $ServiceUrl/AI-operations-Diagonostic"
Write-Host "  3. $ServiceUrl/Construction-variation-tracker/"
Write-Host "  4. $ServiceUrl/Contract-Invoice-Leakage-Finder/"
Write-Host "  5. $ServiceUrl/Industry-Specific-Lead-to-Order-Agent/"
Write-Host "  6. $ServiceUrl/Procurement-Quote-Comparison-Agent"
