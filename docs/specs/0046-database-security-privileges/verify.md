# Verify 0046. Security database target: privilege (grant dan revoke)

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

| AC                   | Test atau proof ID                                                          | Metode                                     | Bukti wajib                                                | Result                                                                                                                                                                                                                                                            |
| -------------------- | --------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [AC-1](test.md#ac-1) | `UT-0046-AC1`, `IT-0046-AC1`, `CT-0046-AC1`                                 | Unit, Integration, Contract                | output command dan assertion                               | Grant introspection nyata PostgreSQL dan MySQL lulus lokal                                                                                                                                                                                                        |
| [AC-2](test.md#ac-2) | `UT-0046-AC2`, `IT-0046-AC2`, `CT-0046-AC2`, `E2E-0046-AC2`                 | Unit, Integration, Contract, E2E           | output command dan assertion                               | Catalog provider nyata, contract, serta E2E pemilihan tabel dan grant/revoke PostgreSQL/MySQL lulus lokal; hosted/manual acceptance belum dilakukan                                                                                                               |
| [AC-3](test.md#ac-3) | `UT-0046-AC3`, `IT-0046-AC3`, `CT-0046-AC3`, `E2E-0046-AC3`, `SEC-0046-AC3` | Unit, Integration, Contract, E2E, Security | output command dan assertion; log tersanitasi tanpa secret | Lulus lokal; provider kedua engine membuktikan efek grant/revoke, contract, E2E preview/apply, dan security confirmation lulus                                                                                                                                    |
| [AC-4](test.md#ac-4) | `IT-0046-AC4`, `CT-0046-AC4`                                                | Integration, Contract                      | output command dan assertion                               | Apply grant/revoke nyata kedua engine lulus lokal                                                                                                                                                                                                                 |
| [AC-5](test.md#ac-5) | `IT-0046-AC5`, `SEC-0046-AC5`                                               | Integration, Security                      | output command dan assertion; log tersanitasi tanpa secret | Lulus lokal pada service boundary; setiap privilege result diaudit sebelum response sukses dengan target dan action yang benar                                                                                                                                    |
| [AC-6](test.md#ac-6) | `UT-0046-AC6`, `IT-0046-AC6`, `CT-0046-AC6`, `E2E-0046-AC6`                 | Unit, Integration, Contract, E2E           | output command dan assertion                               | Local matrix lengkap: server validation, provider catalog kedua engine, contract schema, dan E2E UI membuktikan capability/catalog-driven privilege serta tidak menawarkan `WITH GRANT OPTION`/column privilege; fixture MySQL tidak tersedia pada rerun terakhir |
| [AC-7](test.md#ac-7) | `IT-0046-AC7`, `E2E-0046-AC7`, `SEC-0046-AC7`                               | Integration, E2E, Security                 | output command dan assertion; log tersanitasi tanpa secret | Integration/security proof kedua engine membuktikan login principal, SELECT berhasil, INSERT ditolak, lalu revoke; E2E UI grant/revoke kedua engine lulus                                                                                                         |

## Urutan verifikasi

1. Catat commit, versi Bun, sistem operasi, dan environment yang benar benar dipakai.
2. Dari akar repo, jalankan pemeriksaan satu manifest, lint, typecheck, serta command test yang tersedia pada `package.json` akar.
3. Jalankan seluruh test ID pada matriks sesuai jenisnya. Jangan mengganti integration atau operational proof dengan mock.
4. Kumpulkan manual, staged, environment, atau external proof yang ditetapkan. Jangan menandainya lulus bila dependency belum tersedia.
5. Simpan evidence yang tersanitasi, lalu isi result per AC dan verdict akhir.

## Pemeriksaan otomatis

| Area        | Command source                                        | Expected result                                                  |
| ----------- | ----------------------------------------------------- | ---------------------------------------------------------------- |
| Unit        | Script root yang didaftarkan pada satu `package.json` | Semua `UT-0046-*` lulus dan memiliki assertion yang menutup AC.  |
| Integration | Script root yang didaftarkan pada satu `package.json` | Resource nyata disposable dipakai dan cleanup lulus.             |
| Contract    | Script root yang didaftarkan pada satu `package.json` | Semua `CT-0046-*` lulus dan memiliki assertion yang menutup AC.  |
| E2E         | Script root yang didaftarkan pada satu `package.json` | Semua `E2E-0046-*` lulus dan memiliki assertion yang menutup AC. |
| Security    | Script root yang didaftarkan pada satu `package.json` | Semua `SEC-0046-*` lulus dan memiliki assertion yang menutup AC. |

## Pemeriksaan manual, staged, environment, atau external

Tidak ada manual atau external proof khusus yang diidentifikasi. Pemeriksaan reviewer tetap wajib untuk evidence otomatis.

## Catatan eksekusi

| 2026-08-30 | working tree | Bun 1.4.0, MySQL 8.0/latest disposable 3380/3384, fixture user dengan TLS require | **22 pass, 0 fail, 72 assertions**; provider contract, TLS, redaction, principal lifecycle, view, cancel, dan grant/revoke effect lulus pada kedua versi | `MYADMIN_MYSQL_SECURITY_INTEGRATION=1 MYSQL_8_0_URL='mysql://fixture:<fixture-password>@127.0.0.1:3380/fixture?sslmode=require' MYSQL_LATEST_URL='mysql://fixture:<fixture-password>@127.0.0.1:3384/fixture?sslmode=require' bun test --isolate tests/integration/mysql/provider.test.ts` |

| Waktu      | Commit       | Environment                                                                      | Hasil                                                                                                                                                          | Evidence                                                                                                                                                                                                                                                           |
| ---------- | ------------ | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-08-29 | Working tree | Bun 1.4.0, macOS arm64, MySQL 8.0.43/8.4.6 disposable, TLS required              | 22 test lulus; 0 gagal; 68 assertions                                                                                                                          | `MYADMIN_MYSQL_SECURITY_INTEGRATION=1 MYSQL_8_0_URL=... MYSQL_LATEST_URL=... bun test tests/integration/mysql/provider.test.ts`                                                                                                                                    |
| 2026-08-29 | Working tree | PostgreSQL disposable 55433 dan MySQL disposable 3380, browser UI                | Real privilege E2E **4 pass**; grant/revoke table flow pada PostgreSQL/MySQL dan principal lifecycle lulus                                                     | `MYADMIN_REAL_DATABASE_E2E=1 bun run test:e2e -- tests/e2e/web/zz-real-security.spec.ts`                                                                                                                                                                           |
| 2026-08-30 | Working tree | PostgreSQL disposable 55433 dan MySQL disposable 3380, authenticated browser UI  | Real privilege E2E **2 pass, 0 fail**; table grant dan revoke lulus pada PostgreSQL dan MySQL                                                                  | `MYADMIN_REAL_DATABASE_E2E=1 bunx playwright test tests/e2e/web/zz-real-security.spec.ts tests/e2e/web/zz-real-import-export.spec.ts`                                                                                                                              |
| 2026-08-30 | Working tree | PostgreSQL 55433 dan MySQL 8.0/latest 3380/3384 dengan TLS-enabled root fixtures | **37 pass, 0 fail, 132 assertions**; principal login, SELECT grant, INSERT denial, revoke effect, dan catalog/security provider checks lulus pada kedua engine | `MYADMIN_POSTGRES_INTEGRATION=1 MYADMIN_POSTGRES_SECURITY_INTEGRATION=1 ... MYSQL_8_0_URL=... MYSQL_LATEST_URL=... MYADMIN_MYSQL_SECURITY_INTEGRATION=1 bun test --isolate tests/integration/postgresql/provider.test.ts tests/integration/mysql/provider.test.ts` |

## Gap dan blocker

| AC                     | Gap                                                                                                                                                       | Dampak                            | Tindak lanjut                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | -------------------------------------------------------------- |
| AC-2, AC-3, AC-5, AC-6 | UI matrix, server audit/validation, contract, provider catalog, dan real E2E evidence tersedia; integration/security sign-off formal masih belum lengkap. | Verdict tetap belum diverifikasi. | Lengkapi integration audit dan security sign-off yang tersisa. |
| AC-7                   | Integration provider membuktikan login principal hanya dapat SELECT dan real E2E grant/revoke kedua engine lulus; security sign-off penuh masih terbuka.  | Acceptance tetap parsial.         | Lengkapi security sign-off dan evidence actor yang tersisa.    |

## Verdict akhir

Belum diverifikasi. Status ini hanya boleh berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau.
