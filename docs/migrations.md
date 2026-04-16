# Migration Strategy

## Principles
- Keep schema migrations backward compatible where possible.
- Deploy additive changes first, cleanup changes later.
- Never combine destructive schema changes with feature rollout in same release.

## Order
1. Core identity and station tables
2. Train service and route rank tables
3. Submission and candidate tables
4. Decision, conflict, alert, and delivery tables
5. Audit and device token tables
6. Performance indexes and constraints

## Rollout Pattern
- Release A:
  - Add new tables/columns nullable.
  - Deploy app code writing both old and new fields if needed.
- Release B:
  - Backfill data via management command.
- Release C:
  - Enforce non-null, add stricter constraints, remove legacy fields.

## Safety
- Use transaction-wrapped migrations where supported.
- Pre-check row counts and lock-sensitive operations.
- Keep rollback notes in release checklist.
