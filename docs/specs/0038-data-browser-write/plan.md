# Plan 0038. Data browser: jalur tulis

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
| Build plan          | 5 dari 5 langkah selesai                                                                                      |
| Acceptance criteria | 9 AC: 9 PASS, 0 PARTIAL, 0 BLOCKED                                                                            |
| Verdict verifikasi  | Belum diverifikasi; verdict hanya berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau. |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                                                                          | AC terkait                   | Status  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------- |
| 1   | Tambahkan penentuan rowIdentity ke response read dan kontrak                                                                             | AC-1                         | Selesai |
| 2   | Implementasikan insert/update/delete berparameter di provider `data/` kedua engine plus affected semantics dan transaksi, test integrasi | AC-2, AC-3, AC-4, AC-6, AC-8 | Selesai |
| 3   | Endpoint server plus audit delete lewat `withAudit`                                                                                      | AC-4, AC-7                   | Selesai |
| 4   | UI: mode edit grid (editor sel bertipe, baris baru, seleksi dan hapus dengan konfirmasi berjumlah, banner read only dengan alasan)       | AC-1, AC-2, AC-4, AC-5       | Selesai |
| 5   | E2e dua engine plus test konflik (belum tersedia untuk seluruh jalur UI)                                                                 | AC-9                         | Selesai |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                                                 | Test / proof ID                                      | Status evidence |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | --------------- |
| [AC-1](test.md#ac-1) | Kelayakan edit ditentukan server lewat rowIdentity; tanpa identitas aman, table read only dengan penjelasan         | UT-0038-AC1, IT-0038-AC1, CT-0038-AC1, E2E-0038-AC1  | Terbukti (PASS) |
| [AC-2](test.md#ac-2) | Insert satu baris bertipe; kolom default/identity bisa dibiarkan; baris hasil dikembalikan                          | UT-0038-AC2, IT-0038-AC2, CT-0038-AC2, E2E-0038-AC2  | Terbukti (PASS) |
| [AC-3](test.md#ac-3) | Update berparameter dengan WHERE identitas penuh; affected wajib tepat 1 atau dibatalkan (409 konflik)              | UT-0038-AC3, IT-0038-AC3, CT-0038-AC3                | Terbukti (PASS) |
| [AC-4](test.md#ac-4) | Delete dan bulk delete lewat identitas baris dengan konfirmasi berjumlah dan affected rows                          | IT-0038-AC4, CT-0038-AC4, E2E-0038-AC4, SEC-0038-AC4 | Terbukti (PASS) |
| [AC-5](test.md#ac-5) | Editor sel bertipe: multiline, angka, boolean, tanggal, enum, JSON tervalidasi, set NULL eksplisit; biner read only | UT-0038-AC5, E2E-0038-AC5                            | Terbukti (PASS) |
| [AC-6](test.md#ac-6) | Konversi tipe dan binary safety milik provider; kegagalan konversi 422 dengan pesan kolom spesifik                  | UT-0038-AC6, IT-0038-AC6, CT-0038-AC6, SEC-0038-AC6  | Terbukti (PASS) |
| [AC-7](test.md#ac-7) | Delete diaudit tanpa isi baris; insert dan update tidak diaudit di V1                                               | IT-0038-AC7, SEC-0038-AC7                            | Terbukti (PASS) |
| [AC-8](test.md#ac-8) | Mutasi pada sesi khusus singkat dalam transaksi per operasi; bulk delete atomik                                     | IT-0038-AC8                                          | Terbukti (PASS) |
| [AC-9](test.md#ac-9) | E2e kedua engine: insert, edit sel, delete, bulk delete; table tanpa PK read only; test konflik                     | IT-0038-AC9, E2E-0038-AC9                            | Terbukti (PASS) |

## Follow-up

Tidak ada follow-up terbuka pada index.md.
