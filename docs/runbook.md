# Operations Runbook

## Alert Provider Outage
1. Verify FCM failures in logs and delivery table.
2. Keep in-app alert inbox active.
3. Increase board polling interval to 8-10s for critical stations.
4. Notify supervisors that push is degraded.
5. Resume normal mode once provider is healthy.

## Queue Lag High
1. Run `process_notifications` manually.
2. Prioritize critical/high alerts.
3. Archive old normal alerts if required.

## Database Incident
1. Set app to maintenance mode.
2. Restore latest validated backup into staging.
3. Validate row counts in core tables.
4. Promote restored DB and redeploy app.

## Conflict Surge
1. Use supervisor console sorted by ETA urgency.
2. Resolve or lock conflicts with reason notes.
3. Trigger temporary SOP: only medium/high confidence announcements.
