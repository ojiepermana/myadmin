# Verify 0047. Export

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Verdict**: Belum diverifikasi
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md)

## Ruang verifikasi

Verifikasi membuktikan perilaku implementasi terhadap seluruh acceptance criteria pada [test.md](test.md#acceptance-criteria). File ini tidak mengubah definisi AC dan tidak boleh diberi verdict lulus sebelum aplikasi, test, serta environment yang relevan benar benar dijalankan.

## Prasyarat eksekusi

| Kebutuhan     | Cara memeriksa                                                                   | Status awal                                                               |
| ------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Implementasi  | Build plan pada `index.md` selesai untuk slice yang diverifikasi.                | Tersedia; bukti lokal tercatat                                            |
| Dependency    | Semua relation `requires` pada `relation.md` sudah diterima.                     | Belum diperiksa                                                           |
| Root manifest | Tepat satu `package.json` ada di akar dan tidak ada manifest nested.             | Lulus quality gates lokal                                                 |
| Test plan     | Test ID relevan pada `test.md` sudah diimplementasikan.                          | Unit, contract, integration, E2E mock, dan real-engine roundtrip tersedia |
| Environment   | Service, database, browser, VM, certificate, atau akun yang dibutuhkan tersedia. | PostgreSQL/MySQL disposable tersedia; performance/manual/external belum   |

## Matriks verifikasi AC

| AC                   | Test atau proof ID                                          | Metode                                | Bukti wajib                                                                                                                                       | Result                                                                                                                                                                                    |
| -------------------- | ----------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [AC-1](test.md#ac-1) | `UT-0047-AC1`, `IT-0047-AC1`, `CT-0047-AC1`                 | Unit, Integration, Contract           | output command dan assertion                                                                                                                      | Export job route/unit/contract dan artifact CSV nyata PostgreSQL, MySQL 8.0, dan MySQL latest lulus lokal; full acceptance evidence belum                                                 |
| [AC-2](test.md#ac-2) | `UT-0047-AC2`, `IT-0047-AC2`, `SEC-0047-AC2`                | Unit, Integration, Security           | output command dan assertion; log tersanitasi tanpa secret                                                                                        | Unit security membuktikan nilai berisi apostrophe tetap di-quote provider dan tidak menjadi SQL executable; artifact SQL nyata tiga engine lulus, security review eksternal tetap belum   |
| [AC-3](test.md#ac-3) | `IT-0047-AC3`, `PERF-0047-AC3`                              | Integration, Performance              | output command dan assertion; dataset, baseline, ambang, pengulangan, dan toleransi                                                               | Export CSV 100.000 baris PostgreSQL lulus dengan heap delta <256 MiB dan durasi <20 detik; cross-engine dan formal memory baseline masih belum                                            |
| [AC-4](test.md#ac-4) | `UT-0047-AC4`, `IT-0047-AC4`, `CT-0047-AC4`, `E2E-0047-AC4` | Unit, Integration, Contract, E2E      | output command dan assertion                                                                                                                      | Mock E2E, integration, dan contract lokal lulus; seluruh lifecycle evidence belum                                                                                                         |
| [AC-5](test.md#ac-5) | `UT-0047-AC5`, `IT-0047-AC5`, `CT-0047-AC5`, `SEC-0047-AC5` | Unit, Integration, Contract, Security | output command dan assertion; log tersanitasi tanpa secret                                                                                        | Local job ownership/cleanup checks lulus; security/external evidence belum lengkap                                                                                                        |
| [AC-6](test.md#ac-6) | `E2E-0047-AC6`                                              | E2E                                   | output command dan assertion                                                                                                                      | E2E export UI lokal tercakup pada query/data-browser flow; visual/manual review belum                                                                                                     |
| [AC-7](test.md#ac-7) | `IT-0047-AC7`, `SEC-0047-AC7`                               | Integration, Security                 | output command dan assertion; log tersanitasi tanpa secret                                                                                        | Contract and local integration evidence tersedia; security proof khusus belum lengkap                                                                                                     |
| [AC-8](test.md#ac-8) | `IT-0047-AC8`, `E2E-0047-AC8`, `PERF-0047-AC8`              | Integration, E2E, Performance         | output command dan assertion; dataset, baseline, ambang, pengulangan, dan toleransi; Roundtrip SQL baru dapat ditutup setelah spec 0048 tersedia. | Service roundtrip 3 engine dan authenticated route E2E PostgreSQL/MySQL 2/2 lulus; 100.000-row CSV performance lulus pada PostgreSQL; cancel/full two-engine scale acceptance masih belum |

## Urutan verifikasi

1. Catat commit, versi Bun, sistem operasi, dan environment yang benar benar dipakai.
2. Dari akar repo, jalankan pemeriksaan satu manifest, lint, typecheck, serta command test yang tersedia pada `package.json` akar.
3. Jalankan seluruh test ID pada matriks sesuai jenisnya. Jangan mengganti integration atau operational proof dengan mock.
4. Kumpulkan manual, staged, environment, atau external proof yang ditetapkan. Jangan menandainya lulus bila dependency belum tersedia.
5. Simpan evidence yang tersanitasi, lalu isi result per AC dan verdict akhir.

## Pemeriksaan otomatis

| Area        | Command source                                        | Expected result                                                  |
| ----------- | ----------------------------------------------------- | ---------------------------------------------------------------- |
| Unit        | Script root yang didaftarkan pada satu `package.json` | Semua `UT-0047-*` lulus dan memiliki assertion yang menutup AC.  |
| Integration | Script root yang didaftarkan pada satu `package.json` | Resource nyata disposable dipakai dan cleanup lulus.             |
| Contract    | Script root yang didaftarkan pada satu `package.json` | Semua `CT-0047-*` lulus dan memiliki assertion yang menutup AC.  |
| E2E         | Script root yang didaftarkan pada satu `package.json` | Semua `E2E-0047-*` lulus dan memiliki assertion yang menutup AC. |
| Security    | Script root yang didaftarkan pada satu `package.json` | Semua `SEC-0047-*` lulus dan memiliki assertion yang menutup AC. |
| Performance | Script root yang didaftarkan pada satu `package.json` | Dataset dan threshold terukur tercatat serta terpenuhi.          |

## Pemeriksaan manual, staged, environment, atau external

| ID                  | AC                   | Langkah atau dependency                                      | Expected result                                                                     | Evidence  |
| ------------------- | -------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------- | --------- |
| `EVIDENCE-0047-AC8` | [AC-8](test.md#ac-8) | Roundtrip SQL baru dapat ditutup setelah spec 0048 tersedia. | Seluruh kewajiban AC terbukti tanpa mengganti external proof dengan simulasi lokal. | Belum ada |

## Catatan eksekusi

| 2026-08-30 | working tree | Playwright local web server | Query Editor E2E **1 passed dalam 8,4 detik** membuktikan pemilihan row, clipboard, dan queue full-result export job. | [Query editor E2E evidence](../evidence/2026-08-30-query-editor-e2e.md) |

| Waktu      | Commit       | Environment                                                                        | Hasil                                                                                                                                                                  | Evidence                                                                                                                                                                                                                                                                |
| ---------- | ------------ | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-29 | Working tree | Bun 1.4.0, export unit/integration, contract, dan tiga database disposable         | 11 pass, 0 fail, 36 assertions; adapter roundtrip tiga engine 3 pass, 9 assertions; service SQL roundtrip 3 pass, 42 assertions                                        | `bun test packages/export/test/export.test.ts packages/import/test/import.test.ts tests/integration/export/export.test.ts tests/integration/import/import.test.ts`; `tests/integration/import-export-roundtrip.test.ts`; `tests/integration/export/real-export.test.ts` |
| 2026-08-29 | Working tree | Bun 1.4.0, export/import package, HTTP integration, dan contract tests             | **13 pass, 50 assertions**; export artifact/cancel, import limits/preview/transaction, authenticated queue/status, serta API contracts lulus                           | `bun test packages/export/test/export.test.ts packages/import/test/import.test.ts tests/integration/export/export.test.ts tests/integration/import/import.test.ts tests/contract/export.test.ts tests/contract/import.test.ts`                                          |
| 2026-08-30 | Working tree | Playwright local web server, mock data/query/import fixtures                       | **3 browser tests passed**; export loaded/full-result flow, data-browser export dialog, bounded CSV import, dan export-job panel dengan progress/cancel controls lulus | `PLAYWRIGHT_HTML_OPEN=never bun run test:e2e -- tests/e2e/web/zz-query-editor.spec.ts tests/e2e/web/zz-data-browser.spec.ts tests/e2e/web/zz-import-export.spec.ts`                                                                                                     |
| 2026-08-29 | Working tree | PostgreSQL disposable 55433 dan MySQL disposable 3380, authenticated browser route | **2 E2E pass dalam 7,2 detik**; export SQL, download artifact, drop table, import artifact, dan typed row verification lulus pada kedua engine                         | `MYADMIN_REAL_DATABASE_E2E=1 bun run test:e2e -- tests/e2e/web/zz-real-import-export.spec.ts`                                                                                                                                                                           |
| 2026-08-30 | Working tree | PostgreSQL disposable 55433 dan MySQL disposable 3380, authenticated browser route | Real export route roundtrip **2 pass, 0 fail**; SQL export/download dan downstream import verification lulus pada kedua engine                                         | `MYADMIN_REAL_DATABASE_E2E=1 bunx playwright test tests/e2e/web/zz-real-security.spec.ts tests/e2e/web/zz-real-import-export.spec.ts`                                                                                                                                   |
| 2026-08-30 | Working tree | PostgreSQL disposable, fixture 100.000 baris, ExportService dan JobManager         | **1 pass, 0 fail, 7 assertions** dalam 3,78 detik; CSV streaming job selesai dengan 100.000 row, isi file benar, durasi `<20 detik`, dan heap delta `<256 MiB`         | `MYADMIN_POSTGRES_INTEGRATION=1 bun test --isolate tests/performance/export.test.ts`                                                                                                                                                                                    |

## Gap dan blocker

| AC                           | Gap                                                                                                                                                                                                                       | Dampak                    | Tindak lanjut                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------- |
| AC-3, AC-5, AC-6, AC-7, AC-8 | Local unit/contract/provider evidence, UI flow, authenticated route roundtrip, dan PostgreSQL 100.000-row performance tersedia; cancel scale, cross-engine scale, security proof, serta lifecycle UI penuh belum lengkap. | Acceptance tetap parsial. | Lengkapi cancel/cross-engine scale, security, dan evidence eksternal yang tersisa. |

## Verdict akhir

Belum diverifikasi. Status ini hanya boleh berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau.
