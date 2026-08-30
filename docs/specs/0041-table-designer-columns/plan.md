# Plan 0041. Table designer: kolom dan properti

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

| #   | Langkah rencana                                                                                                                              | AC terkait             | Status  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------- |
| 1   | Definisikan `TableChangeSet` dan operasi preview/apply di kontrak, regenerasi, contract test.                                                | -                      | Selesai |
| 2   | Bangun modul tipe engine dan kompilator change set → DDL di provider `table/` kedua engine, dengan test snapshot SQL menyeluruh.             | AC-1, AC-2, AC-3, AC-5 | Selesai |
| 3   | Endpoint server (preview, apply dengan semantik transaksi per engine, konfirmasi destructive, audit).                                        | AC-4, AC-6             | Selesai |
| 4   | UI feature table-designer: editor kolom (create dan alter), panel pratinjau SQL plus peringatan, konfirmasi drop kolom, invalidasi metadata. | AC-1, AC-2, AC-3, AC-7 | Selesai |
| 5   | E2e dua engine (fixture PostgreSQL dan MySQL disposable telah dijalankan).                                                                   | AC-8                   | Selesai |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                                                   | Test / proof ID                                              | Status evidence |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------- |
| [AC-1](test.md#ac-1) | Create table: editor kolom multi baris dengan tipe, nullability, default, identity, generated, komentar, PK sederhana | `UT-0041-AC1`, `IT-0041-AC1`, `E2E-0041-AC1`                 | Terbukti (PASS) |
| [AC-2](test.md#ac-2) | Alter table: change set dari describeTable; aspek yang tidak didukung engine dinonaktifkan dengan alasan              | `UT-0041-AC2`, `IT-0041-AC2`, `E2E-0041-AC2`                 | Terbukti (PASS) |
| [AC-3](test.md#ac-3) | `POST /tables/ddl/preview` mengkompilasi change set jadi statement plus peringatan; UI tampilkan sebelum terapkan     | `UT-0041-AC3`, `IT-0041-AC3`, `CT-0041-AC3`, `E2E-0041-AC3`  | Terbukti (PASS) |
| [AC-4](test.md#ac-4) | `POST /tables/ddl/apply` transaksional per engine, hasil per statement, konfirmasi destructive untuk drop kolom       | `IT-0041-AC4`, `CT-0041-AC4`, `E2E-0041-AC4`, `SEC-0041-AC4` | Terbukti (PASS) |
| [AC-5](test.md#ac-5) | Validasi provider: nama, tipe, parameter, default, generated/identity sesuai capability; 422 per field                | `UT-0041-AC5`, `IT-0041-AC5`, `CT-0041-AC5`                  | Terbukti (PASS) |
| [AC-6](test.md#ac-6) | Audit `table.created`, `table.altered`, `table.column_dropped` sebelum response sukses; drop kolom destructive        | `IT-0041-AC6`, `SEC-0041-AC6`                                | Terbukti (PASS) |
| [AC-7](test.md#ac-7) | Setelah terapkan, cache metadata di-invalidate dan explorer serta tab data menyegarkan struktur                       | `UT-0041-AC7`, `IT-0041-AC7`, `E2E-0041-AC7`                 | Terbukti (PASS) |
| [AC-8](test.md#ac-8) | E2e kedua engine: create, alter, pratinjau selalu tampil, audit tercatat; snapshot SQL per engine                     | `UT-0041-AC8`, `IT-0041-AC8`, `E2E-0041-AC8`, `SEC-0041-AC8` | Terbukti (PASS) |

## Follow-up

- [x] Spec 0042 memperluas change set dengan index dan constraint.
