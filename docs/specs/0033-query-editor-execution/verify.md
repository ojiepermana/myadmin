# Verify 0033. Query editor: tab dan eksekusi

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Verdict**: Belum diverifikasi
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md)

## Ruang verifikasi

Verifikasi membuktikan perilaku implementasi terhadap seluruh acceptance criteria pada [test.md](test.md#acceptance-criteria). File ini tidak mengubah definisi AC dan tidak boleh diberi verdict lulus sebelum aplikasi, test, serta environment yang relevan benar benar dijalankan.

## Prasyarat eksekusi

| Kebutuhan     | Cara memeriksa                                                                   | Status awal                    |
| ------------- | -------------------------------------------------------------------------------- | ------------------------------ |
| Implementasi  | Build plan pada `index.md` selesai untuk slice yang diverifikasi.                | Tersedia; bukti lokal tercatat |
| Dependency    | Semua relation `requires` pada `relation.md` sudah diterima.                     | Belum diperiksa                |
| Root manifest | Tepat satu `package.json` ada di akar dan tidak ada manifest nested.             | Belum diperiksa                |
| Test plan     | Test ID relevan pada `test.md` sudah diimplementasikan.                          | Belum siap                     |
| Environment   | Service, database, browser, VM, certificate, atau akun yang dibutuhkan tersedia. | Belum diperiksa                |

## Matriks verifikasi AC

| AC                   | Test atau proof ID                            | Metode                              | Bukti wajib                                                                 | Result                                                                                                                                                                                                                                        |
| -------------------- | --------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [AC-1](test.md#ac-1) | `UT-0033-AC1`, `E2E-0033-AC1`                 | Unit, E2E                           | output command dan assertion                                                | Partial: `UT-0033-AC1` membuktikan descriptor tab serializable mempertahankan SQL, connection, database, schema, dan saved-query context; browser mock dan real query flow lulus, tetapi workflow penuh dan review visual tetap belum lengkap |
| [AC-2](test.md#ac-2) | `UT-0033-AC2`, `E2E-0033-AC2`, `VIS-0033-AC2` | Unit, E2E, Visual dan accessibility | output command dan assertion; screenshot dengan viewport dan state terkunci | Partial: unit policy membuktikan pemetaan dialek terpusat dan mode shortcut, browser editor flow lulus, dan screenshot editor lokal tersedia; formal accessibility/reviewer sign-off tetap belum ada                                          |
| [AC-3](test.md#ac-3) | `IT-0033-AC3`, `E2E-0033-AC3`                 | Integration, E2E                    | output command dan assertion                                                | Lulus lokal pada metadata route, popup CodeMirror, dan real browser workflow; full schema/table/column matrix tetap parsial                                                                                                                   |
| [AC-4](test.md#ac-4) | `UT-0033-AC4`, `IT-0033-AC4`, `CT-0033-AC4`   | Unit, Integration, Contract         | output command dan assertion                                                | Lulus lokal pada unit, route, contract, dan real browser workflow                                                                                                                                                                             |
| [AC-5](test.md#ac-5) | `IT-0033-AC5`                                 | Integration                         | output command dan assertion                                                | Lulus lokal pada tab-session integration dan real browser workflow                                                                                                                                                                            |
| [AC-6](test.md#ac-6) | `IT-0033-AC6`, `CT-0033-AC6`                  | Integration, Contract               | output command dan assertion                                                | Lulus lokal pada route dan contract; real query result flow juga lulus                                                                                                                                                                        |
| [AC-7](test.md#ac-7) | `IT-0033-AC7`                                 | Integration                         | output command dan assertion                                                | Lulus lokal pada history route dan real browser workflow                                                                                                                                                                                      |
| [AC-8](test.md#ac-8) | `UT-0033-AC8`, `CT-0033-AC8`                  | Unit, Contract                      | output command dan assertion                                                | Lulus lokal pada serialisasi unit dan contract; real browser workflow lulus                                                                                                                                                                   |
| [AC-9](test.md#ac-9) | `E2E-0033-AC9`                                | E2E                                 | output command dan assertion                                                | Lulus lokal pada dua engine: transaksi manual lintas eksekusi (`BEGIN`/`INSERT`/`ROLLBACK`) mempertahankan `tabSessionId`, dan multi-statement error menandai statement berikutnya skipped serta membawa posisi error                         |

## Urutan verifikasi

1. Catat commit, versi Bun, sistem operasi, dan environment yang benar benar dipakai.
2. Dari akar repo, jalankan pemeriksaan satu manifest, lint, typecheck, serta command test yang tersedia pada `package.json` akar.
3. Jalankan seluruh test ID pada matriks sesuai jenisnya. Jangan mengganti integration atau operational proof dengan mock.
4. Kumpulkan manual, staged, environment, atau external proof yang ditetapkan. Jangan menandainya lulus bila dependency belum tersedia.
5. Simpan evidence yang tersanitasi, lalu isi result per AC dan verdict akhir.

## Pemeriksaan otomatis

| Area                     | Command source                                        | Expected result                                                         |
| ------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------- |
| Unit                     | Script root yang didaftarkan pada satu `package.json` | Semua `UT-0033-*` lulus dan memiliki assertion yang menutup AC.         |
| Integration              | Script root yang didaftarkan pada satu `package.json` | Resource nyata disposable dipakai dan cleanup lulus.                    |
| Contract                 | Script root yang didaftarkan pada satu `package.json` | Semua `CT-0033-*` lulus dan memiliki assertion yang menutup AC.         |
| E2E                      | Script root yang didaftarkan pada satu `package.json` | Semua `E2E-0033-*` lulus dan memiliki assertion yang menutup AC.        |
| Visual dan accessibility | Script root yang didaftarkan pada satu `package.json` | Screenshot, viewport, mode warna, dan state yang disyaratkan tersimpan. |

## Pemeriksaan manual, staged, environment, atau external

Tidak ada manual atau external proof khusus yang diidentifikasi. Pemeriksaan reviewer tetap wajib untuk evidence otomatis.

## Catatan eksekusi

| 2026-08-30 | working tree | Playwright local web server | Query Editor E2E **1 passed dalam 8,4 detik** untuk autocomplete, execution, typed results, cancel, EXPLAIN, dan keyboard/ARIA result grid. | [Query editor E2E evidence](../evidence/2026-08-30-query-editor-e2e.md) |

| Waktu      | Commit       | Environment                                                                                             | Hasil                                                                                                                                                                                                                                                                                                | Evidence                                                                                                                                                                                                                                                                                                                                |
| ---------- | ------------ | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-30 | working tree | Bun 1.4.0, macOS arm64, PostgreSQL dan MySQL disposable                                                 | real E2E fokus query 4 pass, 0 skip, 0 fail; root regression terbaru **664 pass, 0 fail, 4.532 assertions**; contract 71 pass                                                                                                                                                                        | `docs/specs/evidence/2026-08-29-e2e.md` dan `docs/specs/evidence/2026-08-29-external.md`                                                                                                                                                                                                                                                |
| 2026-08-30 | working tree | Bun 1.4.0, PostgreSQL/MySQL disposable, native PostgreSQL wrapper                                       | Focused real query E2E **1 pass, 0 fail dalam 2,5 menit**; transaksi manual lintas eksekusi dan multi-statement error-position berjalan pada `tabSessionId` yang sama di kedua engine setelah PostgreSQL session dipin dengan reserved client                                                        | `MYADMIN_REAL_DATABASE_E2E=1 MYADMIN_TOOLS_PG_DUMP_PATH=$PWD/tests/fixtures/postgres-pg-dump.sh MYADMIN_TOOLS_PSQL_PATH=$PWD/tests/fixtures/postgres-psql.sh bunx playwright test tests/e2e/web/zz-real-query-editor.spec.ts --grep 'execute real database workflows'`; `packages/database-postgresql/test/postgresql-provider.test.ts` |
| 2026-08-30 | working tree | Bun 1.4.0, Playwright local web server, mock metadata fixture                                           | Query editor E2E **1 pass dalam 6,8 detik**; request `query/metadata?kind=objects` dan popup CodeMirror `orders` teramati, lalu query multi statement, cancel, EXPLAIN, typed result, clipboard, dan export tetap lulus                                                                              | `PLAYWRIGHT_HTML_OPEN=never bunx playwright test tests/e2e/web/zz-query-editor.spec.ts`                                                                                                                                                                                                                                                 |
| 2026-08-30 | working tree | Bun 1.4.0, query/realtime, data-browser/view acceptance slices                                          | **17 pass, 0 fail, 114 assertions**; lazy metadata, execution/history routes, transaction tab session, cancel idempotency, EXPLAIN, typed result/export, parameterized data queries, dan view safeguards lulus                                                                                       | `bun test --isolate tests/verification`                                                                                                                                                                                                                                                                                                 |
| 2026-08-30 | working tree | Bun 1.4.0, Playwright local web server, PostgreSQL 55433, MySQL 3380, development Angular configuration | **4 pass, 0 fail** dalam 2,5 menit; real query execution/cancel/EXPLAIN, data browser, dan dependent workflows lulus pada kedua engine. Angular menampilkan warning `NG0955` duplicate track keys pada view tertentu; tidak menyebabkan test failure dan dicatat sebagai follow-up UI quality issue. | `MYADMIN_REAL_DATABASE_E2E=1 MYADMIN_E2E_WEB_CONFIGURATION=development bunx playwright test --config playwright.config.ts tests/e2e/web/zz-real-query-editor.spec.ts`                                                                                                                                                                   |
| 2026-08-30 | working tree | Bun 1.4.0, Playwright local web server, PostgreSQL 55433, MySQL 3380, development Angular configuration | Setelah shared result grid memakai identity index, real query E2E **4 pass, 0 fail** dalam 3,2 menit; query, cancel, EXPLAIN, data browser/view, dan table-designer workflows lulus pada kedua engine. Tidak ada warning `NG0955` pada output run ini.                                               | `MYADMIN_REAL_DATABASE_E2E=1 MYADMIN_E2E_WEB_CONFIGURATION=development bunx playwright test --config playwright.config.ts tests/e2e/web/zz-real-query-editor.spec.ts`                                                                                                                                                                   |
| 2026-08-29 | working tree | Bun 1.4.0, local unit/integration/contract and mock browser                                             | Query/realtime slice dan service/contract tests **24 pass, 138 assertions**; query editor mock E2E lulus bersama typed result, cancel, EXPLAIN, dan export flow                                                                                                                                      | `bun test tests/verification/query-realtime-acceptance.test.ts apps/server/test/query-execution.test.ts tests/contract/query-execution.test.ts apps/web/test/result-grid.test.ts`; `bun run test:e2e -- tests/e2e/web/zz-query-editor.spec.ts`                                                                                          |

## Gap dan blocker

Rerun real pada 2026-08-30 setelah perbaikan identity loop template dan shared
result grid lulus **4 test, 0 gagal** dalam 3,2 menit tanpa warning `NG0955` pada
output run. Loop label/string dan kolom hasil kini memakai identity index saat
nilainya dapat berulang.

| AC         | Gap                                                                  | Dampak                            | Tindak lanjut                                             |
| ---------- | -------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------- |
| AC-1, AC-2 | Proof visual/formal accessibility dan review lengkap belum tersedia. | Verdict tetap belum diverifikasi. | Tambahkan visual/manual review bila environment tersedia. |

## Verdict akhir

Belum diverifikasi. Status ini hanya boleh berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau.
