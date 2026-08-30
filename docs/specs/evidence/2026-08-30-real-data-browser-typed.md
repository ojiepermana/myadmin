# Evidence 2026-08-30 — Real data browser typed values

## Command

```text
MYADMIN_REAL_DATABASE_E2E=1 PLAYWRIGHT_HTML_OPEN=never \
  bun run test:e2e -- tests/e2e/web/zz-real-data-browser-typed.spec.ts
```

## Result

```text
1 passed (8.0s)
```

The disposable PostgreSQL and MySQL browser flow edited JSON values and
verified that an explicit `NULL` remained distinguishable and preserved on
both engines.

## Acceptance boundary

This is real-provider local E2E evidence for the exercised typed-value paths.
It does not close the remaining security, conflict, performance, or manual
acceptance requirements of the full data-browser write spec.
