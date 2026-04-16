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
   - `DJANGO_ALLOWED_HOSTS`
   - `CSRF_TRUSTED_ORIGINS`
   - `DATABASE_URL`
   - `FCM_CREDENTIALS_JSON` (optional)
5. Run migration job:
   - `python manage.py migrate`
6. Create admin user:
   - `python manage.py createsuperuser`
7. Configure scheduled tasks:
   - `python manage.py process_notifications` (every minute)

## Backup and Recovery
- Nightly dump: `pg_dump` to compressed artifact.
- Weekly restore test into staging.
- Keep 14 daily backups and 8 weekly backups.

## Hardening Checklist
- Secure cookies enabled in prod.
- Secret key rotated before go-live.
- Debug disabled.
- CSRF trusted origins configured.
