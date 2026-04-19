# Coach Position Intelligence System

Production-grade, mobile-first, cloud-hosted coach composition decision support system for station/counter staff.

## Stack
- Django + Django REST Framework
- Neon PostgreSQL
- Render deployment
- SSE-based realtime board updates
- FCM Web Push with in-app fallback

## Core Capabilities
- Structured submission flow with idempotency and normalization
- Weighted scoring engine with station proximity and contributor reliability
- Confidence bands and conflict queue
- Supervisor override/resolve workflow
- Score explainability endpoint
- Real-time board + critical alerts + acknowledgement
- Push notification orchestration and retry delivery model

## Local Setup
1. Create virtualenv and install dependencies:
   - `pip install -r requirements.txt`
2. Copy `.env.example` to `.env` and update values.
3. Run migrations:
   - `python manage.py migrate`
4. Create admin:
   - `python manage.py createsuperuser`
5. Run server:
   - `python manage.py runserver`

### Fast Windows Bootstrap
- `powershell -ExecutionPolicy Bypass -File scripts/bootstrap_local.ps1`

### Demo Data (optional only)
- `python manage.py seed_demo`
- Not required for normal operation. Real trains should be created through app/API and stored in DB.

## API Summary
- `GET /api/v1/me` (current user and role)
- `POST /api/v1/submissions`
- `GET /api/v1/board?station={code}&windowMin={n}`
- `GET /api/v1/board/stream?station={code}`
- `GET /api/v1/conflicts?station={code}`
- `POST /api/v1/conflicts/{id}/resolve`
- `POST /api/v1/conflicts/{id}/override`
- `GET /api/v1/alerts`
- `POST /api/v1/alerts/{id}/ack`
- `GET /api/v1/decisions/{trainServiceId}/explain`
- `GET /api/v1/contributors/scoreboard?station={code}`

## Mobile UX
- Touch targets >= 44px
- No horizontal scroll on core screens
- Readable confidence badges and sequence display
- Auto-reconnect with stale state indicators
- PWA: manifest + `/sw.js` service worker — on Android Chrome use **Install app** / **Add to Home screen** (HTTPS required)
- **Share to app (Android):** after installing the PWA, use Gallery/WhatsApp **Share → Coach Board** to send a photo; it opens Submit and runs the same scan as **Scan image**. Re-open the installed app once after deploy so the updated manifest (with `share_target`) is applied. Server env: `PWA_SHARE_INGEST_ENABLED` (default on); schedule `python manage.py cleanup_incoming_shares` periodically to purge stale rows.

## Production Operations

### Deploy checklist (Render + Neon)
1. Set `DATABASE_URL` to the Neon connection string (pooler URL is fine for web workers).
2. Run migrations on each release before or as the web process starts, e.g. `python manage.py migrate --noinput`.
3. Ensure `DJANGO_ALLOWED_HOSTS` and `CSRF_TRUSTED_ORIGINS` include your Render hostname and scheme.
4. Smoke test after deploy: create a train via `POST /api/v1/train-services/create` with only `train_no` (and optional name), then submit a coach sequence via `POST /api/v1/submissions`. Automated smoke coverage lives in `ops/tests/test_smoke_flow.py`.

### Running tests locally
If `DATABASE_URL` points at Neon, Django may try to create a Postgres test database (often undesirable). For a quick local run, use an in-memory SQLite database, for example PowerShell: `$env:DATABASE_URL='sqlite:///:memory:'; python -m pytest`.

- Health endpoints:
  - `/health/live`
  - `/health/ready`
- Notification retry worker:
  - `python manage.py process_notifications`
- Backups and pilot runbooks:
  - `docs/runbook.md`
  - `docs/pilot_guide.md`
- End-to-end verification checklist:
  - `docs/end_to_end_verification.md`
