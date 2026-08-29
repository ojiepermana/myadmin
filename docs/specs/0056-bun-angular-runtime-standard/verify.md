# Verify 0056. Standar runtime Bun dan reaktivitas Angular

Dokumen ini adalah rencana pembuktian. Semua checklist tetap kosong sampai bukti benar benar dijalankan.

## Preflight

1. [ ] Working tree dan branch diverifikasi sebelum setiap milestone.
2. [ ] Bun `1.4.0`, Angular `22.1.x`, dan dependency lock terverifikasi.
3. [ ] Lima target packaging dicatat, termasuk target yang tidak tersedia pada host.
4. [ ] Daftar client query dan generic jobs disimpan sebelum cutover.
5. [ ] Retention matrix, restart outcome, idempotency scope, dan unknown version behavior disepakati sebelum contract cutover.

## Runtime proof

1. [ ] Bun SQL provider test membuktikan binding typed, timeout, cancel nyata, retry, close, dan state terminal untuk PostgreSQL.
2. [ ] Bun SQL provider test membuktikan binding typed, timeout, cancel nyata, retry, close, dan state terminal untuk MySQL.
3. [ ] Asset, log, export, import, backup, dan restore yang sudah dimigrasikan membuktikan stream, backpressure, client abort, partial write cleanup, error, dan cleanup.
4. [ ] Composition test membuktikan production dan contract fixture memakai module factory yang sama.
5. [ ] Shutdown test membuktikan urutan lifecycle, penolakan request baru, flush sink, penutupan provider, dan idempotent cleanup.

## Contract and browser proof

1. [ ] OpenAPI v2, generated types, route registry, SDK, dan event contract lulus drift check.
2. [ ] Contract test v1 dan v2 lulus selama persiapan cutover.
3. [ ] Query serta generic jobs mengembalikan operation resource yang seragam, termasuk progress, timestamps, result, error, cancellation, dan idempotency.
4. [ ] Explain tetap sinkron, retention serta restart mengikuti matrix, dan owner only, admin audit, CSRF, redaction, audit, serta correlation id lulus pada behavior nyata.
5. [ ] WebSocket membuktikan version pada subscribe, event, reconnect, dan mismatch rejection.
6. [ ] Angular build dan focused DOM tests lulus dengan zoneless serta membuktikan loading, ready, empty, error, refreshing, stale, `aria-busy`, live region, focus, dan superseded abort.
7. [ ] Playwright membuktikan loading, empty, error, stale, refresh, cancel, keyboard, focus, dan custom capability gap.

## Release proof

1. [ ] Semua target binary yang tersedia lulus smoke test.
2. [ ] Baseline serta hasil pengukuran jalur panas dicatat tanpa klaim speedup yang tidak terbukti.
3. [ ] Exception register ditinjau dan setiap entry memiliki owner serta review date.
4. [ ] Cutover v2 hanya dilakukan setelah semua gate di atas lulus dan v1 dihapus sesuai switch sekali.
5. [ ] Rollback ke artefak rilis sebelumnya diuji atau dinyatakan blocked dengan alasan environment.

## Verdict

Belum ada verdict. Spec standalone baru menjadi `Accepted` setelah engineer meratifikasi keputusan. Adopsi code dan bukti runtime tetap mengikuti status feature slice yang akan didaftarkan pada scope.
