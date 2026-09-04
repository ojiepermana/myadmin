# Database core and providers

## Overview

`database-core` holds the provider neutral contracts, capability keys, registry, and `DbError`. `database-postgresql` and `database-mysql` implement them over Bun SQL. Dependency cruiser forbids core importing a provider or a driver, providers importing each other, and deep imports across packages.

## Key files

| File                                                                                                      | Owns                                                                                         |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `packages/database-core/src/contracts/provider.ts`                                                        | `DatabaseProvider`: `connection` and `capability` are required, every other port is optional |
| `packages/database-core/src/capabilities/index.ts`                                                        | The closed capability key list                                                               |
| `packages/database-core/src/errors/index.ts`                                                              | `DbError`, `unsupportedError()`                                                              |
| `packages/kernel/src/database/engine.ts`                                                                  | The single `DatabaseEngine` definition; core re exports it                                   |
| `packages/database-postgresql/src/connection/postgresql-connection.ts`                                    | Pool per handle, `reserve()`, `pg_backend_pid`, `executeParameterized`                       |
| `packages/database-mysql/src/driver/mysql-connection.ts`                                                  | Pool per handle, `CONNECTION_ID()`, `KILL QUERY`                                             |
| `packages/database-postgresql/src/metadata/quoting.ts`, `packages/database-mysql/src/metadata/quoting.ts` | `quotePostgresqlIdentifier`, `quoteMysqlIdentifier`                                          |

## Commands

```bash
# Unit tests with fakes
bun run test:database-core && bun run test:database-postgresql && bun run test:database-mysql

# PostgreSQL integration (18.1 on 55433, 17.7 on 55432)
docker compose -f tests/environments/docker-compose.test.yml up -d
MYADMIN_POSTGRES_INTEGRATION=1 bun run test:database-postgresql:integration

# MySQL integration (compose file in tests/environments/mysql/)
MYSQL_8_0_URL=... MYSQL_LATEST_URL=... bun run test:database-mysql:integration
```

Without the environment variables the integration suites `test.skip`, so a green run proves nothing about a real engine. Security suites need `MYADMIN_POSTGRES_SECURITY_INTEGRATION=1` or `MYADMIN_MYSQL_SECURITY_INTEGRATION=1`.

## Conventions

- Always quote identifiers with the provider quoting helper. Never interpolate user values: PostgreSQL binds through `executeParameterized`, MySQL through `connection.execute(sql, params)`.
- A new engine starts at `DatabaseEngine` in kernel, then a `create<X>Provider()` registered in `apps/server/src/app.ts`. Implement only the ports the engine supports, set the rest to `false` in its capabilities, and throw `unsupportedError()` from unsupported calls.
- Unit test adapters by injecting `sqlFactory` fakes. `packages/testkit` provides `FakeDatabaseProvider`.
- Call `metadata.invalidateCache(handle)` after DDL on PostgreSQL (30 second cache per handle). MySQL has no metadata cache.

## Gotchas

- PostgreSQL ports split SQL text on `?` to bind values, so a literal `?` outside a placeholder (a column comment, a jsonb operator) breaks at apply time. Spec 0056 AC-1 replaces this mechanism.
- Write `ESCAPE '\'` so that the runtime string holds exactly one backslash. Inside a template literal `'\\\\'` yields two and PostgreSQL rejects the query (audit finding DB-1).
- MySQL DDL is not transactional: `TableDdlApplyResult.transactional` is `false` and earlier statements stay applied after a failure.
- PostgreSQL `client.begin()` takes a different pooled connection than `reserve()`, so transaction statements do not run on the pinned session (audit finding DB-5).
- Passing a `ConnectionContext` instead of a `ConnectionHandle` opens and closes a whole pool per call. Prefer handles.

## Related specs

0021 to 0025, 0056 (AC-1 to AC-4).

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
