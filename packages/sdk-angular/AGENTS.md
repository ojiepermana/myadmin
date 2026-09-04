# SDK Angular (packages/sdk-angular)

## Overview

The only network boundary for the web app. `SdkTransport` (RxJS) is implemented by `HttpTransport` over `HttpClient`, wrapped by hand written facades typed from the generated OpenAPI types, and aggregated into `MyadminSdk`. The package also owns the realtime WebSocket client.

## Key files

| File                                                            | Owns                                                                                                                     |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `src/transport/transport.ts`, `src/transport/http-transport.ts` | Request options, `SdkError` normalization, 401 to session expired                                                        |
| `src/facades/<x>-client.ts`                                     | One facade per API area, typed from `operations['<operationId>']` and `components['schemas']` in `@myadmin/api-contract` |
| `src/providers/provide-myadmin-sdk.ts`                          | `provideMyadminSdk()` and the `MyadminSdk` aggregate                                                                     |
| `src/public-api.ts`                                             | Public exports                                                                                                           |
| `src/realtime/realtime-client.ts`                               | One multiplexed WebSocket at `${baseUrl}/ws`, backoff reconnect, close code 4001 stops reconnecting                      |

## Conventions

- Adding a facade: create `src/facades/<x>-client.ts` as a plain class that calls `inject(MYADMIN_SDK_TRANSPORT)`, export it in `public-api.ts`, register it in `provideMyadminSdk()`, and add it as a field on `MyadminSdk`. Facades are not `@Injectable`; a missing provider surfaces as a runtime `NullInjectorError`.
- `requiresSession: true` on a request drives both the CSRF header on non GET calls and the 401 to session expired handling.
- Regenerate types with `bun run generate:contract-types` after a contract change. `bun run check:contract-drift` fails on a stale generated file.

## Gotchas

- Facade paths are hand typed strings. Only `tests/contract` catches a path that drifts from OpenAPI.
- `subscribe()` on the realtime client returns an unsubscribe function that must be called on destroy. Connect and disconnect follow `AuthSessionStore.setUser` and `clear`.

## Related specs

0005, 0029, 0056 (AC-18).

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
