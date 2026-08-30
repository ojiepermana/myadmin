# Plan 0035. Query cancel dan EXPLAIN

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
| Acceptance criteria | 8 AC: 8 PASS, 0 PARTIAL, 0 BLOCKED                                                                            |
| Verdict verifikasi  | Belum diverifikasi; verdict hanya berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau. |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                                                         | AC terkait       | Status  |
| --- | ----------------------------------------------------------------------------------------------------------------------- | ---------------- | ------- |
| 1   | Tambah operasi cancel dan explain ke kontrak, regenerasi, contract test                                                 | -                | Selesai |
| 2   | Implementasi cancel di use case query (state cancelling, konfirmasi provider, idempotensi) plus event WS state          | AC-1, AC-2, AC-4 | Selesai |
| 3   | Implementasi explain di provider `query/` masing masing engine plus endpoint                                            | AC-5, AC-6, AC-7 | Selesai |
| 4   | UI: tombol cancel bergerbang capability dengan state jelas, aksi darurat putuskan sesi (konfirmasi), panel explain teks | AC-3, AC-5       | Selesai |
| 5   | Integration dan e2e dua engine                                                                                          | AC-8             | Selesai |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                                        | Test / proof ID           | Status evidence |
| -------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------- | --------------- |
| [AC-1](test.md#ac-1) | Endpoint cancel memicu cancel provider; state cancelling lalu cancelled dengan konfirmasi jujur            | IT-0035-AC1               | Terbukti (PASS) |
| [AC-2](test.md#ac-2) | Cancel menarget tepat statement aktif; eksekusi dan tab lain tidak terpengaruh                             | IT-0035-AC2               | Terbukti (PASS) |
| [AC-3](test.md#ac-3) | Tombol cancel bergerbang capability; state akhir eksplisit di UI                                           | E2E-0035-AC3              | Terbukti (PASS) |
| [AC-4](test.md#ac-4) | Race tertangani: cancel pada eksekusi selesai menjawab state final; idempotent                             | UT-0035-AC4, IT-0035-AC4  | Terbukti (PASS) |
| [AC-5](test.md#ac-5) | EXPLAIN teks per engine lewat `POST /query/explain`, tampil sebagai panel monospace                        | IT-0035-AC5, E2E-0035-AC5 | Terbukti (PASS) |
| [AC-6](test.md#ac-6) | EXPLAIN bergerbang capability; statement non EXPLAINable mengembalikan error ternormalisasi; tanpa ANALYZE | IT-0035-AC6, E2E-0035-AC6 | Terbukti (PASS) |
| [AC-7](test.md#ac-7) | Cancel dan explain lewat sesi tab yang sama; explain tidak merusak transaksi aktif                         | IT-0035-AC7               | Terbukti (PASS) |
| [AC-8](test.md#ac-8) | Integration kedua engine: query panjang dibatalkan cepat; explain menghasilkan plan; e2e tombol            | IT-0035-AC8, E2E-0035-AC8 | Terbukti (PASS) |

## Follow-up

Tidak ada follow-up terbuka pada index.md.
