# Load Test Plan

## Scenarios
- 200 concurrent board viewers across stations.
- 30 submissions/minute burst for 20 minutes.
- Conflict spike with 50 active conflicts.
- Alert burst of 100 critical events in 5 minutes.

## Metrics to Capture
- API p50/p95/p99 latency.
- SSE reconnect rate and lag.
- Notification queue growth and drain speed.
- DB CPU/connection utilization.

## Pass Criteria
- Board API p95 < 500ms.
- Submission API p95 < 800ms.
- Decision recompute median < 3s.
- Critical alerts dispatch p95 < 5s.
