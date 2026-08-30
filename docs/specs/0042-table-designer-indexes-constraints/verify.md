# Verify 0042. Table designer: index dan constraint

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

| AC                   | Test atau proof ID                                          | Metode                           | Bukti wajib                                                | Result                                                                                                                                                              |
| -------------------- | ----------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [AC-1](test.md#ac-1) | `UT-0042-AC1`, `IT-0042-AC1`, `E2E-0042-AC1`                | Unit, Integration, E2E           | output command dan assertion                               | Parsial lokal; provider metadata `describeTable` dan browser index flow lulus pada PostgreSQL/MySQL, tetapi seluruh E2E matrix belum                                |
| [AC-2](test.md#ac-2) | `UT-0042-AC2`, `CT-0042-AC2`, `E2E-0042-AC2`                | Unit, Contract, E2E              | output command dan assertion                               | Parsial lokal; unit/contract composite constraint lulus, seluruh E2E matrix belum                                                                                   |
| [AC-3](test.md#ac-3) | `UT-0042-AC3`, `IT-0042-AC3`, `CT-0042-AC3`, `E2E-0042-AC3` | Unit, Integration, Contract, E2E | output command dan assertion                               | Real integration dan E2E PostgreSQL/MySQL membuktikan FK dengan target/rules; proof contract/security penuh belum lengkap                                           |
| [AC-4](test.md#ac-4) | `UT-0042-AC4`, `IT-0042-AC4`, `E2E-0042-AC4`                | Unit, Integration, E2E           | output command dan assertion                               | Lokal lulus: unit/provider preview dan browser check-expression plus capability gate MySQL terbukti; hosted/manual acceptance tetap belum                           |
| [AC-5](test.md#ac-5) | `UT-0042-AC5`, `IT-0042-AC5`, `E2E-0042-AC5`                | Unit, Integration, E2E           | output command dan assertion                               | Composite unique, FK supporting behavior, dan urutan kolom dipreview serta diterapkan pada kedua engine nyata                                                       |
| [AC-6](test.md#ac-6) | `IT-0042-AC6`, `E2E-0042-AC6`, `SEC-0042-AC6`               | Integration, E2E, Security       | output command dan assertion; log tersanitasi tanpa secret | Lokal lulus untuk integration, E2E, dan security confirmation boundary; manual/hosted acceptance tetap belum                                                        |
| [AC-7](test.md#ac-7) | `UT-0042-AC7`, `IT-0042-AC7`, `E2E-0042-AC7`                | Unit, Integration, E2E           | output command dan assertion                               | Lokal lulus untuk destructive warning, integration provider, dan refresh `rowIdentity` Data Browser setelah PK ditambahkan; hosted/manual acceptance tetap terpisah |
| [AC-8](test.md#ac-8) | `UT-0042-AC8`, `IT-0042-AC8`, `E2E-0042-AC8`                | Unit, Integration, E2E           | output command dan assertion                               | Real integration dan E2E kedua engine lulus untuk FK dengan aturan, composite unique, preview, dan destructive drop                                                 |

## Urutan verifikasi

1. Catat commit, versi Bun, sistem operasi, dan environment yang benar benar dipakai.
2. Dari akar repo, jalankan pemeriksaan satu manifest, lint, typecheck, serta command test yang tersedia pada `package.json` akar.
3. Jalankan seluruh test ID pada matriks sesuai jenisnya. Jangan mengganti integration atau operational proof dengan mock.
4. Kumpulkan manual, staged, environment, atau external proof yang ditetapkan. Jangan menandainya lulus bila dependency belum tersedia.
5. Simpan evidence yang tersanitasi, lalu isi result per AC dan verdict akhir.

## Pemeriksaan otomatis

| Area        | Command source                                        | Expected result                                                  |
| ----------- | ----------------------------------------------------- | ---------------------------------------------------------------- |
| Unit        | Script root yang didaftarkan pada satu `package.json` | Semua `UT-0042-*` lulus dan memiliki assertion yang menutup AC.  |
| Integration | Script root yang didaftarkan pada satu `package.json` | Resource nyata disposable dipakai dan cleanup lulus.             |
| Contract    | Script root yang didaftarkan pada satu `package.json` | Semua `CT-0042-*` lulus dan memiliki assertion yang menutup AC.  |
| E2E         | Script root yang didaftarkan pada satu `package.json` | Semua `E2E-0042-*` lulus dan memiliki assertion yang menutup AC. |
| Security    | Script root yang didaftarkan pada satu `package.json` | Semua `SEC-0042-*` lulus dan memiliki assertion yang menutup AC. |

## Pemeriksaan manual, staged, environment, atau external

Tidak ada manual atau external proof khusus yang diidentifikasi. Pemeriksaan reviewer tetap wajib untuk evidence otomatis.

## Catatan eksekusi

| 2026-08-30 | working tree | Playwright local web server dengan API fixture | Table Designer UI **11 passed dalam 10,6 detik**; composite index, replacement, check constraint, capability gate, dan PK refresh lulus. | [Table Designer UI evidence](../evidence/2026-08-30-table-designer-ui.md) |

| 2026-08-30 | working tree | Playwright dengan PostgreSQL dan MySQL disposable | Real workflow E2E **4 passed dalam 2,6 menit** mencakup FK, composite unique, dan drop index pada kedua engine. | [Real query workflow evidence](../evidence/2026-08-30-real-query-workflows.md) |

| Waktu      | Commit       | Environment                                                                     | Hasil                                                                                                                                                                                                                         | Evidence                                                                                                                                                                                                                                                               |
| ---------- | ------------ | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-29 | Working tree | Bun 1.4.0, macOS arm64, provider table-designer unit suite                      | **11 pass, 16 assertions**; composite indexes, PK/FK/CHECK constraints, destructive drops, version gates, dan validation lulus                                                                                                | `bun test packages/database-mysql/test/table-designer.test.ts packages/database-postgresql/test/table-designer.test.ts`                                                                                                                                                |
| 2026-08-29 | Working tree | Bun 1.4.0, table-designer provider/service/contract dan Playwright mock browser | Suite gabungan **16 pass, 30 assertions**; browser index/constraint flow termasuk ordered composite index dan preview gate lulus; real-engine two-engine evidence tetap dicatat terpisah                                      | `bun test packages/database-postgresql/test/table-designer.test.ts packages/database-mysql/test/table-designer.test.ts apps/server/test/table-designer.test.ts tests/contract/table-designer.test.ts`; `bun run test:e2e -- tests/e2e/web/zzzz-table-designer.spec.ts` |
| 2026-08-29 | Working tree | PostgreSQL disposable 55433 dan MySQL disposable 3380, browser UI               | Real two-engine E2E **4 pass**; FK, composite unique, ordered index preview/apply, dan drop index dengan konfirmasi lulus                                                                                                     | `MYADMIN_REAL_DATABASE_E2E=1 bun run test:e2e -- tests/e2e/web/zz-real-query-editor.spec.ts`                                                                                                                                                                           |
| 2026-08-30 | Working tree | Bun 1.4.0, PostgreSQL disposable 55433, MySQL 8.0/latest disposable 3380/3384   | Table-designer integration **6 pass, 0 fail, 37 assertions**; FK, composite unique, destructive constraint preview/apply, metadata readback, dan index changes lulus pada kedua engine                                        | `MYADMIN_POSTGRES_INTEGRATION=1 ... MYSQL_8_0_URL=... MYSQL_LATEST_URL=... bun test --isolate tests/integration/postgresql/table-designer.test.ts tests/integration/mysql/table-designer.test.ts`                                                                      |
| 2026-08-30 | Working tree | Bun 1.4.0, mock browser dan OpenAPI contract bundle                             | Contract suite **74 pass, 0 fail, 820 assertions**; table-designer browser suite **6 pass, 0 fail dalam 8,0 detik**. `E2E-0042-AC2` memverifikasi perubahan index menjadi `dropIndex` + `addIndex` dan dua statement preview. | `bun run test:contract -- tests/contract/table-designer.test.ts`; `bun run test:e2e -- tests/e2e/web/zzzz-table-designer.spec.ts`                                                                                                                                      |
| 2026-08-30 | Working tree | Bun 1.4.0, PostgreSQL disposable 55433 dan MySQL disposable 3380/3384           | **3 pass, 0 fail, 24 assertions**; create table, `describeTable` metadata readback, add/drop changes, and destructive index preview/apply lulus pada kedua engine                                                             | `MYADMIN_POSTGRES_INTEGRATION=1 ... MYSQL_8_0_URL=... MYSQL_LATEST_URL=... bun test --isolate tests/integration/postgresql/table-designer.test.ts tests/integration/mysql/table-designer.test.ts`                                                                      |

## Gap dan blocker

| AC                           | Gap                                                                                                                                                       | Dampak                            | Tindak lanjut                                                                 |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------- |
| AC-1, AC-2, AC-4, AC-6, AC-7 | Integration FK/constraint dan real E2E tersedia, tetapi sebagian contract/security proof, invalidasi row identity, dan failure-boundary UI belum lengkap. | Verdict tetap belum diverifikasi. | Lengkapi proof yang tersisa; jangan mengubah verdict berdasarkan E2E parsial. |

## Verdict akhir

Belum diverifikasi. Status ini hanya boleh berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau.
