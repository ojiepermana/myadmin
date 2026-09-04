# Tests (tests/)

## Overview

Repo level suites: contract (OpenAPI to route coverage plus AJV), integration (in process Elysia with a temp SQLite, optional real PostgreSQL and MySQL), security, performance, quality, verification, unit, and Playwright e2e. Module level tests live next to the code in `apps/*/test` and `packages/*/test`.

## Commands

```bash
# Fast iteration on one path
bun test <path>

# Inner loop: unit and integration, no build, no dev server, about 20 seconds
bun run test:fast

# Everything except e2e (runs ng build and bundle:contract first, about 60 seconds locally)
bun run test

# Suites that build, bind a port, or run a nested bun test live in tests/smoke/
bun run test:acceptance

# Contract suites need the bundled contract
bun run bundle:contract && bun test tests/contract

# PostgreSQL 18.1 on 55433 and 17.7 on 55432
docker compose -f tests/environments/docker-compose.test.yml up -d
MYADMIN_POSTGRES_INTEGRATION=1 bun test tests/integration/postgresql

# MySQL (compose in tests/environments/mysql/), both variables are required
MYSQL_8_0_URL=... MYSQL_LATEST_URL=... bun test tests/integration/mysql

# Playwright; real engine specs also need MYADMIN_REAL_DATABASE_E2E=1
bun run stop:ports && bun run test:e2e
```

Security suites against real engines need `MYADMIN_POSTGRES_SECURITY_INTEGRATION=1` or `MYADMIN_MYSQL_SECURITY_INTEGRATION=1`.

## Conventions

- Test titles carry acceptance ids such as `[IT-0029-AC4]`. `bun run matrix:ac` scans source for these tokens and does not run tests. Regenerate and commit `docs/specs/ac-evidence-matrix.md` after changing a `test.md` or a test title.
- Playwright runs with `workers: 1` and a shared data directory. The file name prefixes `z-`, `zz-`, `zzz-` order the specs and are load bearing.
- Database suites `test.skip` when their environment variables are missing, so a green run without them proves nothing about a real engine.

## Gotchas

- `tests/quality/foundation-acceptance.test.ts` spawns `ng build`, both dev servers on the fixed ports 4200 and 8080, lint, typecheck, and a nested `bun test`. It fails while `bun run dev` is running.
- `tests/contract/contract.test.ts` rewrites `packages/api-contract/src/generated/openapi.ts` and `tests/quality/verification-scripts.test.ts` writes a fixture into `packages/database-core/src/` during the run. A crash can leave a dirty tree.
- `bunfig.toml` preloads jsdom into every test file, so `window` and `document` exist in server tests too.

## Related specs

0002, 0004, 0053.

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
