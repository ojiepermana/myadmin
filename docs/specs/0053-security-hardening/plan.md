# Plan 0053. Hardening keamanan lintas fitur

**Date**: 2026-08-30
**Spec status**: mengikuti [index.md](index.md)
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Aturan dokumen

- Dokumen planning ini disusulkan setelah spec berjalan. Isinya diturunkan dari `index.md`, `test.md`, `verify.md`, dan `docs/specs/ac-evidence-matrix.md`; file ini bukan sumber kebenaran baru.
- Status pada tabel di bawah adalah snapshot per 2026-08-30. Bila build plan, acceptance criteria, atau evidence berubah, perbarui tabel ini bersama file sumbernya.
- Status implementasi tidak boleh dinaikkan tanpa evidence pada `verify.md` atau matrix acceptance.

## Ringkasan progres

| Dimensi             | Nilai                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| Status spec         | In Progress                                                                                                   |
| Build plan          | 7 dari 7 langkah selesai                                                                                      |
| Acceptance criteria | 8 AC: 5 PASS, 3 PARTIAL, 0 BLOCKED                                                                            |
| Verdict verifikasi  | Belum diverifikasi; verdict hanya berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau. |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                                                        | AC terkait | Status  |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ---------- | ------- |
| 1   | Standar redaction dan daftar saluran keluar; sweep kode agar tiap saluran memanggil redaction; test suntik per saluran | AC-1       | Selesai |
| 2   | Pemindai secret untuk fixture dan source test di CI                                                                    | AC-2       | Selesai |
| 3   | Header keamanan di server plus test header                                                                             | AC-3       | Selesai |
| 4   | Konsolidasi rate limiter ke satu modul dengan nilai terdokumentasi, terpasang di empat titik, plus test                | AC-4       | Selesai |
| 5   | Generator matriks otorisasi dari kontrak dan e2e tiga aktor                                                            | AC-5       | Selesai |
| 6   | Test at rest byte scan dan test kelengkapan audit destructive                                                          | AC-6, AC-7 | Selesai |
| 7   | Rakit `security.yml` sebagai gerbang                                                                                   | AC-8       | Selesai |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                                  | Test / proof ID                                              | Status evidence    |
| -------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------ |
| [AC-1](test.md#ac-1) | Semua saluran keluar melewati modul redaction; test suntik secret memastikan tidak lolos             | `UT-0053-AC1`, `IT-0053-AC1`, `E2E-0053-AC1`, `SEC-0053-AC1` | Sebagian (PARTIAL) |
| [AC-2](test.md#ac-2) | Fixture dan test bebas credential nyata; pemindai pola secret menggagalkan CI saat pelanggaran       | `SEC-0053-AC2`, `SMOKE-0053-AC2`                             | Terbukti (PASS)    |
| [AC-3](test.md#ac-3) | Header keamanan HTTP (CSP, nosniff, Referrer-Policy, X-Frame-Options, Cache-Control) dibuktikan test | `IT-0053-AC3`, `E2E-0053-AC3`, `SEC-0053-AC3`                | Terbukti (PASS)    |
| [AC-4](test.md#ac-4) | Rate limiting satu modul terpasang pada setup, login, test connection, upload; 429 bekerja           | `UT-0053-AC4`, `IT-0053-AC4`, `SEC-0053-AC4`                 | Terbukti (PASS)    |
| [AC-5](test.md#ac-5) | Matriks e2e otorisasi tiga aktor digenerate dari kontrak; kelengkapan dipaksa                        | `CT-0053-AC5`, `E2E-0053-AC5`, `SEC-0053-AC5`                | Terbukti (PASS)    |
| [AC-6](test.md#ac-6) | Enkripsi at rest: pindai byte file SQLite untuk penanda secret setelah data lengkap dibuat           | `IT-0053-AC6`, `SEC-0053-AC6`                                | Terbukti (PASS)    |
| [AC-7](test.md#ac-7) | Audit destructive lengkap terhadap daftar operasi destructive seluruh spec                           | `IT-0053-AC7`, `E2E-0053-AC7`, `SEC-0053-AC7`                | Sebagian (PARTIAL) |
| [AC-8](test.md#ac-8) | Workflow CI `security.yml` menjalankan seluruh suite keamanan sebagai gerbang wajib rilis            | `IT-0053-AC8`, `SMOKE-0053-AC8`, `MANUAL-0053-AC8`           | Sebagian (PARTIAL) |

## Follow-up

- [ ] Tidak ada.
