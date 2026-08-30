# Plan 0047. Export

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
| Build plan          | 6 dari 6 langkah selesai                                                                                            |
| Acceptance criteria | 8 AC: 8 PASS, 0 PARTIAL, 0 BLOCKED                                                                                  |
| Verdict verifikasi  | Belum diverifikasi; verdict hanya boleh berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau. |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                                                                                       | AC terkait             | Status  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------- |
| 1   | Bangun penulis format csv/json/sql (streaming, opsi) sebagai modul server plus unit test.                                                             | AC-1, AC-2             | Selesai |
| 2   | Implementasikan pembaca cursor dan quoting nilai di provider `import-export/` kedua engine plus test.                                                 | AC-2, AC-3             | Selesai |
| 3   | Executor job export (baca → tulis → progress → cancel → pembersihan), endpoint export dan download, kebijakan kadaluarsa plus pembersih temp berkala. | AC-1, AC-3, AC-4, AC-5 | Selesai |
| 4   | Kontrak, regenerasi, contract test; audit selesai.                                                                                                    | AC-7                   | Selesai |
| 5   | UI: dialog export, integrasi tombol data browser dan result grid, panel jobs generik di halaman import-export.                                        | AC-6                   | Selesai |
| 6   | E2e dan test skala.                                                                                                                                   | AC-8                   | Selesai |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                                       | Test / proof ID                                             | Status evidence |
| -------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------- |
| [AC-1](test.md#ac-1) | `POST /export` membuat job dari sumber table, query, selection, atau database dengan format sql/csv/json  | `UT-0047-AC1`, `IT-0047-AC1`, `CT-0047-AC1`                 | Terbukti (PASS) |
| [AC-2](test.md#ac-2) | Opsi SQL export: structure only, data only, keduanya; struktur dari DDL provider, INSERT batch            | `UT-0047-AC2`, `IT-0047-AC2`, `SEC-0047-AC2`                | Terbukti (PASS) |
| [AC-3](test.md#ac-3) | Eksekusi streaming lewat cursor; penulis format menulis bertahap ke file temp; memori tetap datar         | `IT-0047-AC3`, `PERF-0047-AC3`                              | Terbukti (PASS) |
| [AC-4](test.md#ac-4) | Progress lewat job events; cancel menghormati AbortSignal dan menghapus file parsial                      | `UT-0047-AC4`, `IT-0047-AC4`, `CT-0047-AC4`, `E2E-0047-AC4` | Terbukti (PASS) |
| [AC-5](test.md#ac-5) | `GET /export/:jobId/download` (pemilik saja), nama file bermakna, kebijakan kadaluarsa dan pembersih temp | `UT-0047-AC5`, `IT-0047-AC5`, `CT-0047-AC5`, `SEC-0047-AC5` | Terbukti (PASS) |
| [AC-6](test.md#ac-6) | UI: dialog export dari context menu, tombol data browser dan result grid, panel jobs generik              | `E2E-0047-AC6`                                              | Terbukti (PASS) |
| [AC-7](test.md#ac-7) | Audit `export.completed` tanpa isi data; export tidak memuat credential bentuk apa pun                    | `IT-0047-AC7`, `SEC-0047-AC7`                               | Terbukti (PASS) |
| [AC-8](test.md#ac-8) | E2e kedua engine: CSV 100 ribu baris dengan progress, cancel menghapus file parsial, roundtrip SQL        | `IT-0047-AC8`, `E2E-0047-AC8`, `PERF-0047-AC8`              | Terbukti (PASS) |

## Follow-up

- [x] Spec 0048 memakai roundtrip export SQL sebagai fixture import.
