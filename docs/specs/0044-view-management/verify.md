# Verify 0044. Manajemen view (CRUD GUI)

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

| AC                   | Test atau proof ID                                                          | Metode                                     | Bukti wajib                                                | Result                                                                                                                                                                    |
| -------------------- | --------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [AC-1](test.md#ac-1) | `E2E-0044-AC1`                                                              | E2E                                        | output command dan assertion                               | Parsial lokal; real PostgreSQL view create/editor render dan MySQL view flow lulus, CRUD acceptance penuh belum                                                           |
| [AC-2](test.md#ac-2) | `UT-0044-AC2`, `IT-0044-AC2`, `CT-0044-AC2`, `E2E-0044-AC2`                 | Unit, Integration, Contract, E2E           | output command dan assertion                               | Struktur editor Angular, real validation/preview, dan contract/provider flow lulus; seluruh layer evidence belum                                                          |
| [AC-3](test.md#ac-3) | `UT-0044-AC3`, `IT-0044-AC3`, `CT-0044-AC3`, `E2E-0044-AC3`, `SEC-0044-AC3` | Unit, Integration, Contract, E2E, Security | output command dan assertion; log tersanitasi tanpa secret | CRUD provider nyata kedua engine dan mock UI create/update/drop lulus; bukti audit/security eksternal tetap tidak diklaim                                                 |
| [AC-4](test.md#ac-4) | `UT-0044-AC4`, `IT-0044-AC4`, `CT-0044-AC4`, `E2E-0044-AC4`                 | Unit, Integration, Contract, E2E           | output command dan assertion                               | Lulus lokal untuk capability gate: provider tanpa `viewEditor` menampilkan aksi Open definition disabled dengan alasan; full UI CRUD evidence tetap di AC lain            |
| [AC-5](test.md#ac-5) | `IT-0044-AC5`, `E2E-0044-AC5`, `SEC-0044-AC5`                               | Integration, E2E, Security                 | output command dan assertion; log tersanitasi tanpa secret | Provider create/replace/drop lulus kedua engine; real PostgreSQL UI lifecycle memverifikasi audit `view.created` dan `view.dropped`, tetapi full acceptance tetap parsial |
| [AC-6](test.md#ac-6) | `UT-0044-AC6`, `IT-0044-AC6`, `CT-0044-AC6`, `E2E-0044-AC6`                 | Unit, Integration, Contract, E2E           | output command dan assertion                               | Real PostgreSQL drop preview/warning/exact-name gate dan DELETE UI response 204 lulus; full error matrix belum                                                            |
| [AC-7](test.md#ac-7) | `UT-0044-AC7`, `IT-0044-AC7`, `E2E-0044-AC7`                                | Unit, Integration, E2E                     | output command dan assertion                               | Real browser membuktikan Confirm disabled/enabled dan DELETE request 204; cache/tab stale proof belum lengkap                                                             |
| [AC-8](test.md#ac-8) | `IT-0044-AC8`, `E2E-0044-AC8`, `SEC-0044-AC8`                               | Integration, E2E, Security                 | output command dan assertion; log tersanitasi tanpa secret | Real browser create/drop UI PostgreSQL dan MySQL lulus; data-open/alter, security, dan audit evidence belum lengkap                                                       |

## Urutan verifikasi

1. Catat commit, versi Bun, sistem operasi, dan environment yang benar benar dipakai.
2. Dari akar repo, jalankan pemeriksaan satu manifest, lint, typecheck, serta command test yang tersedia pada `package.json` akar.
3. Jalankan seluruh test ID pada matriks sesuai jenisnya. Jangan mengganti integration atau operational proof dengan mock.
4. Kumpulkan manual, staged, environment, atau external proof yang ditetapkan. Jangan menandainya lulus bila dependency belum tersedia.
5. Simpan evidence yang tersanitasi, lalu isi result per AC dan verdict akhir.

## Pemeriksaan otomatis

| Area        | Command source                                        | Expected result                                                  |
| ----------- | ----------------------------------------------------- | ---------------------------------------------------------------- |
| Unit        | Script root yang didaftarkan pada satu `package.json` | Semua `UT-0044-*` lulus dan memiliki assertion yang menutup AC.  |
| Integration | Script root yang didaftarkan pada satu `package.json` | Resource nyata disposable dipakai dan cleanup lulus.             |
| Contract    | Script root yang didaftarkan pada satu `package.json` | Semua `CT-0044-*` lulus dan memiliki assertion yang menutup AC.  |
| E2E         | Script root yang didaftarkan pada satu `package.json` | Semua `E2E-0044-*` lulus dan memiliki assertion yang menutup AC. |
| Security    | Script root yang didaftarkan pada satu `package.json` | Semua `SEC-0044-*` lulus dan memiliki assertion yang menutup AC. |

## Pemeriksaan manual, staged, environment, atau external

Tidak ada manual atau external proof khusus yang diidentifikasi. Pemeriksaan reviewer tetap wajib untuk evidence otomatis.

## Catatan eksekusi

| Waktu      | Commit       | Environment                                                        | Hasil                                                                                                                                                                        | Evidence                                                                                                                                                                                            |
| ---------- | ------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-29 | Working tree | Bun 1.4.0, macOS arm64, PostgreSQL 55433, MySQL 3380/3384          | Unit 3/3 dan integration 3/3 lulus                                                                                                                                           | `bun test packages/database-postgresql/test/view.test.ts`; `bun test --test-name-pattern '0044' tests/integration/postgresql/provider.test.ts tests/integration/mysql/provider.test.ts`             |
| 2026-08-29 | Working tree | Bun 1.4.0, provider/contract tests dan Playwright local web server | View provider + contract checks **10 pass, 11 assertions**; view-editor mock E2E **1 pass dalam 6,9 detik** untuk validation, preview, exact-name gate, dan delete safeguard | `bun test packages/database-postgresql/test/view.test.ts packages/database-mysql/test/view.test.ts tests/contract/data-browser.test.ts`; `bun run test:e2e -- tests/e2e/web/zz-view-editor.spec.ts` |
| 2026-08-29 | Working tree | PostgreSQL disposable 55433 dan MySQL disposable 3380, browser UI  | Real PostgreSQL dan MySQL view E2E **2 pass** dalam suite real; preview/confirmation dan create/drop UI lulus                                                                | `MYADMIN_REAL_DATABASE_E2E=1 bun run test:e2e -- tests/e2e/web/zz-real-query-editor.spec.ts`                                                                                                        |
| 2026-08-30 | Working tree | PostgreSQL disposable 55433, browser UI, dan audit endpoint        | **1 pass, 0 fail** dalam 6,6 detik; create/drop view melalui UI diikuti verifikasi event audit `view.created` dan `view.dropped`                                             | `MYADMIN_REAL_DATABASE_E2E=1 ... bunx playwright test tests/e2e/web/zz-real-query-editor.spec.ts --grep 'real PostgreSQL view'`                                                                     |

## Gap dan blocker

| AC                                       | Gap                                                                                                | Dampak                            | Tindak lanjut                                |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------- | -------------------------------------------- |
| AC-1, AC-2, AC-4, AC-5, AC-6, AC-7, AC-8 | UI E2E, audit, invalid-definition, capability, dan beberapa contract/security proof belum lengkap. | Verdict tetap belum diverifikasi. | Lengkapi proof UI dan boundary yang tersisa. |

## Verdict akhir

Belum diverifikasi. Status ini hanya boleh berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau.
