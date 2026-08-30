# Plan 0037. Data browser: jalur baca

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

| #   | Langkah rencana                                                                                                                                                                 | AC terkait       | Status  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------- |
| 1   | Definisikan bentuk read (filter, sort, page, total berlabel) di kontrak, regenerasi, contract test                                                                              | AC-1, AC-2       | Selesai |
| 2   | Implementasikan penerjemah filter/sort/pagination di provider `data/` kedua engine (berparameter, quoting terpusat, tie breaker, strategi total) dengan test unit dan integrasi | AC-2 sampai AC-5 | Selesai |
| 3   | Endpoint server plus validasi                                                                                                                                                   | AC-1             | Selesai |
| 4   | UI tab data: ResultGrid mode browser, filter per kolom, chip filter, pemilih kolom, pagination, konteks tab serializable                                                        | AC-6, AC-7       | Selesai |
| 5   | Test NFR-01, injeksi, dan e2e dua engine                                                                                                                                        | AC-8, AC-9       | Selesai |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                                                     | Test / proof ID                        | Status evidence |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | --------------- |
| [AC-1](test.md#ac-1) | `POST /data/read` dengan page, sort, filter, search, columns; total berlabel; limit maksimum 500                        | IT-0037-AC1, CT-0037-AC1               | Terbukti (PASS) |
| [AC-2](test.md#ac-2) | Filter terstruktur dari daftar operator tertutup, diterjemahkan provider ke SQL berparameter; operator liar ditolak 422 | UT-0037-AC2, IT-0037-AC2, SEC-0037-AC2 | Terbukti (PASS) |
| [AC-3](test.md#ac-3) | Pencarian teks bebas sebagai OR contains atas kolom teks, tetap berparameter                                            | UT-0037-AC3, SEC-0037-AC3              | Terbukti (PASS) |
| [AC-4](test.md#ac-4) | Sort multi kolom stabil dengan tie breaker primary key untuk pagination konsisten                                       | UT-0037-AC4, IT-0037-AC4               | Terbukti (PASS) |
| [AC-5](test.md#ac-5) | COUNT tepat hanya bila murah atau diminta; selain itu estimate berlabel jujur di UI                                     | IT-0037-AC5, E2E-0037-AC5              | Terbukti (PASS) |
| [AC-6](test.md#ac-6) | Tab data memakai ResultGrid mode browser: filter per kolom, chip, pemilih kolom, pagination, konteks eksplisit          | E2E-0037-AC6, VIS-0037-AC6             | Terbukti (PASS) |
| [AC-7](test.md#ac-7) | View dibuka jalur yang sama secara read only di V1                                                                      | E2E-0037-AC7                           | Terbukti (PASS) |
| [AC-8](test.md#ac-8) | NFR-01: tabel 1 juta baris hanya query berhalaman; nilai filter berbahaya tidak mengubah query                          | PERF-0037-AC8, SEC-0037-AC8            | Terbukti (PASS) |
| [AC-9](test.md#ac-9) | E2e kedua engine: buka dari explorer, filter, sort, pilih kolom, pindah halaman                                         | E2E-0037-AC9                           | Terbukti (PASS) |

## Follow-up

- [x] Spec 0038 menumpangkan penyuntingan pada tab data ini.
