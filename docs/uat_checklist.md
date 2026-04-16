# UAT and Shift Simulation Checklist

## Contributor Flow
- Submit valid sequence in < 20 seconds on Android phone.
- Submit invalid sequence and verify validation error.
- Repeat same idempotency key and verify deduplicated response.
- Submit while offline and retry after reconnect (client behavior).

## Board Flow
- Verify auto-refresh without manual reload.
- Verify low confidence badge visibility and readability.
- Verify stale/offline indicator behavior.

## Alert Flow
- Trigger composition change and confirm critical alert shown.
- Acknowledge alert from mobile board.
- Validate push fallback to in-app alert inbox when push unavailable.

## Supervisor Flow
- View conflict cards sorted by urgency.
- Resolve conflict with note.
- Override with selected candidate and reason.
- Lock conflict for temporary verification window.

## Reliability and Transparency
- Verify scoreboard updates after decisions.
- Verify explain endpoint shows reason codes and score breakup.

## Operational Checks
- `/health/live` and `/health/ready` return expected values.
- Notification retry command processes pending deliveries.
- Backup and restore scripts execute in staging environment.
