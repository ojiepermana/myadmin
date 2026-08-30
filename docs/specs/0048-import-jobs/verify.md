# Verify 0048. Import

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Verdict**: Belum diverifikasi
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md)

## Ruang verifikasi

Verifikasi membuktikan perilaku implementasi terhadap seluruh acceptance criteria pada [test.md](test.md#acceptance-criteria). File ini tidak mengubah definisi AC dan tidak boleh diberi verdict lulus sebelum aplikasi, test, serta environment yang relevan benar benar dijalankan.

## Prasyarat eksekusi

| Kebutuhan     | Cara memeriksa                                                                   | Status awal                                               |
| ------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Implementasi  | Build plan pada `index.md` selesai untuk slice yang diverifikasi.                | Tersedia; bukti lokal tercatat                            |
| Dependency    | Semua relation `requires` pada `relation.md` sudah diterima.                     | Belum diperiksa                                           |
| Root manifest | Tepat satu `package.json` ada di akar dan tidak ada manifest nested.             | Lulus quality gates lokal                                 |
| Test plan     | Test ID relevan pada `test.md` sudah diimplementasikan.                          | Unit, contract, E2E mock, dan real-engine import tersedia |
| Environment   | Service, database, browser, VM, certificate, atau akun yang dibutuhkan tersedia. | PostgreSQL/MySQL disposable tersedia; hosted/manual belum |

## Matriks verifikasi AC

| AC                   | Test atau proof ID                                           | Metode                                | Bukti wajib                                                | Result                                                                                                                                                              |
| -------------------- | ------------------------------------------------------------ | ------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [AC-1](test.md#ac-1) | `UT-0048-AC1`, `IT-0048-AC1`, `CT-0048-AC1`, `SEC-0048-AC1`  | Unit, Integration, Contract, Security | output command dan assertion; log tersanitasi tanpa secret | Unit, contract, dan security lokal lulus; integration khusus upload belum terpisah                                                                                  |
| [AC-2](test.md#ac-2) | `UT-0048-AC2`, `IT-0048-AC2`, `CT-0048-AC2`                  | Unit, Integration, Contract           | output command dan assertion                               | Real ImportService CSV/SQL lulus pada PostgreSQL 18.1 dan MySQL 8.0/8.4; contract/unit juga lulus                                                                   |
| [AC-3](test.md#ac-3) | `UT-0048-AC3`, `IT-0048-AC3`, `CT-0048-AC3`                  | Unit, Integration, Contract           | output command dan assertion                               | Real ImportService CSV typed mapping lulus pada tiga engine; unit dan contract lulus                                                                                |
| [AC-4](test.md#ac-4) | `IT-0048-AC4`, `CT-0048-AC4`, `E2E-0048-AC4`, `SEC-0048-AC4` | Integration, Contract, E2E, Security  | output command dan assertion; log tersanitasi tanpa secret | Real ImportService PostgreSQL/MySQL 3/3 membuktikan confirmation gate, truncate nyata, hasil destructive, dan audit; E2E mock serta contract/security juga lulus    |
| [AC-5](test.md#ac-5) | `IT-0048-AC5`, `E2E-0048-AC5`                                | Integration, E2E                      | output command dan assertion                               | SQL transaction dan statement completion serta cancel job pada UI lulus secara lokal; real rollback/partial-result acceptance tetap dibatasi evidence integration   |
| [AC-6](test.md#ac-6) | `IT-0048-AC6`, `CT-0048-AC6`, `SEC-0048-AC6`                 | Integration, Contract, Security       | output command dan assertion; log tersanitasi tanpa secret | Real ImportService 3/3 memeriksa hasil completed dan audit `import.completed` tanpa isi data; contract/security lokal juga lulus                                    |
| [AC-7](test.md#ac-7) | `CT-0048-AC7`, `E2E-0048-AC7`, `SEC-0048-AC7`                | Contract, E2E, Security               | output command dan assertion; log tersanitasi tanpa secret | Contract, security, dan E2E bounded preview lulus lokal; visual/manual review belum                                                                                 |
| [AC-8](test.md#ac-8) | `IT-0048-AC8`, `E2E-0048-AC8`, `SEC-0048-AC8`                | Integration, E2E, Security            | output command dan assertion; log tersanitasi tanpa secret | Service roundtrip dan destructive CSV 3 engine, authenticated route E2E PostgreSQL/MySQL 2/2 lulus dalam rerun; upload-limit/security/full acceptance belum lengkap |

## Urutan verifikasi

1. Catat commit, versi Bun, sistem operasi, dan environment yang benar benar dipakai.
2. Dari akar repo, jalankan pemeriksaan satu manifest, lint, typecheck, serta command test yang tersedia pada `package.json` akar.
3. Jalankan seluruh test ID pada matriks sesuai jenisnya. Jangan mengganti integration atau operational proof dengan mock.
4. Kumpulkan manual, staged, environment, atau external proof yang ditetapkan. Jangan menandainya lulus bila dependency belum tersedia.
5. Simpan evidence yang tersanitasi, lalu isi result per AC dan verdict akhir.

## Pemeriksaan otomatis

| Area        | Command source                                        | Expected result                                                  |
| ----------- | ----------------------------------------------------- | ---------------------------------------------------------------- |
| Unit        | Script root yang didaftarkan pada satu `package.json` | Semua `UT-0048-*` lulus dan memiliki assertion yang menutup AC.  |
| Integration | Script root yang didaftarkan pada satu `package.json` | Resource nyata disposable dipakai dan cleanup lulus.             |
| Contract    | Script root yang didaftarkan pada satu `package.json` | Semua `CT-0048-*` lulus dan memiliki assertion yang menutup AC.  |
| E2E         | Script root yang didaftarkan pada satu `package.json` | Semua `E2E-0048-*` lulus dan memiliki assertion yang menutup AC. |
| Security    | Script root yang didaftarkan pada satu `package.json` | Semua `SEC-0048-*` lulus dan memiliki assertion yang menutup AC. |

## Pemeriksaan manual, staged, environment, atau external

Tidak ada manual atau external proof khusus yang diidentifikasi. Pemeriksaan reviewer tetap wajib untuk evidence otomatis.

## Catatan eksekusi

| 2026-08-30 | working tree | Playwright dengan PostgreSQL/MySQL disposable | Real import/export E2E **2 passed dalam 7,3 detik**; roundtrip dan credential non-leak assertion lulus pada kedua engine. | [Real import/export evidence](../evidence/2026-08-30-real-import-export.md) |

| Waktu      | Commit       | Environment                                                                        | Hasil                                                                                                                                                                                                                                                                      | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------- | ------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-08-30 | Working tree | Bun 1.4.0, import unit/integration, contract, dan browser mock                     | Unit/integration suite gabungan 11 pass, 0 fail, 36 assertions; contract 3 pass, 16 assertions; import UI 1 pass; adapter roundtrip tiga engine 3 pass, 9 assertions; real ImportService destructive CSV **4 pass, 35 expect calls** pada PostgreSQL dan dua MySQL fixture | `bun test packages/export/test/export.test.ts packages/import/test/import.test.ts tests/integration/export/export.test.ts tests/integration/import/import.test.ts`; `bun test tests/contract/export.test.ts tests/contract/import.test.ts tests/contract/restore.test.ts`; `PLAYWRIGHT_HTML_OPEN=never bun run test:e2e -- tests/e2e/web/zz-import-export.spec.ts`; `tests/integration/import-export-roundtrip.test.ts`; `MYADMIN_POSTGRES_INTEGRATION=1 ... bun test --isolate tests/integration/import/import.test.ts` |
| 2026-08-29 | Working tree | Bun 1.4.0, import/export package, HTTP integration, dan contract tests             | **13 pass, 50 assertions**; upload limit/type isolation, SQL transaction, CSV mapping, destructive gate, bounded preview, authenticated import routes, dan contracts lulus                                                                                                 | `bun test packages/export/test/export.test.ts packages/import/test/import.test.ts tests/integration/export/export.test.ts tests/integration/import/import.test.ts tests/contract/export.test.ts tests/contract/import.test.ts`                                                                                                                                                                                                                                                                                           |
| 2026-08-29 | Working tree | Playwright local web server, mock import fixture                                   | **1 browser test passed dalam 8,3 detik (combined run)**; bounded CSV preview, mapping, confirmation, dan queue flow lulus                                                                                                                                                 | `bun run test:e2e -- tests/e2e/web/zz-import-export.spec.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-08-29 | Working tree | PostgreSQL disposable 55433 dan MySQL disposable 3380, authenticated browser route | **2 E2E pass dalam 7,2 detik**; export/import SQL route roundtrip dan typed row verification lulus pada kedua engine                                                                                                                                                       | `MYADMIN_REAL_DATABASE_E2E=1 bun run test:e2e -- tests/e2e/web/zz-real-import-export.spec.ts`                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-08-30 | Working tree | PostgreSQL disposable 55433 dan MySQL disposable 3380, authenticated browser route | Real import route roundtrip **2 pass, 0 fail**; SQL artifact import dan typed row verification lulus pada kedua engine                                                                                                                                                     | `MYADMIN_REAL_DATABASE_E2E=1 bunx playwright test tests/e2e/web/zz-real-security.spec.ts tests/e2e/web/zz-real-import-export.spec.ts`                                                                                                                                                                                                                                                                                                                                                                                    |

## Gap dan blocker

| AC               | Gap                                                                                                                                                                          | Dampak                    | Tindak lanjut                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------ |
| AC-5, AC-6, AC-8 | Local unit/contract/integration evidence dan UI E2E roundtrip SQL sudah lulus; security end-to-end, performance, upload-limit flow, dan native bulk-load path belum lengkap. | Acceptance tetap parsial. | Lengkapi security/upload-limit/performance evidence bila environment tersedia. |

## Verdict akhir

Belum diverifikasi. Status ini hanya boleh berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau.
