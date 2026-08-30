# Verify 0041. Table designer: kolom dan properti

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

| AC                   | Test atau proof ID                                           | Metode                               | Bukti wajib                                                | Result                                                                                                                                       |
| -------------------- | ------------------------------------------------------------ | ------------------------------------ | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| [AC-1](test.md#ac-1) | `UT-0041-AC1`, `IT-0041-AC1`, `E2E-0041-AC1`                 | Unit, Integration, E2E               | output command dan assertion                               | Parsial lokal; real-engine browser flow lulus, unit/integration evidence belum lengkap                                                       |
| [AC-2](test.md#ac-2) | `UT-0041-AC2`, `IT-0041-AC2`, `E2E-0041-AC2`                 | Unit, Integration, E2E               | output command dan assertion                               | Parsial lokal; real-engine browser flow lulus, unit/integration evidence belum lengkap                                                       |
| [AC-3](test.md#ac-3) | `UT-0041-AC3`, `IT-0041-AC3`, `CT-0041-AC3`, `E2E-0041-AC3`  | Unit, Integration, Contract, E2E     | output command dan assertion                               | Lulus lokal pada contract, integration, dan browser                                                                                          |
| [AC-4](test.md#ac-4) | `IT-0041-AC4`, `CT-0041-AC4`, `E2E-0041-AC4`, `SEC-0041-AC4` | Integration, Contract, E2E, Security | output command dan assertion; log tersanitasi tanpa secret | Lulus lokal pada route, provider, dan browser                                                                                                |
| [AC-5](test.md#ac-5) | `UT-0041-AC5`, `IT-0041-AC5`, `CT-0041-AC5`                  | Unit, Integration, Contract          | output command dan assertion                               | Lulus lokal pada provider validation, PostgreSQL/MySQL disposable integration, dan contract; formal review lintas environment tetap terpisah |
| [AC-6](test.md#ac-6) | `IT-0041-AC6`, `SEC-0041-AC6`                                | Integration, Security                | output command dan assertion; log tersanitasi tanpa secret | Lulus lokal pada integration dan security                                                                                                    |
| [AC-7](test.md#ac-7) | `UT-0041-AC7`, `IT-0041-AC7`, `E2E-0041-AC7`                 | Unit, Integration, E2E               | output command dan assertion                               | Lulus lokal pada unit, integration, dan browser                                                                                              |
| [AC-8](test.md#ac-8) | `UT-0041-AC8`, `IT-0041-AC8`, `E2E-0041-AC8`, `SEC-0041-AC8` | Unit, Integration, E2E, Security     | output command dan assertion; log tersanitasi tanpa secret | Local unit/integration/security dan real-engine E2E lulus; audit browser tetap dinilai dari evidence E2E, bukan security suite terpisah      |

## Urutan verifikasi

1. Catat commit, versi Bun, sistem operasi, dan environment yang benar benar dipakai.
2. Dari akar repo, jalankan pemeriksaan satu manifest, lint, typecheck, serta command test yang tersedia pada `package.json` akar.
3. Jalankan seluruh test ID pada matriks sesuai jenisnya. Jangan mengganti integration atau operational proof dengan mock.
4. Kumpulkan manual, staged, environment, atau external proof yang ditetapkan. Jangan menandainya lulus bila dependency belum tersedia.
5. Simpan evidence yang tersanitasi, lalu isi result per AC dan verdict akhir.

## Pemeriksaan otomatis

| Area        | Command source                                        | Expected result                                                  |
| ----------- | ----------------------------------------------------- | ---------------------------------------------------------------- |
| Unit        | Script root yang didaftarkan pada satu `package.json` | Semua `UT-0041-*` lulus dan memiliki assertion yang menutup AC.  |
| Integration | Script root yang didaftarkan pada satu `package.json` | Resource nyata disposable dipakai dan cleanup lulus.             |
| Contract    | Script root yang didaftarkan pada satu `package.json` | Semua `CT-0041-*` lulus dan memiliki assertion yang menutup AC.  |
| E2E         | Script root yang didaftarkan pada satu `package.json` | Semua `E2E-0041-*` lulus dan memiliki assertion yang menutup AC. |
| Security    | Script root yang didaftarkan pada satu `package.json` | Semua `SEC-0041-*` lulus dan memiliki assertion yang menutup AC. |

## Pemeriksaan manual, staged, environment, atau external

Tidak ada manual atau external proof khusus yang diidentifikasi. Pemeriksaan reviewer tetap wajib untuk evidence otomatis.

## Catatan eksekusi

| 2026-08-30 | working tree | Playwright dengan PostgreSQL dan MySQL disposable | Real workflow E2E **4 passed dalam 2,6 menit** mencakup operasi table-designer provider nyata. | [Real query workflow evidence](../evidence/2026-08-30-real-query-workflows.md) |

| Waktu      | Commit       | Environment                                                                      | Hasil                                                                                                                                                                    | Evidence                                                                                                                                                                                                                                                               |
| ---------- | ------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-29 | working tree | Bun 1.4.0, macOS arm64, PostgreSQL 55433 dan MySQL 3380/3384                     | Table-designer integration **3 pass, 15 assertions**; PostgreSQL 1 pass dan MySQL 8.0/latest 2 pass                                                                      | `MYADMIN_POSTGRES_INTEGRATION=1 bun test tests/integration/postgresql/table-designer.test.ts`; `MYSQL_8_0_URL=... MYSQL_LATEST_URL=... bun test tests/integration/mysql/table-designer.test.ts`                                                                        |
| 2026-08-29 | working tree | Bun 1.4.0, table-designer providers/service/contract dan Playwright mock browser | **16 pass, 30 assertions** pada unit/service/contract; browser suite terbaru **8 pass dalam 8,7 detik**, termasuk drop column destructive confirmation dan apply payload | `bun test packages/database-postgresql/test/table-designer.test.ts packages/database-mysql/test/table-designer.test.ts apps/server/test/table-designer.test.ts tests/contract/table-designer.test.ts`; `bun run test:e2e -- tests/e2e/web/zzzz-table-designer.spec.ts` |
| 2026-08-29 | working tree | PostgreSQL disposable 55433 dan MySQL disposable 3380, browser UI                | Real two-engine table-designer E2E termasuk column/index/constraint path lulus dalam suite **4 pass**                                                                    | `MYADMIN_REAL_DATABASE_E2E=1 bun run test:e2e -- tests/e2e/web/zz-real-query-editor.spec.ts`                                                                                                                                                                           |
| 2026-08-30 | working tree | PostgreSQL disposable 55433 dan MySQL 8.0/latest disposable 3380/3384            | Validation integration **9 pass, 0 fail, 40 assertions**; incompatible boolean defaults rejected with field-level issue pada ketiga fixture                              | `MYADMIN_POSTGRES_INTEGRATION=1 bun test --isolate tests/integration/postgresql/table-designer.test.ts`; `MYSQL_8_0_URL=... MYSQL_LATEST_URL=... bun test --isolate tests/integration/mysql/table-designer.test.ts`                                                    |

## Gap dan blocker

| AC   | Gap                                                                                                                                                                                                       | Dampak                                          | Tindak lanjut                                                                          |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| AC-8 | Unit/integration kini mencakup seluruh katalog tipe pada kedua engine dan security test memeriksa audit tanpa leakage; browser dua engine tetap bergantung pada evidence real-browser yang sudah dicatat. | Verdict spec tetap mengikuti review seluruh AC. | Pertahankan evidence E2E dan lakukan reviewer sign-off sebelum verdict spec dinaikkan. |

## Verdict akhir

Belum diverifikasi. Status ini hanya boleh berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau.
