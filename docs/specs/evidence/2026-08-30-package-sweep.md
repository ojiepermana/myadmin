# Package test sweep — 2026-08-30

Working-tree verification from the MyAdmin repository.

Command:

```text
bun test --isolate packages/*/test
```

Result: **223 pass, 0 fail, 838 assertions** across 38 package test files in
4.08 seconds.

The sweep covered settings, crypto/configuration, audit, jobs, import/export,
backup/restore, database-core, PostgreSQL, and MySQL provider behavior. This is
local package evidence; it does not prove hosted CI, clean-platform behavior,
signing, publication, or manual acceptance.

Additional root quality gates on the same working tree also passed on 2026-08-30:

- `bun run lint`
- `bun run check:boundaries` — 418 modules and 1,641 dependencies checked, no violations.
- `bun run check:manifests` — only `./package.json` detected.
- `bun run format:check`
- `bun run typecheck`

These gates support repository quality evidence only and do not convert hosted CI,
browser visual review, external release, or manual acceptance into local proof.

The local rehearsal of the ordered `contract.yml` and `security.yml` steps also
passed on 2026-08-30: frozen install made no changes; contract validation,
bundling, generated-type drift, secret scan, authorization matrix check, and
security suite completed successfully. The security suite reported **40 pass,
0 fail, and 968 assertions**. `act` was not installed, so this is a local
workflow rehearsal and not hosted CI evidence.

The latest root regression command `bun test --isolate --timeout=10000
--path-ignore-patterns='tests/e2e/**/*.spec.ts'` also passed on 2026-08-30:
**615 pass, 18 skip, 0 fail, and 4,095 assertions** across 151 files in 108.11
seconds. The 18 skips are environment-dependent PostgreSQL/MySQL fixture,
performance, or native roundtrip tests and remain explicitly unproven in this
run.
