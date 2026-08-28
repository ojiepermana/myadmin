# Verify 0004. Pipeline codegen dan contract test

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Verdict**: Belum diverifikasi
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md)

## Ruang verifikasi

Verifikasi membuktikan perilaku implementasi terhadap seluruh acceptance criteria pada [test.md](test.md#acceptance-criteria). File ini tidak mengubah definisi AC dan tidak boleh diberi verdict lulus sebelum aplikasi, test, serta environment yang relevan benar benar dijalankan.

## Prasyarat eksekusi

| Kebutuhan     | Cara memeriksa                                                                   | Status awal     |
| ------------- | -------------------------------------------------------------------------------- | --------------- |
| Implementasi  | Build plan pada `index.md` selesai untuk slice yang diverifikasi.                | Belum siap      |
| Dependency    | Semua relation `requires` pada `relation.md` sudah diterima.                     | Belum diperiksa |
| Root manifest | Tepat satu `package.json` ada di akar dan tidak ada manifest nested.             | Belum diperiksa |
| Test plan     | Test ID relevan pada `test.md` sudah diimplementasikan.                          | Belum siap      |
| Environment   | Service, database, browser, VM, certificate, atau akun yang dibutuhkan tersedia. | Belum diperiksa |

## Matriks verifikasi AC

| AC                   | Test atau proof ID | Metode                | Bukti wajib                  | Result           |
| -------------------- | ------------------ | --------------------- | ---------------------------- | ---------------- |
| [AC-1](test.md#ac-1) | `CT-0004-AC1`      | Contract              | output command dan assertion | Belum dijalankan |
| [AC-2](test.md#ac-2) | `SMOKE-0004-AC2`   | Smoke dan operational | output command dan assertion | Belum dijalankan |
| [AC-3](test.md#ac-3) | `CT-0004-AC3`      | Contract              | output command dan assertion | Belum dijalankan |
| [AC-4](test.md#ac-4) | `CT-0004-AC4`      | Contract              | output command dan assertion | Belum dijalankan |
| [AC-5](test.md#ac-5) | `CT-0004-AC5`      | Contract              | output command dan assertion | Belum dijalankan |
| [AC-6](test.md#ac-6) | `IT-0004-AC6`      | Integration           | output command dan assertion | Belum dijalankan |
| [AC-7](test.md#ac-7) | `SMOKE-0004-AC7`   | Smoke dan operational | output command dan assertion | Belum dijalankan |

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

| Command                                    | Result                   | Coverage                                                                                             |
| ------------------------------------------ | ------------------------ | ---------------------------------------------------------------------------------------------------- |
| `bun test tests/contract/contract.test.ts` | 8 pass, 0 fail           | Codegen deterministik, route coverage, response schema, format `date-time`, dan ApiError.            |
| `bun run test:contract`                    | 24 pass, 0 fail          | Seluruh contract test yang terdaftar pada root command.                                              |
| `bun run validate-contract`                | Lulus                    | OpenAPI, ApiError, security, pagination, capability, path, dan WebSocket contract.                   |
| `bun run check:contract-drift`             | Lulus                    | Generated types tidak mengalami drift setelah regenerate.                                            |
| `bun run test`                             | 464 pass, 8 skip, 0 fail | Regression suite Bun setelah perubahan. Skip hanya integration database yang gated oleh environment. |

Evidence di atas membuktikan jalur lokal. Hosted CI `contract.yml` belum memiliki run yang dapat ditautkan untuk commit kerja ini, sehingga AC-2 dan AC-7 belum diberi verdict acceptance penuh.

## Catatan eksekusi

| Waktu      | Commit                         | Environment            | Hasil                                       | Evidence                                                     |
| ---------- | ------------------------------ | ---------------------- | ------------------------------------------- | ------------------------------------------------------------ |
| 2026-08-29 | working tree setelah `bd9ead7` | Bun 1.4.0, macOS arm64 | Jalur lokal lulus; hosted CI belum terbukti | Command dan hasil dicatat pada bagian Evidence lokal terbaru |

## Gap dan blocker

| AC         | Gap                                                                   | Dampak                                                              | Tindak lanjut                                                       |
| ---------- | --------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| AC-2, AC-7 | Bukti hosted CI `contract.yml` untuk commit kerja ini belum tersedia. | Jalur lokal lulus, tetapi acceptance operational CI belum terbukti. | Jalankan workflow pada hosted CI dan tautkan run serta artefaknya.  |
| Semua AC   | Evidence lokal tidak menggantikan proof external atau hosted CI.      | Verdict spec tetap belum diverifikasi.                              | Lengkapi proof yang diwajibkan lalu evaluasi ulang seluruh matriks. |

## Verdict akhir

Belum diverifikasi. Status ini hanya boleh berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau.
