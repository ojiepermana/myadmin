# Evidence 2026-08-30 — Binary database smoke E2E

## Command

```text
MYADMIN_SMOKE_DATABASE_URL='postgres://myadmin_test:<fixture-password>@127.0.0.1:55433/myadmin_test' \
PLAYWRIGHT_HTML_OPEN=never bun run test:e2e -- \
  tests/e2e/web/binary-smoke.spec.ts
```

## Result

```text
1 passed (5.8s)
```

The macOS ARM64 binary artifact ran the required database smoke harness against
the disposable PostgreSQL service with `--require-database`.

## Acceptance boundary

This proves the local macOS ARM64 database smoke path for Spec 0054. It does
not replace smoke on every target runner, hosted release workflow, or clean
platform acceptance.
