# Plan 0023. Provider PostgreSQL: metadata dan introspeksi

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

| #   | Langkah rencana                                                                         | AC terkait | Status  |
| --- | --------------------------------------------------------------------------------------- | ---------- | ------- |
| 1   | Bangun fungsi quoting identifier tunggal plus test                                      | AC-6       | Selesai |
| 2   | Implementasikan listDatabases, listSchemas, listObjects paginated                       | AC-1, AC-2 | Selesai |
| 3   | Implementasikan describeTable lengkap dan getViewDefinition, listRoutines               | AC-3, AC-4 | Selesai |
| 4   | Implementasikan searchObjects paginated                                                 | AC-5       | Selesai |
| 5   | Tambah panggilan ukuran malas dan cache TTL pendek                                      | AC-1       | Selesai |
| 6   | Test integrasi dua versi PostgreSQL, test kontrak generik, dan test performa 2000 table | AC-7, AC-8 | Selesai |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                                 | Test / proof ID           | Status evidence |
| -------------------- | --------------------------------------------------------------------------------------------------- | ------------------------- | --------------- |
| [AC-1](test.md#ac-1) | `listDatabases` mengembalikan nama, owner, encoding, collation, ukuran malas; tanpa memuat object   | IT-0023-AC1               | Terbukti (PASS) |
| [AC-2](test.md#ac-2) | `listSchemas` non sistem plus flag sistem; `listObjects` paginated (pageSize maksimum 500)          | IT-0023-AC2               | Terbukti (PASS) |
| [AC-3](test.md#ac-3) | `describeTable` lengkap: kolom, PK, FK, unique, check, index, perkiraan baris untuk table designer  | IT-0023-AC3, CT-0023-AC3  | Terbukti (PASS) |
| [AC-4](test.md#ac-4) | `getViewDefinition` mengembalikan definisi view; `listRoutines` mengembalikan nama dan signature    | IT-0023-AC4               | Terbukti (PASS) |
| [AC-5](test.md#ac-5) | `searchObjects` mencari nama object di sisi server dengan pagination; tanpa unduh katalog penuh     | IT-0023-AC5               | Terbukti (PASS) |
| [AC-6](test.md#ac-6) | Identifier di quote lewat fungsi tunggal teruji; input pencarian sebagai parameter                  | UT-0023-AC6, SEC-0023-AC6 | Terbukti (PASS) |
| [AC-7](test.md#ac-7) | Hasil sesuai model umum spec 0021; test kontrak metadata generik pada server nyata                  | IT-0023-AC7, CT-0023-AC7  | Terbukti (PASS) |
| [AC-8](test.md#ac-8) | Performa: 2000 table sintetis, `listObjects` per halaman di bawah ambang; satu halaman per ekspansi | PERF-0023-AC8             | Terbukti (PASS) |

## Follow-up

- [ ] Spec 0031 dan 0033 memakai cache metadata ini; jangan membangun cache kedua di UI.
