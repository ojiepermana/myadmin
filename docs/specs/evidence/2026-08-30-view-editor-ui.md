# Evidence 2026-08-30 — View Editor UI

## Command

```text
PLAYWRIGHT_HTML_OPEN=never bun run test:e2e -- \
  tests/e2e/web/zz-view-editor.spec.ts
```

## Result

```text
1 passed (6.6s)
```

The browser fixture flow covered view validation, DDL preview/update,
PostgreSQL drop-and-create safeguard, capability gating, and the explorer
action surface.

## Acceptance boundary

This is deterministic local UI fixture evidence for the exercised 0044 paths.
The real-provider view CRUD evidence is recorded separately; full manual and
cross-engine acceptance remains open where required.
