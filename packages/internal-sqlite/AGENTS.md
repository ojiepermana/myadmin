# Internal SQLite (packages/internal-sqlite)

## Overview

`bun:sqlite` adapter for MyAdmin's own data: users, sessions, connections, credentials, audit, query history, settings, and workspaces. Ports live in `packages/internal-domain`, fakes in `packages/testkit`.

## Key files

| File                                                         | Owns                                                                                          |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `src/database/connection.ts`, `pragmas.ts`, `transaction.ts` | One connection, WAL, foreign keys, savepoint nesting                                          |
| `src/migrations/migration-runner.ts`                         | Sequential, versioned, SHA-256 checksummed migrations; the `migrations` array is the registry |
| `src/migrations/0001-initial.ts`                             | Schema; the audit table is append only through triggers                                       |
| `src/repositories/unit-of-work.ts`                           | `SqliteUnitOfWork` composing the repositories                                                 |
| `src/repositories/shared.ts`                                 | Helpers such as `prepare`, `pageOf`, `toIso`                                                  |

## Commands

```bash
# Package tests plus tests/integration/internal-sqlite
bun run test:internal-sqlite

# Inspect applied migrations in a data directory
bun run myadmin migrate --status
```

## Conventions

- Add a migration as `src/migrations/NNNN-name.ts` with the next `version`, a `name`, `checksumSource` (the SQL text), and `up`, then register it in the `migrations` array. Never edit an applied migration: a checksum mismatch fails boot.
- Add a repository by declaring the port in `packages/internal-domain/src/ports/repositories/index.ts`, implementing `Sqlite<X>Repository`, wiring it into `SqliteUnitOfWork`, and adding a `Fake<X>Repository` in `packages/testkit/src/fakes/internal-repositories.ts`. A test asserts that every port has a fake.
- Real SQLite tests use `new Database(':memory:')`, `runMigrations`, then `new SqliteUnitOfWork(db)`.
- `transaction()` is synchronous. Do not pass an `async` callback; it would commit before the work finishes.

## Gotchas

- The adapter imports `SettingsService` from `@myadmin/settings` (unit of work) and `Redaction` from `@myadmin/crypto` (query history). This inverts the dependency direction and the audit recommends fixing it (INF-6). Do not add more application imports here.
- `apps/server/src/app.ts` creates more than one `SqliteUnitOfWork` over the same database, each with its own settings cache.

## Related specs

0008, 0009, 0019, 0030, 0036.

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
