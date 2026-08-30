# Verify 0040. Manajemen schema

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

| AC                   | Test atau proof ID                                          | Metode                           | Bukti wajib                                                | Result                                                                                                                                                      |
| -------------------- | ----------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [AC-1](test.md#ac-1) | `UT-0040-AC1`, `IT-0040-AC1`                                | Unit, Integration                | output command dan assertion                               | Parsial lokal; PostgreSQL real-browser create/list flow lulus, seluruh integration matrix belum                                                             |
| [AC-2](test.md#ac-2) | `IT-0040-AC2`, `CT-0040-AC2`                                | Integration, Contract            | output command dan assertion                               | Parsial lokal; service/contract evidence dan real schema flow lulus, seluruh integration matrix belum                                                       |
| [AC-3](test.md#ac-3) | `UT-0040-AC3`, `IT-0040-AC3`, `CT-0040-AC3`, `E2E-0040-AC3` | Unit, Integration, Contract, E2E | output command dan assertion                               | Parsial lokal; unit/contract dan real-browser capability gate lulus, tetapi `IT-0040-AC3` terpisah untuk boundary integration provider masih belum tersedia |
| [AC-4](test.md#ac-4) | `E2E-0040-AC4`, `SEC-0040-AC4`                              | E2E, Security                    | output command dan assertion; log tersanitasi tanpa secret | E2E lokal lulus untuk create, rename, dan drop confirmation; security proof terpisah masih diperlukan                                                       |
| [AC-5](test.md#ac-5) | `IT-0040-AC5`, `SEC-0040-AC5`                               | Integration, Security            | output command dan assertion; log tersanitasi tanpa secret | Parsial lokal; service audit test lulus, security/integration matrix penuh belum                                                                            |
| [AC-6](test.md#ac-6) | `IT-0040-AC6`, `E2E-0040-AC6`                               | Integration, E2E                 | output command dan assertion                               | Parsial lokal; real PostgreSQL create/rename/drop browser flow lulus, integration evidence penuh belum                                                      |

## Urutan verifikasi

1. Catat commit, versi Bun, sistem operasi, dan environment yang benar benar dipakai.
2. Dari akar repo, jalankan pemeriksaan satu manifest, lint, typecheck, serta command test yang tersedia pada `package.json` akar.
3. Jalankan seluruh test ID pada matriks sesuai jenisnya. Jangan mengganti integration atau operational proof dengan mock.
4. Kumpulkan manual, staged, environment, atau external proof yang ditetapkan. Jangan menandainya lulus bila dependency belum tersedia.
5. Simpan evidence yang tersanitasi, lalu isi result per AC dan verdict akhir.

## Pemeriksaan otomatis

| Area        | Command source                                        | Expected result                                                  |
| ----------- | ----------------------------------------------------- | ---------------------------------------------------------------- |
| Unit        | Script root yang didaftarkan pada satu `package.json` | Semua `UT-0040-*` lulus dan memiliki assertion yang menutup AC.  |
| Integration | Script root yang didaftarkan pada satu `package.json` | Resource nyata disposable dipakai dan cleanup lulus.             |
| Contract    | Script root yang didaftarkan pada satu `package.json` | Semua `CT-0040-*` lulus dan memiliki assertion yang menutup AC.  |
| E2E         | Script root yang didaftarkan pada satu `package.json` | Semua `E2E-0040-*` lulus dan memiliki assertion yang menutup AC. |
| Security    | Script root yang didaftarkan pada satu `package.json` | Semua `SEC-0040-*` lulus dan memiliki assertion yang menutup AC. |

## Pemeriksaan manual, staged, environment, atau external

Tidak ada manual atau external proof khusus yang diidentifikasi. Pemeriksaan reviewer tetap wajib untuk evidence otomatis.

## Catatan eksekusi

| Waktu      | Commit       | Environment                                                                        | Hasil                                                                                                                                                                 | Evidence                                                                                                                                                                                                                                                                                                                                     |
| ---------- | ------------ | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-29 | Working tree | Bun lokal, web server Playwright, contract mock                                    | 1 E2E lulus untuk schema listing/create/rename/drop                                                                                                                   | `tests/e2e/web/zz-schema-management.spec.ts`; `docs/specs/evidence/2026-08-29-browser.md`                                                                                                                                                                                                                                                    |
| 2026-08-29 | Working tree | Bun 1.4.0, schema service/provider/contract, PostgreSQL disposable, dan Playwright | **7 pass, 20 assertions** pada server/provider/contract; PostgreSQL schema integration **1 pass**; database+schema browser **2 passed dalam 6,7 detik**               | `bun test apps/server/test/schema-management.test.ts tests/contract/schema-management.test.ts packages/database-postgresql/test/postgresql-schema.test.ts`; `bun test tests/integration/postgresql/schema-management.test.ts`; `bun run test:e2e -- tests/e2e/web/zz-database-management.spec.ts tests/e2e/web/zz-schema-management.spec.ts` |
| 2026-08-29 | Working tree | PostgreSQL disposable 55433 dan MySQL disposable 3380, browser UI                  | Real browser schema/database flow dalam suite **4 pass**; PostgreSQL dan MySQL schema paths lulus                                                                     | `MYADMIN_REAL_DATABASE_E2E=1 bun run test:e2e -- tests/e2e/web/zz-real-query-editor.spec.ts`                                                                                                                                                                                                                                                 |
| 2026-08-30 | Working tree | PostgreSQL dan MySQL disposable, Playwright, server lokal                          | Suite real-engine **4 pass, 0 gagal dalam 2,4 menit**; MySQL forced schema POST mengembalikan HTTP `501` dan `SCHEMA_UNSUPPORTED`, PostgreSQL CRUD schema tetap lulus | `MYADMIN_REAL_DATABASE_E2E=1 bun run test:e2e -- tests/e2e/web/zz-real-query-editor.spec.ts`; `tests/e2e/web/zz-real-query-editor.spec.ts:17`                                                                                                                                                                                                |

## Gap dan blocker

| AC                     | Gap                                                                                                                                           | Dampak                         | Tindak lanjut                                                                                                                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-1, AC-2, AC-3, AC-5 | Local implementation and focused evidence exist, but full provider integration/contract/security mapping is not recorded in this Verify file. | Acceptance remains unverified. | Map each planned test ID to current command output and run missing real-engine checks. AC-3 kini memiliki real-browser proof untuk forced MySQL unsupported endpoint; `IT-0040-AC3` masih terbuka. |
| AC-4, AC-6             | Browser mock CRUD dan real-engine operation proof tersedia; security matrix serta failure-path penuh masih terbuka.                           | Acceptance remains partial.    | Lengkapi security dan provider-error proof.                                                                                                                                                        |

## Verdict akhir

Belum diverifikasi. Status ini hanya boleh berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau.
