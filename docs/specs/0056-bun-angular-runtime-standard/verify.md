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

## Slice 1, netralitas core dan batas modul, 2026-08-30

Langkah ini diturunkan dari AC-4 dan AC-10. Semua sudah dijalankan pada slice pertama; centang menandai bukti yang benar benar diamati, bukan rencana.

### Commands

- [x] `bun run typecheck` → exit 0, seluruh apps, packages, scripts, dan tests → AC-4, AC-10
- [x] `bun run lint` → exit 0 → AC-4, AC-10
- [x] `bun run check:boundaries` → `no dependency violations found (425 modules, 1656 dependencies cruised)`, termasuk enam aturan baru → AC-10
- [x] `bun test tests/quality/runtime-standard-0056.test.ts` → 9 pass, 0 fail → AC-4, AC-10
- [x] `bun run test` → 624 pass, 18 skip, 0 fail → AC-4, AC-10
- [x] `bun run test:contract` → 76 pass, 0 fail, termasuk `/jobs` dengan nama parameter kontrak → AC-10
- [x] `bun test scripts/build/packaging.test.ts` → 8 pass, 0 fail, jalur asset rilis tetap utuh setelah modul pindah → AC-10

### Pemeriksaan perilaku

- [x] Probe native tools dijalankan dari `@myadmin/native-tools`: tool yang tidak ada melaporkan `available: false` dengan alasan aman, tool nyata melaporkan versinya → AC-4
- [x] Graf modul nyata menunjukkan `packages/database-core/**` tidak memiliki dependency ke `node:fs` maupun `node:child_process` → AC-4
- [x] Tiap provider mendeklarasikan format artifact sendiri dan aturan header sendiri; executor tidak lagi mendekode nama engine → AC-4
- [x] `isDatabaseEngine` dari `@myadmin/kernel`, `@myadmin/database-core`, dan `@myadmin/internal-domain` adalah referensi fungsi yang sama → AC-4
- [x] Graf modul nyata menunjukkan nol edge dari `apps/server/**` ke `apps/cli/**` → AC-10
- [x] Graf modul nyata menunjukkan nol edge dari `packages/**` ke `apps/**` → AC-10
- [x] Graf modul nyata menunjukkan nol deep import lintas package; semua lewat `src/index.ts` → AC-10

### Belum dibuktikan pada slice ini

- [ ] AC-1, AC-2, AC-3 belum dikerjakan: port query typed, cancellation nyata sampai provider, dan timeout dari config.
- [ ] AC-7 dan AC-25 tetap membutuhkan smoke pada target binary rilis; belum dijalankan pada slice ini.
- [ ] Aturan larangan driver npm di core bersifat preventif: tidak ada driver npm di repo saat ini, jadi belum ada pelanggaran nyata yang membuktikannya menolak.

## Verdict

Keputusan diratifikasi engineer pada 2026-08-29; status di `index.md` menjadi `Accepted`. Ratifikasi hanya memberlakukan standarnya.

Slice 1 (AC-4 dan AC-10) sudah diimplementasikan dan dibuktikan lokal pada 2026-08-30 dengan bukti di atas. Dua puluh tiga AC lain tetap belum terbukti. Checklist Preflight, Runtime proof, Contract and browser proof, serta Release proof di atas tetap kosong sampai area masing masing dikerjakan dan dibuktikan pada environment yang sesuai.
