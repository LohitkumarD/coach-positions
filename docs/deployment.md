# Render + Neon Deployment Guide

## Prerequisites
- Render account
- Neon database
- Firebase project (optional for push)

## Steps
1. Create Neon database and copy `DATABASE_URL`.
2. Create Render web service from repository.
3. Ensure `render.yaml` is detected.
4. Set env vars:
   - `DJANGO_SECRET_KEY`
   - `DJANGO_DEBUG=False`
   - `DJANGO_ALLOWED_HOSTS` (your `*.onrender.com` hostname and any custom domain)
   - `CSRF_TRUSTED_ORIGINS` (`https://your-service.onrender.com`, etc.)
   - `DATABASE_URL`
   - `FCM_CREDENTIALS_JSON` (optional)
5. Run migration job:
   - `python manage.py migrate`
6. Create admin user:
   - `python manage.py createsuperuser`
7. Configure scheduled tasks:
   - `python manage.py process_notifications` (every minute)

## PWA (install on Android / Chrome)
The app ships a web app manifest, icons, and a service worker at `/sw.js`. After deploy over HTTPS, open the site in Chrome on Android → menu → **Install app** or **Add to Home screen**. Replace `ops/static/ops/pwa-icon-*.png` if you want a custom logo (keep 192 and 512 sizes).

### Share target (Gallery / WhatsApp → app)
The manifest includes `share_target` pointing to `POST /pwa/incoming-share`. Users must use the **installed** PWA and may need to open it once after a release so Chrome picks up the new manifest. Shared images are stored briefly in Postgres (`IncomingShareImage`); run `python manage.py cleanup_incoming_shares` on a schedule (e.g. daily) to delete rows older than 48 hours. Set `PWA_SHARE_INGEST_ENABLED=False` to reject new shares at the server (remove `share_target` from the manifest if you must hide the app from the system share sheet entirely).

## Backup and Recovery
- Nightly dump: `pg_dump` to compressed artifact.
- Weekly restore test into staging.
- Keep 14 daily backups and 8 weekly backups.

## Hardening Checklist
- Secure cookies enabled in prod.
- Secret key rotated before go-live.
- Debug disabled.
- CSRF trusted origins configured.
