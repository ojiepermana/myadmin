# Plan 0044. Manajemen view (CRUD GUI)

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
| Build plan          | 5 dari 5 langkah selesai                                                                                            |
| Acceptance criteria | 8 AC: 8 PASS, 0 PARTIAL, 0 BLOCKED                                                                                  |
| Verdict verifikasi  | Belum diverifikasi; verdict hanya boleh berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau. |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                                                                                                     | AC terkait             | Status  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------- |
| 1   | Implementasikan `ViewPort` di kedua provider (create, getDefinition sudah ada, replace dengan analisis strategi, drop) plus test integrasi.                         | AC-3                   | Selesai |
| 2   | Tambah operasi view ke kontrak (flag drop create, confirmName), regenerasi, contract test.                                                                          | AC-3, AC-4             | Selesai |
| 3   | Endpoint server dengan gerbang capability dan audit.                                                                                                                | AC-4, AC-5             | Selesai |
| 4   | UI: halaman editor view (nama, editor SELECT plus autocomplete, validasi, pratinjau DDL), aksi explorer, konfirmasi destructive dengan dampak, invalidasi metadata. | AC-1, AC-2, AC-6, AC-7 | Selesai |
| 5   | E2e dua engine.                                                                                                                                                     | AC-8                   | Selesai |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                                             | Test / proof ID                                                             | Status evidence |
| -------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------- |
| [AC-1](test.md#ac-1) | Aksi view di explorer: buka data, edit definisi, drop; folder Views punya create view                           | `E2E-0044-AC1`                                                              | Terbukti (PASS) |
| [AC-2](test.md#ac-2) | Halaman editor view: definisi SELECT di CodeMirror, validasi dry run, pratinjau DDL sebelum terapkan            | `UT-0044-AC2`, `IT-0044-AC2`, `CT-0044-AC2`, `E2E-0044-AC2`                 | Terbukti (PASS) |
| [AC-3](test.md#ac-3) | `POST /views`, `PUT /views/:ref` dengan strategi per engine, `DELETE /views/:ref` dengan confirmName            | `UT-0044-AC3`, `IT-0044-AC3`, `CT-0044-AC3`, `E2E-0044-AC3`, `SEC-0044-AC3` | Terbukti (PASS) |
| [AC-4](test.md#ac-4) | Fitur digerbangi `capabilities.viewEditor`; server menolak saat capability false meski UI dimanipulasi          | `UT-0044-AC4`, `IT-0044-AC4`, `CT-0044-AC4`, `E2E-0044-AC4`                 | Terbukti (PASS) |
| [AC-5](test.md#ac-5) | Audit `view.created`, `view.replaced`, `view.dropped` sebelum sukses; konfirmasi destructive dengan dampak      | `IT-0044-AC5`, `E2E-0044-AC5`, `SEC-0044-AC5`                               | Terbukti (PASS) |
| [AC-6](test.md#ac-6) | Definisi gagal tiba sebagai `DbError` berkategori dengan posisi, tampil di editor seperti error query           | `UT-0044-AC6`, `IT-0044-AC6`, `CT-0044-AC6`, `E2E-0044-AC6`                 | Terbukti (PASS) |
| [AC-7](test.md#ac-7) | Setelah operasi, cache metadata di-invalidate; tab data view yang berubah diberi tanda muat ulang               | `UT-0044-AC7`, `IT-0044-AC7`, `E2E-0044-AC7`                                | Terbukti (PASS) |
| [AC-8](test.md#ac-8) | E2e kedua engine: create view, buka data, ubah definisi (termasuk drop create PostgreSQL), drop; audit tercatat | `IT-0044-AC8`, `E2E-0044-AC8`, `SEC-0044-AC8`                               | Terbukti (PASS) |

## Follow-up

- [ ] Perbarui v1-feature-specification.md bagian 7.8: tambah FR view editor (keputusan sesi desain melampaui dokumen).
