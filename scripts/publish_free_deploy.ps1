#Requires -Version 5.1
<#
.SYNOPSIS
  Log into GitHub (once), create a public repo, push this project — then finish Neon + Render in the browser.

.PARAMETER RepoName
  New GitHub repository name (must be unused on your account). Default: coach-positions
#>
param(
    [string]$RepoName = "coach-positions"
)

$ErrorActionPreference = "Stop"
$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
# Winget installs GitHub CLI here; terminals opened before install often lack it on PATH until restart.
$ghDir = "C:\Program Files\GitHub CLI"
if (Test-Path "$ghDir\gh.exe") {
    $env:Path = "$ghDir;$env:Path"
}

Set-Location (Split-Path $PSScriptRoot)

Write-Host "Checking GitHub CLI..."
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Error "GitHub CLI (gh) not found. Install from https://cli.github.com/ or: winget install GitHub.cli"
}

cmd /c "gh auth status >nul 2>nul"
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Not logged in. Run this in the same window, complete the browser step, then re-run:" -ForegroundColor Yellow
    Write-Host ('  & "{0}\gh.exe" auth login -h github.com -p https -w' -f $ghDir) -ForegroundColor Cyan
    exit 1
}

if (git remote get-url origin 2>$null) {
    Write-Host "Remote 'origin' already set. Pushing..."
    git push -u origin HEAD
} else {
    Write-Host "Creating public repo '$RepoName' and pushing..."
    gh repo create $RepoName --public --source=. --remote=origin --push
}

Write-Host ""
Write-Host "GitHub push done. Next (browser):" -ForegroundColor Green
Write-Host "  1. Neon (free Postgres): https://console.neon.tech — create project, copy DATABASE_URL"
Write-Host "  2. Render: https://dashboard.render.com — New > Blueprint, connect this repo"
Write-Host "  3. In the web service Environment, set:"
Write-Host "       DATABASE_URL   (from Neon)"
Write-Host "       DJANGO_SECRET_KEY   (long random string)"
Write-Host "       DJANGO_ALLOWED_HOSTS   = your-service.onrender.com"
Write-Host "       CSRF_TRUSTED_ORIGINS   = https://your-service.onrender.com"
Write-Host "  4. After deploy: Render Shell > python manage.py createsuperuser"
