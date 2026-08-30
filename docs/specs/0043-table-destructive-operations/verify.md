# Verify 0043. Operasi destructive table

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

| AC                   | Test atau proof ID                                                          | Metode                                     | Bukti wajib                                                | Result                                                                                                                                                                                                   |
| -------------------- | --------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [AC-1](test.md#ac-1) | `UT-0043-AC1`, `IT-0043-AC1`, `CT-0043-AC1`, `E2E-0043-AC1`                 | Unit, Integration, Contract, E2E           | output command dan assertion                               | Parsial lokal; real provider dan real-browser rename lulus pada PostgreSQL dan MySQL, UI dialog penuh belum                                                                                              |
| [AC-2](test.md#ac-2) | `UT-0043-AC2`, `IT-0043-AC2`, `CT-0043-AC2`, `E2E-0043-AC2`, `SEC-0043-AC2` | Unit, Integration, Contract, E2E, Security | output command dan assertion; log tersanitasi tanpa secret | Parsial lokal; truncate real-engine dan exact confirmation browser lulus, security/audit penuh belum                                                                                                     |
| [AC-3](test.md#ac-3) | `IT-0043-AC3`, `CT-0043-AC3`, `E2E-0043-AC3`, `SEC-0043-AC3`                | Integration, Contract, E2E, Security       | output command dan assertion; log tersanitasi tanpa secret | Provider SQL/impact, contract, confirmation/audit route, dan real-browser destructive flow tersedia; full provider-error E2E/security matrix masih belum                                                 |
| [AC-4](test.md#ac-4) | `IT-0043-AC4`, `CT-0043-AC4`, `SEC-0043-AC4`                                | Integration, Contract, Security            | output command dan assertion; log tersanitasi tanpa secret | Server audit/confirmation test dan contract lulus; audit real-engine/browser serta security matrix penuh masih belum                                                                                     |
| [AC-5](test.md#ac-5) | `UT-0043-AC5`, `E2E-0043-AC5`                                               | Unit, E2E                                  | output command dan assertion                               | Unit registry membuktikan tiga aksi dan offline gating; real browser kedua engine kini juga memverifikasi audit `table.renamed`, `table.truncated`, dan `table.dropped`, sementara stale-tab proof belum |
| [AC-6](test.md#ac-6) | `IT-0043-AC6`, `E2E-0043-AC6`, `SEC-0043-AC6`                               | Integration, E2E, Security                 | output command dan assertion; log tersanitasi tanpa secret | Real-browser rename/truncate/drop flow, audit event, dan mock-browser stale-tab marker lulus; security matrix penuh masih belum                                                                          |

## Urutan verifikasi

1. Catat commit, versi Bun, sistem operasi, dan environment yang benar benar dipakai.
2. Dari akar repo, jalankan pemeriksaan satu manifest, lint, typecheck, serta command test yang tersedia pada `package.json` akar.
3. Jalankan seluruh test ID pada matriks sesuai jenisnya. Jangan mengganti integration atau operational proof dengan mock.
4. Kumpulkan manual, staged, environment, atau external proof yang ditetapkan. Jangan menandainya lulus bila dependency belum tersedia.
5. Simpan evidence yang tersanitasi, lalu isi result per AC dan verdict akhir.

## Pemeriksaan otomatis

| Area        | Command source                                        | Expected result                                                  |
| ----------- | ----------------------------------------------------- | ---------------------------------------------------------------- |
| Unit        | Script root yang didaftarkan pada satu `package.json` | Semua `UT-0043-*` lulus dan memiliki assertion yang menutup AC.  |
| Integration | Script root yang didaftarkan pada satu `package.json` | Resource nyata disposable dipakai dan cleanup lulus.             |
| Contract    | Script root yang didaftarkan pada satu `package.json` | Semua `CT-0043-*` lulus dan memiliki assertion yang menutup AC.  |
| E2E         | Script root yang didaftarkan pada satu `package.json` | Semua `E2E-0043-*` lulus dan memiliki assertion yang menutup AC. |
| Security    | Script root yang didaftarkan pada satu `package.json` | Semua `SEC-0043-*` lulus dan memiliki assertion yang menutup AC. |

## Pemeriksaan manual, staged, environment, atau external

Tidak ada manual atau external proof khusus yang diidentifikasi. Pemeriksaan reviewer tetap wajib untuk evidence otomatis.

## Catatan eksekusi

| 2026-08-30 | working tree | Playwright local web server dengan API fixture | Table Designer UI **11 passed dalam 10,6 detik**; exact confirmation, dependency review, truncate, rename, dan stale-tab state lulus. | [Table Designer UI evidence](../evidence/2026-08-30-table-designer-ui.md) |

| 2026-08-30 | working tree | Playwright dengan PostgreSQL dan MySQL disposable | Real workflow E2E **4 passed dalam 2,6 menit** mencakup destructive database/schema/index operation paths dan confirmation flow yang diuji. | [Real query workflow evidence](../evidence/2026-08-30-real-query-workflows.md) |

| 2026-08-30 | Working tree | PostgreSQL 55433 dan MySQL 8.0/latest 3380/3384, disposable fixtures | **3 pass, 0 fail, 24 assertions**; service aktual menjalankan impact, truncate, rename, drop, metadata invalidation, dan audit event `table.truncated`, `table.renamed`, `table.dropped` pada ketiga target | `MYADMIN_POSTGRES_INTEGRATION=1 MYSQL_8_0_URL='mysql://root:<fixture-root-password>@127.0.0.1:3380/fixture?ssl=disable' MYSQL_LATEST_URL='mysql://root:<fixture-root-password>@127.0.0.1:3384/fixture?ssl=disable' bun test --isolate tests/integration/table-operations/real-table-operations.test.ts` |

| Waktu      | Commit       | Environment                                                            | Hasil                                                                                                                                                                                                                                 | Evidence                                                                                                                         |
| ---------- | ------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-29 | Working tree | Bun 1.4.0, table operations service/contract dan explorer action tests | 7 pass, 0 fail; exact confirmation, audit/invalidation, informed mutation errors, dan UI action gating lulus                                                                                                                          | `apps/server/test/table-operations.test.ts`; `tests/contract/table-operations.test.ts`; `apps/web/test/explorer-actions.test.ts` |
| 2026-08-30 | Working tree | Bun 1.4.0, table operations service                                    | **2 pass, 0 fail, 9 assertions**; wrong confirmation ditolak dan rename/truncate/drop sukses diaudit serta metadata diinvalidasi                                                                                                      | `bun test apps/server/test/table-operations.test.ts`                                                                             |
| 2026-08-29 | Working tree | PostgreSQL disposable 55433 dan MySQL disposable 3380/3384             | Real table-operation integration **3 pass, 18 assertions**; rename, truncate, drop, dan impact pada dua engine                                                                                                                        | `tests/integration/table-operations/real-table-operations.test.ts`                                                               |
| 2026-08-29 | Working tree | PostgreSQL disposable 55433 dan MySQL disposable 3380                  | Real browser E2E `E2E-0043-AC1`, `E2E-0043-AC2`, dan `E2E-0043-AC5`: 1 pass; rename `200`, truncate/drop `204` pada kedua engine                                                                                                      | `tests/e2e/web/zz-real-query-editor.spec.ts`; `docs/specs/evidence/2026-08-29-browser.md`                                        |
| 2026-08-30 | Working tree | Bun 1.4.0, Playwright mock browser                                     | **9 pass, 0 fail dalam 9,4 detik**; `E2E-0043-AC3` menampilkan dependency view/FK, menolak konfirmasi kosong, mengirim `confirmName`, dan berpindah ke Explorer setelah drop; `E2E-0043-AC6` menandai tab data stale setelah truncate | `bunx playwright test tests/e2e/web/zzzz-table-designer.spec.ts --reporter=line`; `docs/specs/evidence/2026-08-29-browser.md`    |
| 2026-08-30 | Working tree | Bun 1.4.0, Angular explorer action registry                            | **4 pass, 0 fail, 4 assertions**; rename, truncate, dan drop tersedia untuk table connected, dan seluruhnya disabled dengan alasan saat offline                                                                                       | `bun test --isolate apps/web/test/explorer-actions.test.ts`                                                                      |

| 2026-08-30 | Working tree | Bun 1.4.0, Playwright real PostgreSQL/MySQL, audit endpoint | **1 pass, 0 fail** dalam 2,2 menit; rename/truncate/drop pada kedua engine diikuti assertion event `table.renamed`, `table.truncated`, dan `table.dropped` | `MYADMIN_REAL_DATABASE_E2E=1 ... bunx playwright test tests/e2e/web/zz-real-query-editor.spec.ts --grep 'execute real database workflows'` |
| 2026-08-30 | Working tree | Bun dev server, Playwright mock browser | **1 pass, 0 fail** dalam 6,3 detik; tab data yang terbuka menampilkan marker `Reload required` setelah truncate table | `bunx playwright test tests/e2e/web/zzzz-table-designer.spec.ts -g 'marks an open data tab' --reporter=line` |

## Gap dan blocker

| AC                           | Gap                                                                                                                                                                                    | Dampak                    | Tindak lanjut                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------ |
| AC-1, AC-2, AC-3, AC-4, AC-6 | Local service, contract, action-gating, real-engine destructive, audit, dan stale-tab evidence tersedia; provider-error E2E, visual, accessibility, dan security matrix belum lengkap. | Acceptance tetap parsial. | Lengkapi proof provider-error, visual/accessibility, dan security. |

## Verdict akhir

Belum diverifikasi. Status ini hanya boleh berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau.
