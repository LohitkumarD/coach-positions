# Security and RBAC Controls

## Roles
- `contributor`: create submissions, read board.
- `supervisor`: contributor rights + conflicts + scoreboard.
- `viewer`: board read-only.
- `admin`: full access.

## Controls Implemented
- DRF auth and permission classes.
- Role-gated supervisor endpoints.
- User rate throttle.
- Idempotent submissions to block replay spam.
- Append-only audit event model.
- Secure cookie defaults for production.

## Recommended Enhancements
- Enforce MFA for supervisor/admin.
- Add signed action approval for high-impact overrides.
- Add immutable external audit sink for long-term compliance.
