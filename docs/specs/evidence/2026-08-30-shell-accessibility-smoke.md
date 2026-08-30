# Evidence 2026-08-30 — Shell accessibility smoke

## Command

```text
PLAYWRIGHT_HTML_OPEN=never bun run test:e2e -- \
  tests/e2e/web/z-shell-navigation.spec.ts \
  tests/e2e/web/settings-preferences.spec.ts \
  tests/e2e/web/monitoring-status.spec.ts
```

## Result

```text
9 passed
0 failed
14.3s
```

The run exercised keyboard focus and dialog dismissal, `aria-expanded`,
`aria-selected`, landmark visibility, context-menu roles, theme switching,
responsive sidebar behavior at the 1024px breakpoint, and monitoring status
rendering without polling. The tests also produced the configured screenshot
artifacts for the relevant shell states.

## Acceptance boundary

This is local Playwright smoke evidence for Specs 0014, 0015, and 0051. The
repository has no `axe-core` or equivalent automated WCAG audit dependency, so
this evidence does not claim formal WCAG conformance, contrast analysis,
cross-browser coverage, or manual accessibility sign-off.
