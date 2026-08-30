# Evidence 2026-08-30 — Result grid performance E2E

## Command

```text
PLAYWRIGHT_HTML_OPEN=never bun run test:e2e -- \
  tests/e2e/web/zz-result-grid-performance.spec.ts
```

## Result

```text
ResultGrid 5000-row render: 81.9ms
1 passed (7.3s)
```

The browser test rendered 5,000 typed rows through the virtual result grid and
checked the related accessibility and interaction behavior.

## Acceptance boundary

This is a local Playwright performance observation on the current host. It
supports the local performance evidence for Spec 0034, but is not a stable
cross-machine production benchmark or external performance sign-off.
