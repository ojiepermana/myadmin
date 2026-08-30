# Verify 0035. Query cancel dan EXPLAIN

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

| AC                   | Test atau proof ID            | Metode            | Bukti wajib                  | Result                                                                                                                                                                                                                 |
| -------------------- | ----------------------------- | ----------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [AC-1](test.md#ac-1) | `IT-0035-AC1`, `E2E-0035-AC1` | Integration, E2E  | output command dan assertion | Lulus lokal pada cancel integration dan real browser API workflow kedua engine                                                                                                                                         |
| [AC-2](test.md#ac-2) | `IT-0035-AC2`, `E2E-0035-AC2` | Integration, E2E  | output command dan assertion | Lulus lokal pada cancel integration dan real browser API workflow kedua engine                                                                                                                                         |
| [AC-3](test.md#ac-3) | `E2E-0035-AC3`                | E2E               | output command dan assertion | Mock E2E mengaktifkan tombol Cancel saat execution running, klik Cancel, dan memverifikasi state Cancelled                                                                                                             |
| [AC-4](test.md#ac-4) | `UT-0035-AC4`, `IT-0035-AC4`  | Unit, Integration | output command dan assertion | Lulus lokal pada unit dan route integration                                                                                                                                                                            |
| [AC-5](test.md#ac-5) | `IT-0035-AC5`, `E2E-0035-AC5` | Integration, E2E  | output command dan assertion | Explain integration, real browser API, dan mock E2E tombol Explain lulus                                                                                                                                               |
| [AC-6](test.md#ac-6) | `IT-0035-AC6`, `E2E-0035-AC6` | Integration, E2E  | output command dan assertion | Capability gate dan non-EXPLAINable server error 422 kini terbukti pada integration/browser mock; visual/manual dan full acceptance tetap terpisah                                                                     |
| [AC-7](test.md#ac-7) | `IT-0035-AC7`, `E2E-0035-AC7` | Integration, E2E  | output command dan assertion | Lulus lokal pada session consistency integration dan real browser API workflow                                                                                                                                         |
| [AC-8](test.md#ac-8) | `IT-0035-AC8`, `E2E-0035-AC8` | Integration, E2E  | output command dan assertion | Lulus lokal: provider integration nyata membuktikan plan EXPLAIN non-empty dan long-query cancel pada PostgreSQL serta MySQL 8.0/latest; real browser API membuktikan workflow UI; hosted/manual review tetap terpisah |

## Urutan verifikasi

1. Catat commit, versi Bun, sistem operasi, dan environment yang benar benar dipakai.
2. Dari akar repo, jalankan pemeriksaan satu manifest, lint, typecheck, serta command test yang tersedia pada `package.json` akar.
3. Jalankan seluruh test ID pada matriks sesuai jenisnya. Jangan mengganti integration atau operational proof dengan mock.
4. Kumpulkan manual, staged, environment, atau external proof yang ditetapkan. Jangan menandainya lulus bila dependency belum tersedia.
5. Simpan evidence yang tersanitasi, lalu isi result per AC dan verdict akhir.

## Pemeriksaan otomatis

| Area        | Command source                                        | Expected result                                                  |
| ----------- | ----------------------------------------------------- | ---------------------------------------------------------------- |
| Unit        | Script root yang didaftarkan pada satu `package.json` | Semua `UT-0035-*` lulus dan memiliki assertion yang menutup AC.  |
| Integration | Script root yang didaftarkan pada satu `package.json` | Resource nyata disposable dipakai dan cleanup lulus.             |
| E2E         | Script root yang didaftarkan pada satu `package.json` | Semua `E2E-0035-*` lulus dan memiliki assertion yang menutup AC. |

## Pemeriksaan manual, staged, environment, atau external

Tidak ada manual atau external proof khusus yang diidentifikasi. Pemeriksaan reviewer tetap wajib untuk evidence otomatis.

## Catatan eksekusi

| Waktu      | Commit       | Environment                                                        | Hasil                                                                                                                                                                    | Evidence                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------- | ------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-30 | working tree | Bun 1.4.0, macOS arm64, PostgreSQL dan MySQL disposable            | Root regression terbaru **664 pass, 0 fail, 4.532 assertions**; real E2E fokus 4 pass, 0 skip, 0 fail                                                                    | `docs/specs/evidence/2026-08-29-e2e.md` dan `docs/specs/evidence/2026-08-29-external.md`                                                                                                                                                                                                                                                                                                     |
| 2026-08-29 | working tree | Bun 1.4.0, local query/realtime slice dan mock browser             | Unit/integration/contract subset **24 pass, 138 assertions**; mock query editor E2E membuktikan Cancel, Explain success/error, dan typed result flow                     | `bun test tests/verification/query-realtime-acceptance.test.ts apps/server/test/query-execution.test.ts tests/contract/query-execution.test.ts apps/web/test/result-grid.test.ts`; `bun run test:e2e -- tests/e2e/web/zz-query-editor.spec.ts`                                                                                                                                               |
| 2026-08-30 | working tree | Bun 1.4.0, query/realtime acceptance dan view/data safeguards      | **17 pass, 0 fail, 114 assertions**; execution sequencing, tab session, cancel, EXPLAIN, typed result/export, dan related provider safeguards lulus                      | `bun test --isolate tests/verification`                                                                                                                                                                                                                                                                                                                                                      |
| 2026-08-30 | working tree | PostgreSQL disposable 55433, MySQL 8.0/latest disposable 3380/3384 | Provider integration **36 pass, 0 fail, 129 assertions**; `EXPLAIN SELECT 1` mengembalikan plan non-empty dan long-running query berhasil dibatalkan pada ketiga fixture | `MYADMIN_POSTGRES_INTEGRATION=1 bun test --isolate tests/integration/postgresql/provider.test.ts`; `MYADMIN_MYSQL_SECURITY_INTEGRATION=1 MYSQL_8_0_URL='mysql://fixture:<fixture-password>@127.0.0.1:3380/fixture?sslmode=require' MYSQL_LATEST_URL='mysql://fixture:<fixture-password>@127.0.0.1:3384/fixture?sslmode=require' bun test --isolate tests/integration/mysql/provider.test.ts` |

## Gap dan blocker

| AC   | Gap                                                                                              | Dampak                            | Tindak lanjut                                                    |
| ---- | ------------------------------------------------------------------------------------------------ | --------------------------------- | ---------------------------------------------------------------- |
| AC-6 | Capability gate dan error branch UI sudah terbukti; visual/manual serta hosted review belum ada. | Verdict tetap belum diverifikasi. | Pertahankan evidence dan lengkapi review yang memang diperlukan. |

## Verdict akhir

Belum diverifikasi. Status ini hanya boleh berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau.
