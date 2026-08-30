# Evidence 2026-08-30 — Backup and Restore UI

## Command

```text
PLAYWRIGHT_HTML_OPEN=never bun run test:e2e -- \
  tests/e2e/web/zz-backup-restore.spec.ts
```

## Result

```text
1 passed (6.3s)
```

The browser fixture flow covered backup capability and cancellation, honest
unavailable-tool messaging, restore validation, exact target-database
confirmation, and resulting job state.

## Acceptance boundary

This is deterministic local UI fixture evidence for the exercised 0049 and
0050 paths. Real native-tool/database roundtrip evidence is recorded
separately; full external and manual acceptance remains open.
