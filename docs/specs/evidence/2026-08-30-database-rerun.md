# Evidence 2026-08-30 — Full database integration rerun

## Command

```text
MYADMIN_POSTGRES_INTEGRATION=1 \
MYADMIN_POSTGRES_SECURITY_INTEGRATION=1 \
MYADMIN_MYSQL_SECURITY_INTEGRATION=1 \
MYADMIN_POSTGRES_CURRENT_PORT=55433 \
MYADMIN_POSTGRES_DATABASE=myadmin_test \
MYADMIN_POSTGRES_USER=myadmin_test \
MYADMIN_POSTGRES_PASSWORD=<fixture-password> \
MYSQL_8_0_URL='mysql://fixture:<fixture-password>@127.0.0.1:3380/fixture?sslmode=require' \
MYSQL_LATEST_URL='mysql://fixture:<fixture-password>@127.0.0.1:3384/fixture?sslmode=require' \
bun test --isolate --timeout 30000 tests/integration tests/performance
```

## Result

```text
182 pass
0 fail
1322 expect() calls
Ran 182 tests across 38 files. [54.71s]
```

Both PostgreSQL and MySQL fixture generations were active. The run covered
provider integration, metadata/search, query cancel/EXPLAIN, data mutations,
database/schema/table-designer operations, views, principal/privilege flows,
export/import, native backup/restore, settings, realtime, and performance
scenarios.

## Acceptance boundary

This is a complete local disposable-provider run. It does not replace hosted
CI, clean-machine acceptance, cross-platform release verification, or manual
review.
