# Station Counter SOP

## Announcement Rule
- Use `HIGH` or `MEDIUM` confidence sequence for standard announcement.
- If `LOW`, announce as tentative and re-check before arrival.

## Alert Handling
- For `CRITICAL` composition change:
  - acknowledge alert immediately
  - refresh board and re-announce if needed

## Conflict Handling
- Counter staff do not resolve conflicts.
- Supervisor resolves in conflict console with reason.

## Offline Condition
- If board shows stale/offline state:
  - use last visible sequence as tentative only
  - request fresh update from available contributor
