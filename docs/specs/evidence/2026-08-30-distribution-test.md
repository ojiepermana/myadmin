# Evidence 2026-08-30 — Distribution test wave

## Scope

Spec 0055 distribution and release test implementation. This evidence records
the local automated test wave and does not replace hosted release, signing,
native service-host, or clean-platform acceptance evidence.

## Command

```text
bun test --isolate --timeout 30000 \
  tests/quality/distribution-release.test.ts \
  scripts/release/changelog.test.ts \
  scripts/build/packaging.test.ts
```

## Result

```text
22 pass
0 fail
105 expect() calls
Ran 22 tests across 3 files. [443.00ms]
```

The wave covers release metadata and changelog rendering, checksum and
packaging invariants, conditional signing gates, Docker runtime/tools security
invariants, service templates, operator documentation, and the security
workflow gate.

Latest rerun from the current checkout:

```text
22 pass
0 fail
105 expect() calls
Ran 22 tests across 3 files. [311.00ms]
```

The rerun used the same three source suites and produced the same green result.

## Remaining acceptance boundary

This local result supports the 0055 Test checklist, but Verify remains open:
GitHub Release publication, Apple/Windows signing and notarization, native
systemd/launchd host acceptance, and installation from a real release artifact
on clean platforms still require their respective external environments.
