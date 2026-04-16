# End-to-End Verification (No-Miss)

## 1) Environment
- Ensure Python 3.10+ installed and on PATH.
- Verify:
  - `python --version`
  - `py --version` (optional on Windows)

## 2) Bootstrap
- Run:
  - `powershell -ExecutionPolicy Bypass -File scripts/bootstrap_local.ps1`
## 2A) Demo Seed (optional)
- Only for quick local demo:
  - `python manage.py seed_demo`
- For real usage, do not seed hardcoded trains. Add trains via `/submit` -> `Add Train Details` and store in DB.


## 3) First-time Admin
- Create superuser:
  - `python manage.py createsuperuser`

## 4) Run Services
- Terminal A:
  - `python manage.py runserver`
- Terminal B:
  - `python manage.py process_notifications`

## 5) Verify Modules
- Submission:
  - POST `/api/v1/submissions`
  - Confirm dedupe by reusing same `idempotency_key`.
- Board:
  - GET `/api/v1/board?station=SBC&windowMin=240`
- Realtime:
  - Open `/` and confirm auto refresh after new submissions.
- Alerts:
  - GET `/api/v1/alerts`
  - Confirm `POST /api/v1/alerts/{id}/ack`
- Conflict:
  - Submit conflicting sequences and verify `/supervisor/conflicts`.
- Explainability:
  - GET `/api/v1/decisions/{trainServiceId}/explain`
- Scoreboard:
  - GET `/api/v1/contributors/scoreboard?station=SBC`

## 6) Health and Ops
- `/health/live`
- `/health/ready`
- `/health/metrics` (supervisor/admin)

## 7) Push Fallback Validation
- Leave `FCM_CREDENTIALS_JSON` empty in `.env`.
- Trigger critical alert and verify:
  - alert created
  - `NotificationDelivery.status` becomes `degraded_fallback`
  - in-app board alert still visible

## 8) Test Suite
- Run:
  - `pytest`

## 9) Production Switch (Render + Neon)
- Set:
  - `DJANGO_DEBUG=False`
  - `DATABASE_URL=<neon-url>`
  - `DJANGO_ALLOWED_HOSTS=<render-host>`
  - `CSRF_TRUSTED_ORIGINS=https://<render-host>`
- Deploy and run migrations.
