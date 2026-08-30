# Verify 0039. Manajemen database

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

| AC                   | Test atau proof ID                                           | Metode                               | Bukti wajib                                                | Result                                                                                                                                 |
| -------------------- | ------------------------------------------------------------ | ------------------------------------ | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| [AC-1](test.md#ac-1) | `IT-0039-AC1`, `E2E-0039-AC1`                                | Integration, E2E                     | output command dan assertion                               | Parsial lokal; database create/list/properties/drop lulus pada PostgreSQL dan MySQL, termasuk real-browser flow                        |
| [AC-2](test.md#ac-2) | `UT-0039-AC2`, `IT-0039-AC2`, `CT-0039-AC2`, `E2E-0039-AC2`  | Unit, Integration, Contract, E2E     | output command dan assertion                               | Parsial lokal; provider, contract, dan real-browser create lulus, seluruh UI/engine matrix belum dipisahkan                            |
| [AC-3](test.md#ac-3) | `IT-0039-AC3`, `CT-0039-AC3`, `E2E-0039-AC3`, `SEC-0039-AC3` | Integration, Contract, E2E, Security | output command dan assertion; log tersanitasi tanpa secret | Parsial lokal; confirm-name/drop dan proxy same-origin regression lulus, security/E2E penuh belum                                      |
| [AC-4](test.md#ac-4) | `IT-0039-AC4`, `CT-0039-AC4`, `SEC-0039-AC4`                 | Integration, Contract, Security      | output command dan assertion; log tersanitasi tanpa secret | Lulus lokal pada audit create/drop, exact confirmation, dan denial event melalui server tests/contract; external review tetap terpisah |
| [AC-5](test.md#ac-5) | `UT-0039-AC5`, `IT-0039-AC5`, `E2E-0039-AC5`, `SEC-0039-AC5` | Unit, Integration, E2E, Security     | output command dan assertion; log tersanitasi tanpa secret | Parsial lokal; real-browser create/drop lulus pada kedua engine, audit/security penuh belum                                            |
| [AC-6](test.md#ac-6) | `IT-0039-AC6`, `E2E-0039-AC6`, `SEC-0039-AC6`                | Integration, E2E, Security           | output command dan assertion; log tersanitasi tanpa secret | Server service test membuktikan provider conflict diteruskan dan failure audit tercatat; real browser kedua engine masih belum         |

## Urutan verifikasi

1. Catat commit, versi Bun, sistem operasi, dan environment yang benar benar dipakai.
2. Dari akar repo, jalankan pemeriksaan satu manifest, lint, typecheck, serta command test yang tersedia pada `package.json` akar.
3. Jalankan seluruh test ID pada matriks sesuai jenisnya. Jangan mengganti integration atau operational proof dengan mock.
4. Kumpulkan manual, staged, environment, atau external proof yang ditetapkan. Jangan menandainya lulus bila dependency belum tersedia.
5. Simpan evidence yang tersanitasi, lalu isi result per AC dan verdict akhir.

## Pemeriksaan otomatis

| Area        | Command source                                        | Expected result                                                  |
| ----------- | ----------------------------------------------------- | ---------------------------------------------------------------- |
| Unit        | Script root yang didaftarkan pada satu `package.json` | Semua `UT-0039-*` lulus dan memiliki assertion yang menutup AC.  |
| Integration | Script root yang didaftarkan pada satu `package.json` | Resource nyata disposable dipakai dan cleanup lulus.             |
| Contract    | Script root yang didaftarkan pada satu `package.json` | Semua `CT-0039-*` lulus dan memiliki assertion yang menutup AC.  |
| E2E         | Script root yang didaftarkan pada satu `package.json` | Semua `E2E-0039-*` lulus dan memiliki assertion yang menutup AC. |
| Security    | Script root yang didaftarkan pada satu `package.json` | Semua `SEC-0039-*` lulus dan memiliki assertion yang menutup AC. |

## Pemeriksaan manual, staged, environment, atau external

Tidak ada manual atau external proof khusus yang diidentifikasi. Pemeriksaan reviewer tetap wajib untuk evidence otomatis.

## Catatan eksekusi

| 2026-08-30 | working tree | Playwright dengan PostgreSQL dan MySQL disposable | Real database workflow E2E **4 passed dalam 2,6 menit** mencakup create/drop database melalui UI pada PostgreSQL dan MySQL. | [Real query workflow evidence](../evidence/2026-08-30-real-query-workflows.md) |

| 2026-08-30 | Working tree | MySQL 8.0/latest disposable 3380/3384, root fixture credential | **4 pass, 0 fail, 18 assertions** pada database management dan table-operation integration; create/list/properties/drop database nyata lulus pada kedua versi | `MYSQL_8_0_URL='mysql://root:<fixture-root-password>@127.0.0.1:3380/fixture?ssl=disable' MYSQL_LATEST_URL='mysql://root:<fixture-root-password>@127.0.0.1:3384/fixture?ssl=disable' bun test --isolate tests/integration/mysql/database-management.test.ts tests/integration/table-operations/real-table-operations.test.ts` |

| Waktu      | Commit       | Environment                                                          | Hasil                                                                                                                                                       | Evidence                                                                                              |
| ---------- | ------------ | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 2026-08-29 | Working tree | Bun 1.4.0, server dan contract tests                                 | 4 server test pass, 14 assertions; provider options, create/drop audit, ownership guard, exact confirmation, provider conflict, dan proxy-origin CSRF lulus | `apps/server/test/database-management.test.ts`; `tests/contract/database-management.test.ts`          |
| 2026-08-29 | Working tree | PostgreSQL disposable 55433                                          | 1 test lulus; 12 assertions; create/list/properties/drop database nyata                                                                                     | `MYADMIN_POSTGRES_INTEGRATION=1 bun test tests/integration/postgresql/database-management.test.ts`    |
| 2026-08-29 | Working tree | MySQL 8.0.43/8.4.6 disposable 3380/3384, fixture privilege disiapkan | 2 test lulus; create/list/properties/drop database nyata                                                                                                    | `MYSQL_8_0_URL=... MYSQL_LATEST_URL=... bun test tests/integration/mysql/database-management.test.ts` |
| 2026-08-29 | Working tree | PostgreSQL disposable 55433 dan MySQL disposable 3380, browser UI    | Real browser flow `E2E-0039-AC1`, `E2E-0039-AC2`, dan `E2E-0039-AC5`: 1 pass; properties, create, dan exact-name drop lulus pada kedua engine               | `tests/e2e/web/zz-real-query-editor.spec.ts`; `docs/specs/evidence/2026-08-29-browser.md`             |
| 2026-08-29 | Working tree | Bun 1.4.0, database-management browser fixture                       | Database management mock E2E **1 pass dalam 6,7 detik**; provider options, properties, create, confirmation, dan drop request lulus                         | `bun run test:e2e -- tests/e2e/web/zz-database-management.spec.ts`                                    |

## Gap dan blocker

| AC               | Gap                                                                                                                                                                                                | Dampak                    | Tindak lanjut                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------- |
| AC-1, AC-5, AC-6 | Backend, provider conflict, contract, integration dua engine, halaman UI, dan real-browser database flow sudah tersedia; security matrix penuh dan seluruh acceptance mapping masih belum ditutup. | Acceptance tetap parsial. | Lengkapi security matrix dan proof AC yang tersisa. |

## Verdict akhir

Belum diverifikasi. Status ini hanya boleh berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau.
