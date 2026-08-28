# MyAdmin

## Stack

- **Language / Runtime**: TypeScript, Bun 1.4.0
- **Framework**: Angular 22.1+ for the web, Elysia for the server
- **Key dependencies**: `@ojiepermana/angular`, TypeBox, Bun SQL, `bun:sqlite`, CodeMirror 6
- **Package manager**: Bun

## Build approach

Fondasi dulu (fase A), lalu tiap feature sebagai irisan end to end, mengikuti urutan `struktur.md` bagian 7. Nomor feature = urutan build = nomor spec di `docs/specs/README.md`.

## Commands

```bash
# Install
bun install --frozen-lockfile

# Dev server
bun run dev

# Build
bun run build:web
bun run build:web:release

# Test
bun run test
bun run test:contract
bun run test:e2e
```

Quality gates include `bun run lint`, `bun run format:check`, `bun run typecheck`, `bun run check:boundaries`, and `bun run check:manifests`. Database integration tests need the disposable PostgreSQL or MySQL services and their environment variables.

## Specs

Specs live in `docs/specs/NNNN-title/` with `index.md`, `relation.md`, `test.md`, and `verify.md`. Build order and dependency meaning are indexed in `docs/specs/README.md`.

## Rules

- Apply Clean Architecture at module boundaries. Domain and application logic stay independent from frameworks and I/O, while outer layers implement inner ports.
- Use strict TypeScript, avoid `any`, keep public types explicit, and prefer exhaustive handling of closed unions.
- Keep exactly one root `package.json`. Treat `apps/*` and `packages/*` as source modules resolved by TypeScript aliases. Do not add nested manifests, Bun workspaces, Nx, or Turborepo without an accepted spec.
- Keep OpenAPI as the API source of truth. Generate contract types, keep Elysia routes aligned with the contract, and run contract drift checks after API changes.
- Angular feature code uses `@myadmin/sdk-angular`; do not use raw `fetch`, `HttpClient`, or API URL strings in feature components. Use `@ojiepermana/angular` as the single UI foundation and maintain a WCAG AA accessibility baseline.
- Keep `database-core` provider neutral. PostgreSQL and MySQL details belong in their provider modules and must not leak into core contracts.
- Validate configuration at startup. Redact credentials and tokens from logs, errors, audit details, WebSocket events, doctor output, and subprocess output.
- Use conventional commits. Git integration is active with `codex/` branch prefixes and commits per milestone. Pushes and pull requests require explicit confirmation.
- Use Bun tests for unit and integration coverage. Test domain logic without infrastructure doubles, and test infrastructure against disposable real systems when the acceptance criteria require it.

## Agent skills

- [angular-developer](/Users/ojiepermana/.agents/skills/angular-developer/): Angular standalone components, dependency injection, reactivity, forms, routing, accessibility, and builds
- [elysiajs](/Users/ojiepermana/.agents/skills/elysiajs/): Elysia server structure, typed validation, routes, and plugins
- [check](/Users/ojiepermana/.agents/skills/check/): runtime verification, acceptance evidence, and honest blockers
- [bun-sqlite](/Users/ojiepermana/.agents/skills/bun-sqlite/): Bun SQLite operations, prepared statements, transactions, and queries
- [playwright-cli](/Users/ojiepermana/.agents/skills/playwright-cli/): Playwright browser verification and local web testing

Declined: additional Agent Skill and MCP discovery

## Context files

<!-- Nested AGENTS.md files are listed here as they are created -->

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite._
