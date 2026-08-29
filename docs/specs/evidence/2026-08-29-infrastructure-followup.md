# Infrastructure follow-up evidence — 2026-08-29

This evidence was collected from the current working tree after the infrastructure follow-up changes. It is separate from the earlier baseline E2E report.

Commands:

```text
bunx playwright test tests/e2e/web/z-connection-manager.spec.ts tests/e2e/web/zz-connection-lifecycle.spec.ts tests/e2e/web/zzz-jobs-infrastructure.spec.ts --reporter=line
bun test tests/integration/realtime/realtime.test.ts
```

Results:

- `E2E-0026-AC10`: targeted Playwright run passed; the browser flow covers PostgreSQL and MySQL engine forms and generated `test-results/visual-0026-ac10.png` at 1280x720.
- `VIS-0026-AC10`: targeted Playwright run passed and generated `test-results/visual-0026-ac10.png` at 1280x720.
- `E2E-0027-AC7`: targeted Playwright run passed and generated `test-results/visual-0027-ac7.png` at 1280x720.
- `VIS-0027-AC7`: targeted Playwright run passed and generated `test-results/visual-0027-ac7.png` at 1280x720.
- `E2E-0028-AC6`: targeted Playwright run passed; the UI reported that a tracked job ended after the server restart simulation.
- `E2E-0029-AC4`: targeted Playwright run passed; the browser observed the realtime WebSocket opening.
- `IT-0029-AC1`: realtime integration test passed.
- `IT-0029-AC2`: realtime integration test passed.
- `IT-0029-AC3`: realtime integration test passed.
- `IT-0029-AC5`: realtime integration test passed.
- `IT-0029-AC8`: realtime integration test passed.

The visual files are run artifacts under `test-results/`; they are not claims of visual proof for unrelated specs.
