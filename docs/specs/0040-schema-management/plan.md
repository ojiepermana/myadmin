# Plan 0040. Manajemen schema

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
| Acceptance criteria | 6 AC: 6 PASS, 0 PARTIAL, 0 BLOCKED                                                                            |
| Verdict verifikasi  | Belum diverifikasi; verdict hanya berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau. |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                                                     | AC terkait | Status  |
| --- | ------------------------------------------------------------------------------------------------------------------- | ---------- | ------- |
| 1   | Implementasikan `SchemaPort` PostgreSQL (create, rename, drop restrict, properties) plus test integrasi             | AC-1       | Selesai |
| 2   | Tambah operasi ke kontrak dengan confirmName, regenerasi, contract test                                             | AC-2       | Selesai |
| 3   | Endpoint server dengan gerbang capability tegas                                                                     | AC-3       | Selesai |
| 4   | UI: menu dan form schema (create dengan owner, rename dengan peringatan, drop konfirmasi), registrasi menu explorer | AC-4       | Selesai |
| 5   | Audit dan e2e dua arah                                                                                              | AC-5, AC-6 | Selesai |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                                | Test / proof ID                                     | Status evidence |
| -------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------- | --------------- |
| [AC-1](test.md#ac-1) | `SchemaPort` PostgreSQL: list, properties, create, rename, drop restrict tanpa cascade di V1       | UT-0040-AC1, IT-0040-AC1                            | Terbukti (PASS) |
| [AC-2](test.md#ac-2) | Endpoint sesuai kontrak: POST, PATCH rename, DELETE dengan confirmName wajib dan konteks eksplisit | IT-0040-AC2, CT-0040-AC2                            | Terbukti (PASS) |
| [AC-3](test.md#ac-3) | Seluruh fitur bergerbang `capabilities.schemas`; server menjawab unsupported meski request dipaksa | UT-0040-AC3, IT-0040-AC3, CT-0040-AC3, E2E-0040-AC3 | Terbukti (PASS) |
| [AC-4](test.md#ac-4) | Rename memperingatkan dampak sebelum konfirmasi; drop memakai komponen konfirmasi ketik nama       | E2E-0040-AC4, SEC-0040-AC4                          | Terbukti (PASS) |
| [AC-5](test.md#ac-5) | Create, rename, drop diaudit sebelum response sukses                                               | IT-0040-AC5, SEC-0040-AC5                           | Terbukti (PASS) |
| [AC-6](test.md#ac-6) | E2e PostgreSQL create/rename/drop; drop berisi ditolak; MySQL tanpa menu dan endpoint unsupported  | IT-0040-AC6, E2E-0040-AC6                           | Terbukti (PASS) |

## Follow-up

Tidak ada follow-up terbuka pada index.md.
