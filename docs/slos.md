# SLOs and Monitoring

## Service Level Objectives
- Submission API p95 latency < 800ms.
- Board API p95 latency < 500ms.
- Decision recompute < 3s from accepted submission.
- Critical alert dispatch p95 < 5s.
- Board stream reconnect success > 99%.

## Core Metrics
- `submissions_total`
- `decision_recompute_ms`
- `conflicts_open_total`
- `alerts_critical_total`
- `alerts_ack_median_seconds`
- `push_delivery_success_ratio`
- `notification_queue_pending`

## Alert Thresholds
- Queue pending > 200 for 5 min -> page supervisor ops.
- Critical ack median > 180s for 30 min -> escalation.
- Error rate > 5% for submission endpoint over 10 min -> investigation.
