# Server (apps/server)

## Overview

Elysia HTTP and WebSocket server for MyAdmin. `src/app.ts` is the composition root: it builds the services, registers every feature route module, installs observability, and owns disposal. Each feature lives in `src/<feature>/` as a service file plus a `routes.ts`.

## Key files

| File                                    | Owns                                                                                                                                                                                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/app.ts`                            | `createServerApp` (production wiring, prefix `/api/v1`), `createApp` (contract test fixture, empty prefix), `startServer`, `disposeServerApp`, inline auth, setup, users, settings, audit, workspace, jobs routes, and the WebSocket route |
| `src/main.ts`                           | Standalone entry (`bun run health`). The CLI boots `createServerApp` directly from `apps/cli/src/bootstrap/runtime-lifecycle.ts`                                                                                                           |
| `src/connections/connection-manager.ts` | Connection CRUD, vault access, lifecycle sessions, `withConnectedProvider`, `withMutationProvider`                                                                                                                                         |
| `src/<feature>/routes.ts`               | `register<Feature>Routes(app, prefix, options)`; 13 modules today                                                                                                                                                                          |
| `src/realtime/websocket.ts`             | `RealtimeHub`; channels `jobs.<jobId>`, `connections.status`, `query.<executionId>`                                                                                                                                                        |

## Conventions

- Register a new route module in both `createServerApp` and `createApp`. `tests/contract/contract.test.ts` fails when OpenAPI operations and registered routes do not match one to one.
- Contract first: add the path under `packages/api-contract/openapi/v1/paths/`, use `x-myadmin-roles: [admin]` for admin only operations, then run `bun run bundle:contract`, `bun run check:contract-drift`, and `bun run security:authorization-matrix`.
- Auth is a per handler call, not middleware. Each `routes.ts` resolves the session from the `myadmin_session` cookie (`SESSION_COOKIE_NAME` in `@myadmin/auth`). Mutations require the header `x-myadmin-csrf: 1` plus a same origin check. The `/api/v1/*` catch all only covers unmatched paths, so a handler that skips the session check is unauthenticated until `tests/security/authorization/authorization-matrix.test.ts` catches it.
- Use `withConnectedProvider` for reads and DDL (needs a connected lifecycle session) and `withMutationProvider` for row mutations (opens a fresh connection from the saved secret).
- Every JSON response and WebSocket event passes `Redaction.redactObject`. Payload fields named `key`, `token`, `secret`, `password`, or `credential` become `[redacted]`.
- A service that starts a timer must expose `dispose()` and be added to `disposeServerApp`. Tests call `disposeServerApp` in `finally`.
- Test titles carry acceptance ids such as `[IT-0049-AC5]`; `bun run matrix:ac` scans source for them.
- Route tests build `new Elysia()` plus `register<Feature>Routes` with fakes; service tests fake the `Pick<>` dependencies.

## Gotchas

- `apiError` and `jsonResponse` now live in `src/http/` and every route module imports them (spec 0057 AC-8). The cookie, CSRF, and pagination helpers are still copied per module and have drifted (`docs/reviews/2026-09-04-audit-codebase.md`, SRV-2); until they move into `src/http/` too, copy the `app.ts` versions verbatim rather than writing a new variant.
- Correlation ids come from `getCorrelationId()` inside the shared `apiError`, so the id in an error response is the one observability logs for that request. Never read `x-correlation-id` off the request to build a response.
- `startServer` copies options by hand and omits several services. The CLI does not use it.

## Related specs

0003, 0004, 0017, 0029, 0053, 0056 (AC-8 to AC-11).

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
