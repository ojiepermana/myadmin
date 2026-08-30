# Evidence 2026-08-30 — Real query and database workflow wave

## Command

```text
MYADMIN_REAL_DATABASE_E2E=1 PLAYWRIGHT_HTML_OPEN=never \
  bun run test:e2e -- tests/e2e/web/zz-real-query-editor.spec.ts
```

## Result

```text
4 passed (2.6m)
```

The run used disposable PostgreSQL and MySQL services and covered real browser
workflows for query execution, transaction rollback and failure boundaries,
database and schema management, object search, view preview/create/drop,
table-designer foreign-key and composite-unique operations, and index removal.

## Acceptance boundary

This evidence proves the exercised local real-provider E2E paths. It does not
close acceptance criteria that additionally require performance baselines,
visual review, manual review, authorization matrices outside the exercised
paths, or hosted/clean-platform evidence.
