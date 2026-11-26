$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Write-Host "AI Operations Diagnostic - local development startup" -ForegroundColor Cyan
Write-Host "Prerequisites: Python 3.12+, Node.js 20+, npm. Docker is optional."
if (-not (Test-Path "$Root\api\.venv")) { py -3.12 -m venv "$Root\api\.venv" }
& "$Root\api\.venv\Scripts\python.exe" -m pip install --upgrade pip
& "$Root\api\.venv\Scripts\python.exe" -m pip install -r "$Root\api\requirements.txt"
if (-not (Test-Path "$Root\api\.env")) { Copy-Item "$Root\api\.env.example" "$Root\api\.env" }
if (-not (Test-Path "$Root\web\node_modules")) { Push-Location "$Root\web"; npm install; Pop-Location }
Write-Host "Dependencies ready. Open two PowerShell terminals:" -ForegroundColor Green
Write-Host "Terminal 1: cd `"$Root\api`"; .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000"
Write-Host "Terminal 2: cd `"$Root\web`"; npm run dev"
Write-Host "Then open http://localhost:3000. Local demo token: local-demo-token-change-me" -ForegroundColor Yellow
