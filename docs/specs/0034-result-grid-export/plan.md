# Plan 0034. Result grid dan export result

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

| #   | Langkah rencana                                                                                                       | AC terkait       | Status  |
| --- | --------------------------------------------------------------------------------------------------------------------- | ---------------- | ------- |
| 1   | Bangun ResultGrid (virtual scroll, kolom, render sel bertipe, dialog nilai penuh, JSON viewer) di database-components | AC-1, AC-3, AC-7 | Selesai |
| 2   | Integrasikan ke query editor: sub tab per statement, panel error, ringkasan durasi                                    | AC-2, AC-6       | Selesai |
| 3   | Bangun pemilihan dan salin (TSV/CSV)                                                                                  | AC-4             | Selesai |
| 4   | Bangun export klien plus tombol dua jalur dengan gerbang fitur export penuh                                           | AC-5             | Selesai |
| 5   | Unit test render, e2e alur hasil, test kinerja ringan                                                                 | AC-8             | Selesai |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                            | Test / proof ID                           | Status evidence |
| -------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------- | --------------- |
| [AC-1](test.md#ac-1) | ResultGrid dengan virtual scrolling, header bertipe, lebar kolom, dan sort sisi klien berlabel | E2E-0034-AC1, PERF-0034-AC1, VIS-0034-AC1 | Terbukti (PASS) |
| [AC-2](test.md#ac-2) | Multiple result set sebagai sub tab per statement dengan ringkasan dan panel error             | E2E-0034-AC2                              | Terbukti (PASS) |
| [AC-3](test.md#ac-3) | Render sel bertipe: NULL badge, JSON viewer, nilai panjang dipotong, semua sebagai teks aman   | UT-0034-AC3, E2E-0034-AC3, SEC-0034-AC3   | Terbukti (PASS) |
| [AC-4](test.md#ac-4) | Salin sel, baris terpilih, atau semua baris termuat sebagai TSV atau CSV                       | UT-0034-AC4, E2E-0034-AC4                 | Terbukti (PASS) |
| [AC-5](test.md#ac-5) | Export baris termuat ke CSV/JSON; satu tombol dua jalur dengan gerbang spec 0047               | UT-0034-AC5, E2E-0034-AC5                 | Terbukti (PASS) |
| [AC-6](test.md#ac-6) | Durasi per statement dan total tampil; indikator hasil terpotong jujur                         | E2E-0034-AC6                              | Terbukti (PASS) |
| [AC-7](test.md#ac-7) | Grid dapat diakses: navigasi keyboard, header screen reader, kontras badge NULL                | E2E-0034-AC7, VIS-0034-AC7                | Terbukti (PASS) |
| [AC-8](test.md#ac-8) | Unit dan e2e: render tipe tepat, salin benar, multiple result set, 5000 baris mulus            | UT-0034-AC8, E2E-0034-AC8, PERF-0034-AC8  | Terbukti (PASS) |

## Follow-up

- [x] Spec 0047 mengaktifkan jalur "export semua baris" pada tombol yang sudah ada.
