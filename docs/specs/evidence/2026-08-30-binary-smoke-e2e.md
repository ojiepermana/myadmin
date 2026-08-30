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

Direct rerun from the current checkout also passed:

```text
MYADMIN_SMOKE_DATABASE_URL=<postgres-fixture-url> bun run smoke:binary -- \
  --binary dist/binaries/macos-arm64/myadmin --require-database

SMOKE binary: passed health, embedded SPA, setup, login, auth, shutdown, and doctor checks
```

- `SMOKE-0054-AC4`: the real macOS ARM64 binary passed health, embedded SPA, setup admin, login, `/auth/me`, disposable PostgreSQL connection, SIGTERM shutdown, and healthy-installation `doctor` checks.
- `SMOKE-0054-AC6`: the same run fetched the embedded SPA successfully, so a missing embedded asset would have failed the smoke harness.

## Acceptance boundary

This proves the local macOS ARM64 database smoke path for Spec 0054. It does
not replace smoke on every target runner, hosted release workflow, or clean
platform acceptance.
