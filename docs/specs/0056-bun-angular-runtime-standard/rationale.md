# Rationale 0056. Standar runtime Bun dan reaktivitas Angular

## Context

> ⚠️ Premise note: Topik ini mencakup enam keputusan yang bisa dibangun terpisah, termasuk satu cutover kontrak API. Menyatukannya sebagai satu rewrite akan memperbesar blast radius. Spec ini menjadi umbrella standard, child spec memisahkan keputusan per area, dan cutover publik dibatasi pada query serta generic jobs.

Repo memiliki 466 source file, satu root `package.json`, Bun `1.4.0`, Angular `22.1.x`, Elysia `1.4.x`, TypeBox, Bun SQL, `bun:sqlite`, dan `@ojiepermana/angular`. Scope memakai urutan fondasi lalu feature sebagai irisan end to end. Tidak ada row scope khusus untuk standard lintas modul ini.

Audit saat ini menemukan kemampuan native sudah dipakai, tetapi jalurnya belum seragam. Provider PostgreSQL dan MySQL masih memberi caller pilihan string SQL, ada parameter handling manual, dan adapter MySQL memakai `unsafe`. Logging memakai operasi filesystem sync. Penyajian asset membaca file penuh lewat `node:fs/promises`. Export, import, dan backup masih memiliki jalur I/O yang perlu dipetakan ke streaming Bun.

Di sisi server, `apps/server/src/app.ts` masih memuat composition root, lifecycle cleanup, registrasi route, timer, dan assembly fixture yang sebagian besar diulang. Di sisi Angular, signals telah dipakai, tetapi read model masih bercampur dengan `firstValueFrom`, subscription manual, loading flag, counter stale, polling, dan stop map. Tidak ada kebijakan zoneless atau aturan resource yang menjadi sumber kebenaran. OpenAPI, validator registry, Elysia route, generated types, SDK path, dan WebSocket event juga belum memiliki traceability tunggal.

Jika hal ini tidak diputuskan, implementasi baru akan terlihat modern pada satu feature tetapi tetap mempunyai jalur lama di feature lain. Timeout dapat hanya menghentikan penantian, UI dapat menampilkan state yang tidak sama dengan provider, dan perubahan endpoint dapat membuat kontrak, SDK, event, serta fixture tidak sinkron.

## Options considered

### Option 1: Ratchet standard dengan cutover terkoordinasi

Tetapkan pola kanonis lintas enam area, wajibkan pada kode baru, migrasikan kode lama dalam urutan dependency, dan lakukan cutover kontrak query serta generic jobs dalam satu rilis setelah bukti lengkap.

**Pros**:

1. Memakai port compile time dan check deterministik tanpa memaksa satu PR raksasa.
2. Sesuai dengan stack dan skill yang sudah ada.
3. Memberi ruang untuk test nyata per area dan rollback artefak.

**Cons**:

1. Tim perlu memelihara standard, child spec, inventaris, serta register pengecualian.
2. Periode persiapan harus memahami dua bentuk kontrak.
3. Cutover sekali tetap memiliki risiko client yang tidak terinventaris.

### Option 2: Satu migration PR untuk semua area

Semua penggunaan lama, komposisi server, contract surface, Angular state, dan UI dipindahkan dalam satu perubahan terkoordinasi.

**Pros**:

1. Hasil akhir lebih cepat terlihat seragam.
2. Tidak ada periode panjang ketika dua pola hidup bersamaan.

**Cons**:

1. Ukuran perubahan sulit direview dan dibuktikan pada 466 source file.
2. Failure pada provider, browser, atau target binary dapat tertutup oleh perubahan lain.
3. Rollback menjadi lebih sulit karena banyak boundary berubah bersama.

### Option 3: Dokumentasi tanpa enforcement

Tuliskan pedoman native Bun dan Angular, tetapi serahkan adopsi pada review manual tiap feature.

**Pros**:

1. Biaya awal paling rendah.
2. Tidak menambah check atau adapter.

**Cons**:

1. Tidak mencegah pola lama muncul kembali.
2. Tidak memberi bukti bahwa cancellation menghentikan operasi nyata.
3. Tidak menyelesaikan drift OpenAPI, Elysia, SDK, dan event.

## Rationale

Option 1 dipilih karena kebutuhan utama adalah konsistensi runtime dan bukti, bukan sekadar mengganti nama API. Port menjaga database core tetap provider neutral, sementara adapter dapat memakai Bun SQL dan mekanisme cancellation provider tanpa membocorkan detail ke domain. Ini selaras dengan spec 0021, 0022, 0024, dan aturan Clean Architecture pada `AGENTS.md` (basis: `AGENTS.md`, spec 0021, spec 0022, dan spec 0024).

