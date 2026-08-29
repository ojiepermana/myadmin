# Verify 0030. Workspace persistence

**Date**: 2026-08-29
**Spec status**: mengikuti [index.md](index.md)
**Verdict**: Lulus
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md)

## Ruang verifikasi

Verifikasi membuktikan perilaku implementasi terhadap seluruh acceptance criteria pada [test.md](test.md#acceptance-criteria). File ini tidak mengubah definisi AC dan tidak boleh diberi verdict lulus sebelum aplikasi, test, serta environment yang relevan benar benar dijalankan.

## Prasyarat eksekusi

| Kebutuhan     | Cara memeriksa                                                                   | Status awal                                                                    |
| ------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Implementasi  | Build plan pada `index.md` selesai untuk slice yang diverifikasi.                | Lulus; `bun run build:web` lulus                                               |
| Dependency    | Semua relation `requires` pada `relation.md` sudah diterima.                     | Lulus                                                                          |
| Root manifest | Tepat satu `package.json` ada di akar dan tidak ada manifest nested.             | Lulus; `bun run check:manifests` lulus                                         |
| Test plan     | Test ID relevan pada `test.md` sudah diimplementasikan.                          | Lulus                                                                          |
| Environment   | Service, database, browser, VM, certificate, atau akun yang dibutuhkan tersedia. | Browser dan SQLite disposable tersedia; tidak ada environment eksternal khusus |

## Matriks verifikasi AC

| AC                   | Test atau proof ID             | Metode                | Bukti wajib                                                | Result                                  |
| -------------------- | ------------------------------ | --------------------- | ---------------------------------------------------------- | --------------------------------------- |
| [AC-1](test.md#ac-1) | `IT-0030-AC1`, `CT-0030-AC1`   | Integration, Contract | output command dan assertion                               | Lulus: focused integration dan contract |
| [AC-2](test.md#ac-2) | `UT-0030-AC2`, `CT-0030-AC2`   | Unit, Contract        | output command dan assertion                               | Lulus: focused unit dan contract        |
| [AC-3](test.md#ac-3) | `UT-0030-AC3`, `E2E-0030-AC3`  | Unit, E2E             | output command dan assertion                               | Lulus: focused unit dan E2E 20/20       |
| [AC-4](test.md#ac-4) | `E2E-0030-AC4`, `SEC-0030-AC4` | E2E, Security         | output command dan assertion; log tersanitasi tanpa secret | Lulus: focused security dan E2E 20/20   |
| [AC-5](test.md#ac-5) | `UT-0030-AC5`, `E2E-0030-AC5`  | Unit, E2E             | output command dan assertion                               | Lulus: focused unit dan E2E 20/20       |
| [AC-6](test.md#ac-6) | `UT-0030-AC6`, `SEC-0030-AC6`  | Unit, Security        | output command dan assertion; log tersanitasi tanpa secret | Lulus: focused unit dan security        |
| [AC-7](test.md#ac-7) | `E2E-0030-AC7`                 | E2E                   | output command dan assertion                               | Lulus: E2E 20/20                        |

## Urutan verifikasi

1. Catat commit, versi Bun, sistem operasi, dan environment yang benar benar dipakai.
2. Dari akar repo, jalankan pemeriksaan satu manifest, lint, typecheck, serta command test yang tersedia pada `package.json` akar.
3. Jalankan seluruh test ID pada matriks sesuai jenisnya. Jangan mengganti integration atau operational proof dengan mock.
4. Kumpulkan manual, staged, environment, atau external proof yang ditetapkan. Jangan menandainya lulus bila dependency belum tersedia.
5. Simpan evidence yang tersanitasi, lalu isi result per AC dan verdict akhir.

## Pemeriksaan otomatis

| Area        | Command source                                        | Expected result                                                  |
| ----------- | ----------------------------------------------------- | ---------------------------------------------------------------- |
| Unit        | Script root yang didaftarkan pada satu `package.json` | Semua `UT-0030-*` lulus dan memiliki assertion yang menutup AC.  |
| Integration | Script root yang didaftarkan pada satu `package.json` | Resource nyata disposable dipakai dan cleanup lulus.             |
| Contract    | Script root yang didaftarkan pada satu `package.json` | Semua `CT-0030-*` lulus dan memiliki assertion yang menutup AC.  |
| E2E         | Script root yang didaftarkan pada satu `package.json` | Semua `E2E-0030-*` lulus dan memiliki assertion yang menutup AC. |
| Security    | Script root yang didaftarkan pada satu `package.json` | Semua `SEC-0030-*` lulus dan memiliki assertion yang menutup AC. |

## Pemeriksaan manual, staged, environment, atau external

Tidak ada manual atau external proof khusus yang diidentifikasi. Pemeriksaan reviewer tetap wajib untuk evidence otomatis.

## Catatan eksekusi

| Waktu      | Commit                                     | Environment                                                    | Hasil                                                                          | Evidence                                                        |
| ---------- | ------------------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| 2026-08-29 | `1cbb2fc1924a2d7b986e2e5264d865799b34f161` | Bun 1.4.0, Darwin arm64, browser Playwright, SQLite disposable | Focused slice 35 pass; contract 68 pass; security 40 pass; E2E 20 pass, 0 fail | `docs/specs/evidence/2026-08-29-e2e.md`, current command output |

## Gap dan blocker

| AC        | Gap                                                                                   | Dampak                                     | Tindak lanjut                                                                        |
| --------- | ------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------ |
| Tidak ada | Semua AC memiliki bukti dari test ID yang relevan. Spec ini tidak memiliki AC visual. | Tidak ada blocker acceptance yang tersisa. | Pertahankan evidence dan jangan menggeneralisasi hasil ini ke spec 0026 sampai 0029. |

## Verdict akhir

Lulus. Seluruh AC 0030 memiliki result dan evidence yang dapat ditinjau. Bukti ini tidak mencakup visual proof karena tidak diwajibkan oleh AC 0030.
