# Web (apps/web)

## Overview

Angular 22 standalone application. It runs zoneless, declared explicitly with `provideZonelessChangeDetection()` in `app.config.ts`. Feature pages are lazy loaded from `V1_ROUTE_DEFINITIONS`, shared signal stores live in `src/app/core/`, and every API call goes through `@myadmin/sdk-angular`.

## Key files

| File                                                | Owns                                                                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `src/app/app.config.ts`                             | Providers: `provideZonelessChangeDetection()`, router, `provideMyadminSdk()`, theme, `AppErrorHandler`             |
| `src/app/app.routes.shared.ts`                      | `V1_ROUTE_DEFINITIONS`, guards, lazy loaders (a nested ternary keyed by route id)                                  |
| `src/app/app.routes.ts`, `app.routes.production.ts` | The production build replaces the dev file through `angular.json` fileReplacements and drops `__dev/ui-foundation` |
| `src/app/core/state/workspace.store.ts`             | Tabs and panels, `WorkspaceTabType`                                                                                |
| `src/app/core/errors/error-presenter.service.ts`    | Toast plus `FeatureErrorBoundaryComponent` around the router outlet                                                |
| `src/app/features/<name>/`                          | One page component per feature (`<name>.ts`, `<name>.html`)                                                        |
| `src/app/shared/database-components/`               | Result grid, destructive action confirmation, table operation dialog                                               |

## Commands

```bash
# One suite
bun test apps/web/test/<file>.test.ts

# Playwright (boots 8080 and 4200 with reuseExistingServer false)
bun run stop:ports && bun run test:e2e
```

## Conventions

- Render state flows through signals. Callbacks from timers, WebSocket, and CodeMirror must `.set()` a signal. Wrap non reactive reads inside `effect()` with `untracked()`.
- Adding a page touches `V1_ROUTE_DEFINITIONS` and its loader, `WorkspaceTabType`, the nav group in `layout/app-shell/app-shell.ts`, the icon `@case` in `app-shell.html`, and for query param scoped tabs the `syncRouteTab` list and `persistableContext` keys in `workspace.store.ts`.
- Read route params reactively (`route.queryParamMap` with `takeUntilDestroyed`, or `toSignal`). Several pages still read `route.snapshot` in field initializers and do not refresh on same route navigation.
- Success notices use `role="status"`. Only real errors use `role="alert"`.
- UI comes from `@ojiepermana/angular/component/<name>`. `scripts/quality/check-ui-boundary.ts` rejects `app/shared/*.component.ts` names that contain generic words such as button, dialog, table, or tree. Name domain components after the domain.
- No `fetch(`, `HttpClient` import, or string literal starting with `/api` anywhere under `apps/web`, including tests and templates. `bun run check:boundaries` fails otherwise.

## Gotchas

- Component tests need `import '@angular/compiler'` first, `TestBed.initTestEnvironment(...)`, and `await ɵresolveComponentResources(...)` because Bun does not inline `templateUrl`. See `src/app/app.test.ts`.
- `bunfig.toml` preloads jsdom into every test file. `bun run test` builds the app before running tests.
- Bundle budget is 900 kB warning and 1 MB error on the initial bundle, and the production build is at about 863 kB, so headroom is about 4 percent. Run `bun run analyze:bundle` after `bun run build:web` to see the composition before adding a dependency.

## Related specs

0005, 0014, 0015, 0056 (AC-18 to AC-22).

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
