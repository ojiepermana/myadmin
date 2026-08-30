# Evidence 2026-08-30 — Shell and settings browser wave

## Command

```text
PLAYWRIGHT_HTML_OPEN=never bun run test:e2e -- \
  tests/e2e/web/z-shell-navigation.spec.ts \
  tests/e2e/web/ui-foundation-demo.spec.ts \
  tests/e2e/web/settings-preferences.spec.ts
```

## Result

```text
8 passed
1 skipped
14.1s
```

The passing browser checks cover account theme synchronization, light/dark/
system mode changes, panel resize and collapse, host-tab isolation, context
menu dismissal, protected-route navigation, keyboard-driven shell dialogs, and
the 1024px responsive breakpoint.

The skipped test is the dev-only foundation demo and is not counted as passing
visual evidence.

## Acceptance boundary

This is local Playwright evidence on the current browser profile. It supports
the exercised shell/settings E2E paths for Specs 0014, 0015, and 0052, but does
not replace full accessibility audit, cross-browser review, or manual sign-off.
