# Evidence 2026-08-30 — Provider performance wave

## Command

```text
MYADMIN_POSTGRES_INTEGRATION=1 \
MYADMIN_POSTGRES_CURRENT_PORT=55433 \
MYADMIN_POSTGRES_DATABASE=myadmin_test \
MYADMIN_POSTGRES_USER=myadmin_test \
MYADMIN_POSTGRES_PASSWORD=<fixture-password> \
bun test --isolate --timeout 120000 \
  tests/performance/monitoring-status.test.ts \
  tests/performance/data-browser.test.ts \
  tests/performance/postgresql-metadata.test.ts
```

## Result

```text
3 pass
0 fail
15 expect() calls
Ran 3 tests across 3 files. [2.39s]
```

Observed measurements were 3.78ms for ten monitoring status calls, 39.07ms
for a bounded Data Browser page from a million-row table, and 109.75ms for
metadata pagination/search over a 2,000-table schema.

## Acceptance boundary

These are disposable PostgreSQL local performance observations. They support
the exercised provider performance IDs for Specs 0032, 0037, and 0051, but do
not replace cross-machine baselines, production-scale profiling, or manual
acceptance.
