# Run Django dev server (uses venv Python — no global PATH required)
$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$PythonExe = Join-Path $ProjectRoot "venv\Scripts\python.exe"
if (-not (Test-Path $PythonExe)) {
    Write-Host "venv not found. From project root run once:" -ForegroundColor Red
    Write-Host "  py -3 -m venv venv" -ForegroundColor Yellow
    Write-Host "  .\venv\Scripts\pip install -r requirements.txt" -ForegroundColor Yellow
    Write-Host "  .\venv\Scripts\python manage.py migrate" -ForegroundColor Yellow
    exit 1
}

# Stale vars from pytest/other tools can block .env (see coach_position/settings.py)
Remove-Item Env:\DATABASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:\GEMINI_API_KEY -ErrorAction SilentlyContinue

Write-Host "Starting http://127.0.0.1:8000/ (Ctrl+C to stop)" -ForegroundColor Green
& $PythonExe manage.py runserver 127.0.0.1:8000
