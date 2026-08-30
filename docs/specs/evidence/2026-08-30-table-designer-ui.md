# Evidence 2026-08-30 — Table Designer UI wave

## Command

```text
PLAYWRIGHT_HTML_OPEN=never bun run test:e2e -- \
  tests/e2e/web/zzzz-table-designer.spec.ts
```

## Result

```text
11 passed (10.6s)
```

The browser fixture suite covered column preview/apply gating, destructive
column confirmation, refresh after alter, exact truncate and rename
confirmation, dependency review, stale data-tab reload state, ordered
composite indexes, index replacement, check constraints, MySQL capability
gating, and primary-key row identity refresh.

## Acceptance boundary

This is deterministic UI fixture evidence. It supports the exercised browser
paths for Specs 0041, 0042, and 0043, but does not replace real-engine
PostgreSQL/MySQL E2E or manual acceptance.
