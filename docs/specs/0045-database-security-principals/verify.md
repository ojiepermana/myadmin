# Verify 0045. Security database target: principal

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

| AC                   | Test atau proof ID                                                          | Metode                                     | Bukti wajib                                                | Result                                                                                                                                                                                                |
| -------------------- | --------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [AC-1](test.md#ac-1) | `UT-0045-AC1`, `IT-0045-AC1`, `CT-0045-AC1`                                 | Unit, Integration, Contract                | output command dan assertion                               | Integration nyata PostgreSQL dan MySQL lulus lokal                                                                                                                                                    |
| [AC-2](test.md#ac-2) | `UT-0045-AC2`, `IT-0045-AC2`, `CT-0045-AC2`, `E2E-0045-AC2`                 | Unit, Integration, Contract, E2E           | output command dan assertion                               | Integration nyata kedua engine dan create/reset UI MySQL lulus lokal; real edit UI belum diklaim                                                                                                      |
| [AC-3](test.md#ac-3) | `UT-0045-AC3`, `IT-0045-AC3`, `CT-0045-AC3`, `E2E-0045-AC3`                 | Unit, Integration, Contract, E2E           | output command dan assertion                               | E2E mock create/edit lulus dengan payload teramati; real edit UI belum diklaim                                                                                                                        |
| [AC-4](test.md#ac-4) | `IT-0045-AC4`, `CT-0045-AC4`, `E2E-0045-AC4`, `SEC-0045-AC4`                | Integration, Contract, E2E, Security       | output command dan assertion; log tersanitasi tanpa secret | Lulus lokal; reset password kedua engine, contract response, browser flow, dan redaction/audit security proof lulus                                                                                   |
| [AC-5](test.md#ac-5) | `IT-0045-AC5`, `CT-0045-AC5`, `E2E-0045-AC5`, `SEC-0045-AC5`                | Integration, Contract, E2E, Security       | output command dan assertion; log tersanitasi tanpa secret | Lulus lokal; drop principal exact-name kedua engine, contract response, browser flow, dan audit security proof lulus                                                                                  |
| [AC-6](test.md#ac-6) | `UT-0045-AC6`, `IT-0045-AC6`, `CT-0045-AC6`, `E2E-0045-AC6`, `SEC-0045-AC6` | Unit, Integration, Contract, E2E, Security | output command dan assertion; log tersanitasi tanpa secret | Lulus lokal; capability gate, permission-denied mapping, contract boundary, accessible disabled UI, dan CSRF regression lulus                                                                         |
| [AC-7](test.md#ac-7) | `IT-0045-AC7`, `SEC-0045-AC7`                                               | Integration, Security                      | output command dan assertion; log tersanitasi tanpa secret | Service test membuktikan reset dan drop diaudit dengan target/action yang benar tanpa credential material; provider-engine matrix penuh belum                                                         |
| [AC-8](test.md#ac-8) | `IT-0045-AC8`, `E2E-0045-AC8`, `SEC-0045-AC8`                               | Integration, E2E, Security                 | output command dan assertion; log tersanitasi tanpa secret | Partial: PostgreSQL integration login dengan credential hasil reset dan principal lifecycle UI PostgreSQL/MySQL lulus; MySQL integration login principal ditolak fixture; security matrix penuh belum |

## Urutan verifikasi

1. Catat commit, versi Bun, sistem operasi, dan environment yang benar benar dipakai.
2. Dari akar repo, jalankan pemeriksaan satu manifest, lint, typecheck, serta command test yang tersedia pada `package.json` akar.
3. Jalankan seluruh test ID pada matriks sesuai jenisnya. Jangan mengganti integration atau operational proof dengan mock.
4. Kumpulkan manual, staged, environment, atau external proof yang ditetapkan. Jangan menandainya lulus bila dependency belum tersedia.
5. Simpan evidence yang tersanitasi, lalu isi result per AC dan verdict akhir.

## Pemeriksaan otomatis

| Area        | Command source                                        | Expected result                                                  |
| ----------- | ----------------------------------------------------- | ---------------------------------------------------------------- |
| Unit        | Script root yang didaftarkan pada satu `package.json` | Semua `UT-0045-*` lulus dan memiliki assertion yang menutup AC.  |
| Integration | Script root yang didaftarkan pada satu `package.json` | Resource nyata disposable dipakai dan cleanup lulus.             |
| Contract    | Script root yang didaftarkan pada satu `package.json` | Semua `CT-0045-*` lulus dan memiliki assertion yang menutup AC.  |
| E2E         | Script root yang didaftarkan pada satu `package.json` | Semua `E2E-0045-*` lulus dan memiliki assertion yang menutup AC. |
| Security    | Script root yang didaftarkan pada satu `package.json` | Semua `SEC-0045-*` lulus dan memiliki assertion yang menutup AC. |

## Pemeriksaan manual, staged, environment, atau external

Tidak ada manual atau external proof khusus yang diidentifikasi. Pemeriksaan reviewer tetap wajib untuk evidence otomatis.

## Catatan eksekusi

| Waktu      | Commit       | Environment                                                                                               | Hasil                                                                                                                                                                             | Evidence                                                                                                                                                                                              |
| ---------- | ------------ | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-29 | Working tree | Bun 1.4.0, macOS arm64, PostgreSQL 55433/55432, MySQL 3380/3384                                           | 34 test lulus; 0 gagal; 111 assertions                                                                                                                                            | `bun test tests/integration/postgresql/provider.test.ts tests/integration/mysql/provider.test.ts`                                                                                                     |
| 2026-08-29 | Working tree | Bun 1.4.0, PrincipalSecurityService dengan fake provider dan in-memory audit                              | **9 pass, 27 assertions**; list, dynamic form, create, update, reset, dan drop dispatch teruji langsung; mutasi diaudit dengan target/action yang benar tanpa credential material | `bun test apps/server/test/security-privileges.test.ts`                                                                                                                                               |
| 2026-08-29 | Working tree | PostgreSQL disposable 55433 dan MySQL disposable 3380, browser UI                                         | Real principal E2E **4 pass**; reset/drop UI PostgreSQL/MySQL lulus dan grant suite terkait juga selesai                                                                          | `MYADMIN_REAL_DATABASE_E2E=1 bun run test:e2e -- tests/e2e/web/zz-real-security.spec.ts`                                                                                                              |
| 2026-08-30 | Working tree | PostgreSQL disposable 55433 dan MySQL disposable 3380, authenticated browser UI                           | Real security batch **6 pass, 0 fail**; reset/drop principal kedua engine dan grant/revoke UI kedua engine lulus                                                                  | `MYADMIN_REAL_DATABASE_E2E=1 bunx playwright test tests/e2e/web/zz-real-security.spec.ts tests/e2e/web/zz-real-import-export.spec.ts`                                                                 |
| 2026-08-30 | Working tree | Bun 1.4.0, PrincipalSecurityService dengan capability provider `principals=false` dan route error mapping | **8 pass, 19 assertions**; capability gate menolak list sebelum provider operation, permission denial dipetakan ke 403 aman, dan CSRF/audit regressions tetap lulus               | `bun test --isolate apps/server/test/security-privileges.test.ts`                                                                                                                                     |
| 2026-08-30 | Working tree | Bun 1.4.0, security Angular template                                                                      | **1 pass, 4 assertions**; principal action memiliki disabled binding, accessible description, dan capability reason                                                               | `bun test --isolate apps/web/test/security.test.ts`                                                                                                                                                   |
| 2026-08-30 | Working tree | Playwright mock API, capability `principals=false`                                                        | **2 pass, 0 fail**; halaman Security runtime menampilkan alasan capability, menonaktifkan `New principal`, dan mempertahankan hubungan ARIA                                       | `PLAYWRIGHT_HTML_OPEN=never bunx playwright test tests/e2e/web/zz-security.spec.ts`                                                                                                                   |
| 2026-08-30 | Working tree | PostgreSQL disposable 55433, principal role dengan `canLogin=true`                                        | **1 pass, 2 assertions**; role dapat membuka koneksi dan menjalankan `SELECT 1` memakai credential hasil reset, kemudian dinonaktifkan dan dihapus                                | `MYADMIN_POSTGRES_INTEGRATION=1 MYADMIN_POSTGRES_SECURITY_INTEGRATION=1 MYADMIN_POSTGRES_CURRENT_PORT=55433 bun test tests/integration/postgresql/provider.test.ts --test-name-pattern 'IT-0045-AC1'` |

## Gap dan blocker

| AC                           | Gap                                                                                                                               | Dampak                            | Tindak lanjut                                        |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------- |
| AC-3, AC-4, AC-6, AC-7, AC-8 | E2E UI utama tersedia, tetapi contract/security matrix, provider-engine audit matrix, dan beberapa failure-path AC belum lengkap. | Verdict tetap belum diverifikasi. | Lengkapi matrix dan failure-path proof yang tersisa. |

## Verdict akhir

Belum diverifikasi. Status ini hanya boleh berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau.
