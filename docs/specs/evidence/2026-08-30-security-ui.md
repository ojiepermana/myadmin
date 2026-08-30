# Evidence 2026-08-30 — Database security UI

## Command

```text
PLAYWRIGHT_HTML_OPEN=never bun run test:e2e -- \
  tests/e2e/web/zz-security.spec.ts
```

## Result

```text
2 passed (6.7s)
```

The browser fixture suite covered principal create/edit/reset/drop flows,
secret-safe form behavior, privilege matrix preview and apply, grant/revoke
confirmation, and capability-disabled principal management messaging.

## Acceptance boundary

This is deterministic local UI fixture evidence for the exercised 0045 and
0046 paths. Real PostgreSQL/MySQL security E2E is recorded separately; full
authorization, performance, and manual acceptance remain open where required.
