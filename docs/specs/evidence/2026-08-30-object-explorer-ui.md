# Evidence 2026-08-30 — Object Explorer and Search UI

## Command

```text
PLAYWRIGHT_HTML_OPEN=never bun run test:e2e -- \
  tests/e2e/web/zzz-object-explorer.spec.ts
```

## Result

```text
1 passed (8.7s)
```

The browser fixture flow covered provider-driven lazy trees, pagination,
per-node errors, capability-gated context actions, refresh behavior, search
debounce/abort and jump-to-node behavior, and visual capture.

## Acceptance boundary

This is deterministic UI fixture evidence for the exercised 0031 and 0032
paths. Real-provider coverage and performance evidence are recorded separately;
full manual and cross-browser acceptance remain open.
