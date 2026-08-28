# Verify 0042. Table designer: index dan constraint

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Verdict**: Belum diverifikasi
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md)

## Ruang verifikasi

Verifikasi membuktikan perilaku implementasi terhadap seluruh acceptance criteria pada [test.md](test.md#acceptance-criteria). File ini tidak mengubah definisi AC dan tidak boleh diberi verdict lulus sebelum aplikasi, test, serta environment yang relevan benar benar dijalankan.

## Prasyarat eksekusi

| Kebutuhan | Cara memeriksa | Status awal |
|---|---|---|
| Implementasi | Build plan pada `index.md` selesai untuk slice yang diverifikasi. | Belum siap |
| Dependency | Semua relation `requires` pada `relation.md` sudah diterima. | Belum diperiksa |
| Root manifest | Tepat satu `package.json` ada di akar dan tidak ada manifest nested. | Belum diperiksa |
| Test plan | Test ID relevan pada `test.md` sudah diimplementasikan. | Belum siap |
| Environment | Service, database, browser, VM, certificate, atau akun yang dibutuhkan tersedia. | Belum diperiksa |

## Matriks verifikasi AC

| AC | Test atau proof ID | Metode | Bukti wajib | Result |
|---|---|---|---|---|
| [AC-1](test.md#ac-1) | `UT-0042-AC1`, `IT-0042-AC1`, `E2E-0042-AC1` | Unit, Integration, E2E | output command dan assertion | Belum dijalankan |
| [AC-2](test.md#ac-2) | `UT-0042-AC2`, `CT-0042-AC2`, `E2E-0042-AC2` | Unit, Contract, E2E | output command dan assertion | Belum dijalankan |
| [AC-3](test.md#ac-3) | `UT-0042-AC3`, `IT-0042-AC3`, `CT-0042-AC3`, `E2E-0042-AC3` | Unit, Integration, Contract, E2E | output command dan assertion | Belum dijalankan |
| [AC-4](test.md#ac-4) | `UT-0042-AC4`, `IT-0042-AC4`, `E2E-0042-AC4` | Unit, Integration, E2E | output command dan assertion | Belum dijalankan |
| [AC-5](test.md#ac-5) | `UT-0042-AC5`, `IT-0042-AC5`, `E2E-0042-AC5` | Unit, Integration, E2E | output command dan assertion | Belum dijalankan |
| [AC-6](test.md#ac-6) | `IT-0042-AC6`, `E2E-0042-AC6`, `SEC-0042-AC6` | Integration, E2E, Security | output command dan assertion; log tersanitasi tanpa secret | Belum dijalankan |
| [AC-7](test.md#ac-7) | `UT-0042-AC7`, `IT-0042-AC7`, `E2E-0042-AC7` | Unit, Integration, E2E | output command dan assertion | Belum dijalankan |
| [AC-8](test.md#ac-8) | `UT-0042-AC8`, `IT-0042-AC8`, `E2E-0042-AC8` | Unit, Integration, E2E | output command dan assertion | Belum dijalankan |

## Urutan verifikasi

1. Catat commit, versi Bun, sistem operasi, dan environment yang benar benar dipakai.
2. Dari akar repo, jalankan pemeriksaan satu manifest, lint, typecheck, serta command test yang tersedia pada `package.json` akar.
3. Jalankan seluruh test ID pada matriks sesuai jenisnya. Jangan mengganti integration atau operational proof dengan mock.
4. Kumpulkan manual, staged, environment, atau external proof yang ditetapkan. Jangan menandainya lulus bila dependency belum tersedia.
5. Simpan evidence yang tersanitasi, lalu isi result per AC dan verdict akhir.

## Pemeriksaan otomatis

| Area | Command source | Expected result |
|---|---|---|
| Unit | Script root yang didaftarkan pada satu `package.json` | Semua `UT-0042-*` lulus dan memiliki assertion yang menutup AC. |
| Integration | Script root yang didaftarkan pada satu `package.json` | Resource nyata disposable dipakai dan cleanup lulus. |
| Contract | Script root yang didaftarkan pada satu `package.json` | Semua `CT-0042-*` lulus dan memiliki assertion yang menutup AC. |
| E2E | Script root yang didaftarkan pada satu `package.json` | Semua `E2E-0042-*` lulus dan memiliki assertion yang menutup AC. |
| Security | Script root yang didaftarkan pada satu `package.json` | Semua `SEC-0042-*` lulus dan memiliki assertion yang menutup AC. |

## Pemeriksaan manual, staged, environment, atau external

Tidak ada manual atau external proof khusus yang diidentifikasi. Pemeriksaan reviewer tetap wajib untuk evidence otomatis.

## Catatan eksekusi

| Waktu | Commit | Environment | Hasil | Evidence |
|---|---|---|---|---|
| Belum dijalankan | Belum ada | Belum ada | Belum ada | Belum ada |

## Gap dan blocker

| AC | Gap | Dampak | Tindak lanjut |
|---|---|---|---|
| Belum dinilai | Verifikasi belum dijalankan karena implementasi belum tersedia. | Belum ada verdict acceptance. | Jalankan `/check verify` setelah build dan test relevan selesai. |

## Verdict akhir

Belum diverifikasi. Status ini hanya boleh berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau.
