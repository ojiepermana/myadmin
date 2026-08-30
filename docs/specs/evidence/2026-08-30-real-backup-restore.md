# Evidence 2026-08-30 — Real backup and restore E2E

## Command

```text
MYADMIN_REAL_DATABASE_E2E=1 \
MYADMIN_TOOLS_PG_DUMP_PATH=$PWD/tests/fixtures/postgres-pg-dump.sh \
MYADMIN_TOOLS_PSQL_PATH=$PWD/tests/fixtures/postgres-psql.sh \
PLAYWRIGHT_HTML_OPEN=never bun run test:e2e -- \
  tests/e2e/web/zz-real-restore.spec.ts
```

## Result

```text
4 passed (20.2s)
```

The disposable PostgreSQL and MySQL run covered real SQL upload restore for
both engines and native backup-to-restore roundtrips for both engines,
including artifact download, validation, job completion, restored data
verification, and cleanup.

## Acceptance boundary

This proves the local real-provider and native-wrapper paths exercised by the
tests. It does not replace hosted release, production-like infrastructure,
manual review, or any acceptance that requires an external environment.
