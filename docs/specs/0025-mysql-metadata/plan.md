# Plan 0025. Provider MySQL: metadata dan introspeksi

**Date**: 2026-08-30
**Spec status**: mengikuti [index.md](index.md)
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Aturan dokumen

- Dokumen planning ini disusulkan setelah spec berjalan. Isinya diturunkan dari `index.md`, `test.md`, `verify.md`, dan `docs/specs/ac-evidence-matrix.md`; file ini bukan sumber kebenaran baru.
- Status pada tabel di bawah adalah snapshot per 2026-08-30. Bila build plan, acceptance criteria, atau evidence berubah, perbarui tabel ini bersama file sumbernya.
- Status implementasi tidak boleh dinaikkan tanpa evidence pada `verify.md` atau matrix acceptance.

## Ringkasan progres

| Dimensi             | Nilai                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Status spec         | In Progress                                                                                                         |
| Build plan          | 5 dari 6 langkah selesai (langkah 6 tanpa checkbox pada index.md)                                                   |
| Acceptance criteria | 8 AC: 8 PASS, 0 PARTIAL, 0 BLOCKED                                                                                  |
| Verdict verifikasi  | Belum diverifikasi; verdict hanya boleh berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau. |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                                         | AC terkait | Status           |
| --- | ------------------------------------------------------------------------------------------------------- | ---------- | ---------------- |
| 1   | Fungsi quoting backtick plus test                                                                       | AC-6       | Selesai          |
| 2   | listDatabases (saring sistem, charset, collation, ukuran malas), listObjects paginated termasuk trigger | AC-1, AC-2 | Selesai          |
| 3   | describeTable lengkap plus properti engine dan collation                                                | AC-3       | Selesai          |
| 4   | getViewDefinition, listRoutines, daftar trigger                                                         | AC-4       | Selesai          |
| 5   | searchObjects paginated                                                                                 | AC-5       | Selesai          |
| 6   | Test integrasi dua versi, test bentuk lintas provider, test performa                                    | AC-7, AC-8 | Tidak dinyatakan |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                                 | Test / proof ID           | Status evidence |
| -------------------- | --------------------------------------------------------------------------------------------------- | ------------------------- | --------------- |
| [AC-1](test.md#ac-1) | listDatabases menyaring database sistem dengan charset, collation, ukuran malas; listSchemas kosong | IT-0025-AC1               | Terbukti (PASS) |
| [AC-2](test.md#ac-2) | listObjects paginated untuk table, view, routine, trigger dengan schema bernilai null               | IT-0025-AC2               | Terbukti (PASS) |
| [AC-3](test.md#ac-3) | describeTable selengkap versi PostgreSQL termasuk engine dan collation table                        | IT-0025-AC3, CT-0025-AC3  | Terbukti (PASS) |
| [AC-4](test.md#ac-4) | getViewDefinition, listRoutines, dan daftar trigger untuk tampilan explorer                         | IT-0025-AC4               | Terbukti (PASS) |
| [AC-5](test.md#ac-5) | searchObjects server side paginated tanpa unduhan katalog penuh                                     | IT-0025-AC5               | Terbukti (PASS) |
| [AC-6](test.md#ac-6) | quoting backtick lewat satu fungsi teruji; nilai pencarian sebagai parameter                        | UT-0025-AC6, SEC-0025-AC6 | Terbukti (PASS) |
| [AC-7](test.md#ac-7) | test kontrak metadata generik lulus pada MySQL nyata; bentuk identik lintas provider                | IT-0025-AC7, CT-0025-AC7  | Terbukti (PASS) |
| [AC-8](test.md#ac-8) | performa database sintetis 2000 table tetap responsif; ekspansi hanya query node itu                | PERF-0025-AC8             | Terbukti (PASS) |

## Follow-up

- [ ] Tidak ada.
