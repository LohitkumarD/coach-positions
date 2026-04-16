$ErrorActionPreference = "Stop"

Set-Location "e:\coach_positions"

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  Write-Host "Python not found in PATH. Install Python 3.10+ and re-run." -ForegroundColor Red
  exit 1
}

python -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt

if (-not (Test-Path ".env")) {
@"
DJANGO_SECRET_KEY=replace-with-secret
DJANGO_DEBUG=True
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
DATABASE_URL=sqlite:///db.sqlite3
"@ | Set-Content ".env"
}

python manage.py makemigrations
python manage.py migrate

Write-Host "Bootstrap complete. Next:" -ForegroundColor Green
Write-Host "  1) python manage.py createsuperuser"
Write-Host "  2) python manage.py runserver"
Write-Host "Optional demo data: python manage.py seed_demo"
