# Verify 0004. Pipeline codegen dan contract test

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Verdict**: Terverifikasi
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

| AC                   | Test atau proof ID | Metode                | Bukti wajib                  | Result                                         |
| -------------------- | ------------------ | --------------------- | ---------------------------- | ---------------------------------------------- |
| [AC-1](test.md#ac-1) | `CT-0004-AC1`      | Contract              | output command dan assertion | Lulus lokal pada `bun run test:contract`       |
| [AC-2](test.md#ac-2) | `SMOKE-0004-AC2`   | Smoke dan operational | output command dan assertion | Lulus lokal dan hosted Contract workflow       |
| [AC-3](test.md#ac-3) | `CT-0004-AC3`      | Contract              | output command dan assertion | Lulus lokal pada `bun run test:contract`       |
| [AC-4](test.md#ac-4) | `CT-0004-AC4`      | Contract              | output command dan assertion | Lulus lokal pada `bun run test:contract`       |
| [AC-5](test.md#ac-5) | `CT-0004-AC5`      | Contract              | output command dan assertion | Lulus lokal pada `bun run test:contract`       |
| [AC-6](test.md#ac-6) | `IT-0004-AC6`      | Integration           | output command dan assertion | Lulus lokal pada `bun run test`                |
| [AC-7](test.md#ac-7) | `SMOKE-0004-AC7`   | Smoke dan operational | output command dan assertion | Lulus lokal dan hosted `contract.yml` workflow |

## Urutan verifikasi

1. Catat commit, versi Bun, sistem operasi, dan environment yang benar benar dipakai.
2. Dari akar repo, jalankan pemeriksaan satu manifest, lint, typecheck, serta command test yang tersedia pada `package.json` akar.
3. Jalankan seluruh test ID pada matriks sesuai jenisnya. Jangan mengganti integration atau operational proof dengan mock.
4. Kumpulkan manual, staged, environment, atau external proof yang ditetapkan. Jangan menandainya lulus bila dependency belum tersedia.
5. Simpan evidence yang tersanitasi, lalu isi result per AC dan verdict akhir.

## Pemeriksaan otomatis

| Area                  | Command source                                        | Expected result                                                         |
| --------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------- |
| Integration           | Script root yang didaftarkan pada satu `package.json` | Resource nyata disposable dipakai dan cleanup lulus.                    |
| Contract              | Script root yang didaftarkan pada satu `package.json` | Semua `CT-0004-*` lulus dan memiliki assertion yang menutup AC.         |
| Smoke dan operational | Script root yang didaftarkan pada satu `package.json` | Artefak atau workflow berjalan pada environment bersih yang ditetapkan. |

## Pemeriksaan manual, staged, environment, atau external

Tidak ada manual atau external proof khusus yang diidentifikasi. Pemeriksaan reviewer tetap wajib untuk evidence otomatis.

## Evidence lokal terbaru

| Command                                    | Result                                                                              | Coverage                                                                                                      |
| ------------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `bun test tests/contract/contract.test.ts` | 8 pass, 0 fail                                                                      | Codegen deterministik, route coverage, response schema, format `date-time`, dan ApiError.                     |
| `bun run test:contract`                    | 71 pass, 0 fail, 812 assertions                                                     | Seluruh contract test yang terdaftar pada root command.                                                       |
| `bun run validate-contract`                | Lulus                                                                               | OpenAPI, ApiError, security, pagination, capability, path, dan WebSocket contract.                            |
| `bun run check:contract-drift`             | Lulus                                                                               | Generated types tidak mengalami drift setelah regenerate.                                                     |
| `bun run test`                             | Run historis 645 pass; rerun fixture-terbaru **664 pass, 0 fail, 4.532 assertions** | Regression suite terbaru dengan fixture disposable aktif lulus; hosted `contract.yml` tetap belum dibuktikan. |

Evidence di atas membuktikan jalur lokal dan hosted Contract workflow pada commit `2544dcd`.

## Catatan eksekusi

| 2026-08-30 | working tree | Bun 1.4.0, generated contract lokal | Test foundation **20 pass, 0 fail, 538 assertions**; `SMOKE-0004-AC2` drift check dan `SMOKE-0004-AC7` workflow wiring lulus secara lokal. Hosted `contract.yml` run tetap belum dibuktikan. | `bun test --isolate tests/contract/foundation-acceptance.test.ts` |

| Waktu      | Commit       | Environment            | Hasil                                                                                                                                    | Evidence                                                                             |
| ---------- | ------------ | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 2026-08-30 | working tree | Bun 1.4.0, macOS arm64 | **71 contract test, 812 assertions** lulus setelah validate, regenerate, drift check, bundle, dan contract run; hosted CI belum terbukti | `bun run validate-contract && bun run check:contract-drift && bun run test:contract` |

## Gap dan blocker

| AC  | Gap                                                                 | Dampak                                                              | Tindak lanjut                            |
| --- | ------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------- |
| -   | Tidak ada gap acceptance setelah hosted Contract workflow berhasil. | Semua acceptance memiliki evidence lokal dan hosted yang ditautkan. | Pertahankan tautan run sebagai evidence. |

## Verdict akhir

Terverifikasi untuk seluruh acceptance criteria pada evidence lokal dan hosted Contract run yang ditautkan.
