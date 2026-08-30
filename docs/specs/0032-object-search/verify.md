# Verify 0032. Object search

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

| AC                   | Test atau proof ID              | Metode                | Bukti wajib                                                                         | Result                                                                                                                             |
| -------------------- | ------------------------------- | --------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| [AC-1](test.md#ac-1) | `IT-0032-AC1`, `CT-0032-AC1`    | Integration, Contract | output command dan assertion                                                        | Lulus lokal pada suite root                                                                                                        |
| [AC-2](test.md#ac-2) | `IT-0032-AC2`, `SEC-0032-AC2`   | Integration, Security | output command dan assertion; log tersanitasi tanpa secret                          | Lulus lokal pada suite root                                                                                                        |
| [AC-3](test.md#ac-3) | `UT-0032-AC3`, `E2E-0032-AC3`   | Unit, E2E             | output command dan assertion                                                        | Lulus lokal pada E2E browser                                                                                                       |
| [AC-4](test.md#ac-4) | `E2E-0032-AC4`                  | E2E                   | output command dan assertion                                                        | Lulus lokal pada E2E browser                                                                                                       |
| [AC-5](test.md#ac-5) | `UT-0032-AC5`, `E2E-0032-AC5`   | Unit, E2E             | output command dan assertion                                                        | Lulus lokal pada unit dan E2E browser                                                                                              |
| [AC-6](test.md#ac-6) | `E2E-0032-AC6`, `PERF-0032-AC6` | E2E, Performance      | output command dan assertion; dataset, baseline, ambang, pengulangan, dan toleransi | Real browser run dua engine lulus: 50/100 hasil, search <5 detik, dan reveal node; metadata performance PostgreSQL/MySQL 3/3 lulus |

## Urutan verifikasi

1. Catat commit, versi Bun, sistem operasi, dan environment yang benar benar dipakai.
2. Dari akar repo, jalankan pemeriksaan satu manifest, lint, typecheck, serta command test yang tersedia pada `package.json` akar.
3. Jalankan seluruh test ID pada matriks sesuai jenisnya. Jangan mengganti integration atau operational proof dengan mock.
4. Kumpulkan manual, staged, environment, atau external proof yang ditetapkan. Jangan menandainya lulus bila dependency belum tersedia.
5. Simpan evidence yang tersanitasi, lalu isi result per AC dan verdict akhir.

## Pemeriksaan otomatis

| Area        | Command source                                        | Expected result                                                  |
| ----------- | ----------------------------------------------------- | ---------------------------------------------------------------- |
| Unit        | Script root yang didaftarkan pada satu `package.json` | Semua `UT-0032-*` lulus dan memiliki assertion yang menutup AC.  |
| Integration | Script root yang didaftarkan pada satu `package.json` | Resource nyata disposable dipakai dan cleanup lulus.             |
| Contract    | Script root yang didaftarkan pada satu `package.json` | Semua `CT-0032-*` lulus dan memiliki assertion yang menutup AC.  |
| E2E         | Script root yang didaftarkan pada satu `package.json` | Semua `E2E-0032-*` lulus dan memiliki assertion yang menutup AC. |
| Security    | Script root yang didaftarkan pada satu `package.json` | Semua `SEC-0032-*` lulus dan memiliki assertion yang menutup AC. |
| Performance | Script root yang didaftarkan pada satu `package.json` | Dataset dan threshold terukur tercatat serta terpenuhi.          |

## Pemeriksaan manual, staged, environment, atau external

Tidak ada manual atau external proof khusus yang diidentifikasi. Pemeriksaan reviewer tetap wajib untuk evidence otomatis.

## Catatan eksekusi

| 2026-08-30 | working tree | Bun dengan PostgreSQL disposable | Provider performance **3 pass, 0 fail, 15 assertions dalam 2,39 detik**; metadata/search pada schema 2.000 tabel berada di bawah ambang lokal. | [Provider performance evidence](../evidence/2026-08-30-provider-performance.md) |

| 2026-08-30 | working tree | Playwright dengan PostgreSQL dan MySQL disposable | Real workflow E2E **4 passed dalam 2,6 menit** mencakup pencarian object pada katalog nyata. | [Real query workflow evidence](../evidence/2026-08-30-real-query-workflows.md) |

| Waktu      | Commit       | Environment                                                                            | Hasil                                                                                                                                           | Evidence                                                                                                                                                                                                                                                               |
| ---------- | ------------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-29 | working tree | Bun 1.4.0, macOS arm64, PostgreSQL disposable 55433, MySQL disposable 3380 dan 3384    | AC lokal lulus; belum ada commit atau hosted run                                                                                                | `docs/specs/evidence/2026-08-29-browser.md`                                                                                                                                                                                                                            |
| 2026-08-29 | working tree | Bun 1.4.0, search state/integration/contract dan PostgreSQL metadata performance       | Search subset **4 pass, 35 assertions**; metadata performance **1 pass, 7 assertions**; browser explorer/search flow **1 pass dalam 8,8 detik** | `bun test apps/web/test/explorer-search-state.test.ts tests/integration/object-explorer/object-explorer.test.ts tests/contract/object-explorer.test.ts tests/performance/postgresql-metadata.test.ts`; `bun run test:e2e -- tests/e2e/web/zzz-object-explorer.spec.ts` |
| 2026-08-30 | working tree | Bun 1.4.0, PostgreSQL disposable 55433 dengan fixture 2.000 tabel                      | Metadata page/search **1 pass, 7 assertions**; threshold <1 detik terpenuhi untuk page 100 dan search 50                                        | `MYADMIN_POSTGRES_INTEGRATION=1 MYADMIN_POSTGRES_CURRENT_PORT=55433 bun test tests/performance/postgresql-metadata.test.ts`                                                                                                                                            |
| 2026-08-30 | working tree | Bun 1.4.0, MySQL 8.0 port 3380 dan latest port 3384 dengan fixture metadata disposable | Metadata/search kedua engine **18 pass, 362 assertions dalam 32,42 detik**; performance catalog/search lulus pada MySQL 8.0 dan latest          | `MYSQL_8_0_URL='mysql://fixture:myadmin-test-password@127.0.0.1:3380/fixture?sslmode=require' MYSQL_LATEST_URL='mysql://fixture:myadmin-test-password@127.0.0.1:3384/fixture?sslmode=require' bun test tests/integration/mysql/metadata.test.ts --timeout 20000`       |

## Gap dan blocker

| AC               | Gap                                                              | Dampak                                                                                | Tindak lanjut                                          |
| ---------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| AC-1 sampai AC-5 | Proof lokal tersedia dari suite root dan browser contract E2E.   | Belum ada hosted atau review eksternal yang diperlukan untuk menaikkan status proyek. | Pertahankan evidence dan tinjau pada CI bila tersedia. |
| AC-6             | Proof real browser lokal sudah lulus; hosted run belum tersedia. | Belum ada hosted atau review eksternal yang diperlukan untuk menaikkan status proyek. | Pertahankan evidence dan tinjau pada CI bila tersedia. |

## Verdict akhir

Belum diverifikasi. Status ini hanya boleh berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau.
