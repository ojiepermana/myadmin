# Evidence 2026-08-30 — Real import/export E2E

## Command

```text
MYADMIN_REAL_DATABASE_E2E=1 PLAYWRIGHT_HTML_OPEN=never bun run test:e2e -- \
  tests/e2e/web/zz-real-import-export.spec.ts
```

## Result

```text
2 passed (7.3s)
```

The disposable PostgreSQL and MySQL browser flows completed SQL export/import
route roundtrips and asserted that credentials were not present in the
observable response or job data.

## Acceptance boundary

This proves the exercised real-provider route path. It does not replace the
remaining large-dataset performance, full UI acceptance, security review, or
external/manual evidence requirements.
