# Evidence 2026-08-30 — Query editor E2E wave

## Command

```text
PLAYWRIGHT_HTML_OPEN=never bun run test:e2e -- tests/e2e/web/zz-query-editor.spec.ts
```

## Result

```text
1 passed (8.4s)
```

The browser flow covers query-editor autocomplete, multi-statement execution,
cancel, EXPLAIN success and failure, typed result rendering, truncated/null
values, result-grid keyboard navigation and ARIA attributes, clipboard copy,
and full-result export job queuing.

## Acceptance boundary

This is local Playwright evidence using deterministic API fixtures. It supports
the relevant local E2E and visual proof IDs for Specs 0033, 0034, 0035, and
0047, but does not replace real-provider, performance-scale, manual, or
external acceptance evidence.