Engineer memilih pemakaian API native stabil Bun 1.4, SDK resource facade, serta zoneless. Pilihan itu masuk akal untuk codebase yang sudah berada pada Angular 22, tetapi zoneless memiliki blast radius lebih besar daripada resource facade. Karena itu gate zoneless dibuat per feature dan seluruh target rilis harus diuji, bukan diasumsikan aman dari build host saja (basis: `angular-developer`, `playwright-cli`, dan praktik progressive rollout).

Engineer juga memilih rombak resource dan payload query serta generic jobs dengan header version, lalu switch sekali. Ini adalah breaking change yang disengaja. Risiko big bang dikurangi dengan membatasi permukaan, menjalankan contract test v1 dan v2 selama persiapan, mengharuskan idempotency key, dan memakai rollback artefak. Import, export, backup, restore, dan feature lain tidak ikut dirombak agar perubahan tidak melebar (basis: spec 0003, spec 0004, spec 0028, spec 0029, spec 0033, dan prinsip strangler migration).

Enforcement memakai kombinasi compile time, check deterministik, dan test karena satu linter tidak dapat menilai semantik cancellation, provider capability, atau state Angular. Dokumentasi saja terlalu lemah, sedangkan satu migration PR terlalu besar untuk bukti yang jujur. Baseline performa dipakai untuk jalur panas, tetapi tidak ada target speedup global tanpa pengukuran (basis: `AGENTS.md`, spec 0002, spec 0013, dan praktik measurement before optimization).

## Audit evidence inventory

| Area                        | Bukti current state                                                                                                                                                                                                               | Keputusan child                                              |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| A. Bun SQL dan cancellation | `packages/database-postgresql/src/driver/bun-sql.ts`, `packages/database-mysql/src/driver/client.ts`, `packages/database-*/src/query`                                                                                             | [0056-bun-sql-cancellation.md](0056-bun-sql-cancellation.md) |
| B. Bun I/O                  | `packages/observability/src/logger.ts`, `apps/cli/src/static-web/serve-assets.ts`, `packages/export/src/index.ts`, `packages/import/src/index.ts`, `packages/backup/src/executor.ts`                                              | [0056-bun-io.md](0056-bun-io.md)                             |
| C. Angular state            | `packages/sdk-angular/src/transport/http-transport.ts`, `packages/sdk-angular/src/facades/query-client.ts`, `apps/web/src/app/features/connections/connections.ts`, `apps/web/src/app/features/object-explorer/explorer.store.ts` | [0056-angular-reactivity.md](0056-angular-reactivity.md)     |
| D. Elysia lifecycle         | `apps/server/src/app.ts`, route modules di `apps/server/src`                                                                                                                                                                      | [0056-elysia-lifecycle.md](0056-elysia-lifecycle.md)         |
| E. Contract traceability    | `packages/api-contract/openapi/v1/openapi.yaml`, `packages/api-contract/scripts/validate-contract.ts`, `apps/server/src/query/routes.ts`, SDK facades                                                                             | [0056-contract-operations.md](0056-contract-operations.md)   |
| F. UI foundation            | `docs/architecture/ui-foundation-capability-audit.md`, table designer, object explorer                                                                                                                                            | [0056-ui-foundation.md](0056-ui-foundation.md)               |

## References

**Project sources**:

1. `AGENTS.md`, terutama aturan satu manifest, Clean Architecture, OpenAPI source of truth, Bun tests, provider neutral core, dan redaction.
2. `docs/scope/scope.md`, urutan fondasi dan feature end to end.
3. `docs/specs/README.md`, struktur companion spec dan evidence.
4. Spec 0002, 0003, 0004, 0005, 0013, 0014, 0021, 0022, 0024, 0028, 0029, 0033, 0035, 0053, 0054, dan 0055.
5. Skill `angular-developer`, `elysiajs`, `develop`, `check`, dan `playwright-cli`.

**Practices & standards**:

1. Typed ports and adapters untuk menjaga dependency direction.
2. Idempotency key untuk command yang dapat diulang.
3. Strangler migration dan rollback artefak untuk perubahan kontrak bertahap.
4. Redaction by default untuk payload, error, event, dan log.
5. Measurement before optimization untuk klaim performa.
6. Progressive rollout dengan exception register untuk perubahan global.

**Links**:

1. Angular `resource`: https://angular.dev/api/core/resource
2. Angular `httpResource`: https://angular.dev/api/common/http/httpResource
3. Angular zoneless: https://angular.dev/guide/zoneless
4. Elysia current guidance: https://elysiajs.com/llms.txt
