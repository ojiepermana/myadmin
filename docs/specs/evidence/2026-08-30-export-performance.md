# Evidence 2026-08-30 — Export performance

## Command

```text
MYADMIN_POSTGRES_INTEGRATION=1 \
MYADMIN_POSTGRES_CURRENT_PORT=55433 \
MYADMIN_POSTGRES_DATABASE=myadmin_test \
MYADMIN_POSTGRES_USER=myadmin_test \
MYADMIN_POSTGRES_PASSWORD=<fixture-password> \
bun test --isolate --timeout 30000 tests/performance/export.test.ts
```

## Result

```text
1 pass
0 fail
7 expect() calls
Ran 1 test across 1 file. [4.30s]
Export 100000-row CSV: 3913.39ms
```

The disposable PostgreSQL export performance scenario streamed a 100,000-row
CSV within the local threshold.

## Acceptance boundary

This is a local provider performance observation. It supports the exercised
0047 performance IDs, but does not replace a production-scale or
cross-machine benchmark.
