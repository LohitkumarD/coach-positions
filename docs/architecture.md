# Production Architecture Baseline

## Service Boundaries
- **Web/API Service**: Django + DRF.
- **Decision Engine**: in-process service module triggered on submissions.
- **Realtime Layer**: SSE stream endpoint for board updates.
- **Alert Orchestrator**: alert event generation + push dispatch + in-app fallback.
- **Data Store**: Neon PostgreSQL.
- **Static Delivery**: WhiteNoise.

## Failure Modes and Behavior
- DB unavailable -> submission denied with explicit error; board shows last cached client state.
- Push provider unavailable -> fallback to in-app alerts and queue retries.
- SSE disconnect -> client reconnection with backoff and polling fallback.
- High queue lag -> prioritize critical alerts and defer normal.

## SLO Targets
- API p95 submission latency < 800ms.
- Board p95 response latency < 500ms.
- Decision recompute latency < 3s.
- Alert dispatch to provider p95 < 5s.

## Security Model
- Session auth for internal users.
- Role-based API authorization.
- Audit logging for all sensitive actions.
- Rate throttle enabled per user.
