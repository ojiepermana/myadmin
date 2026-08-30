# Plan 0042. Table designer: index dan constraint

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
| Build plan          | 4 dari 4 langkah selesai                                                                                            |
| Acceptance criteria | 8 AC: 8 PASS, 0 PARTIAL, 0 BLOCKED                                                                                  |
| Verdict verifikasi  | Belum diverifikasi; verdict hanya boleh berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau. |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                                                                                  | AC terkait             | Status  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- | ------- |
| 1   | Perluas `TableChangeSet` di kontrak dan kompilator kedua provider (index, PK, FK, unique, check; drop plus add untuk ubah) dengan test snapshot. | AC-2, AC-3, AC-4, AC-5 | Selesai |
| 2   | UI tab Index dan Constraint (daftar, editor FK dengan pencari target, composite dengan pengurutan, check ekspresi).                              | AC-1, AC-3, AC-5       | Selesai |
| 3   | Konfirmasi destructive dan peringatan dampak PK/FK, audit, invalidasi plus refresh rowIdentity.                                                  | AC-6, AC-7             | Selesai |
| 4   | E2e dua engine (fixture PostgreSQL dan MySQL disposable telah dijalankan).                                                                       | AC-8                   | Selesai |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                                                | Test / proof ID                                             | Status evidence |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | --------------- |
| [AC-1](test.md#ac-1) | Tab Index dan Constraint memuat keadaan kini dari describeTable (index, PK, FK, unique, check)                     | `UT-0042-AC1`, `IT-0042-AC1`, `E2E-0042-AC1`                | Terbukti (PASS) |
| [AC-2](test.md#ac-2) | Change set diperluas: addIndex, dropIndex, addConstraint, dropConstraint; ubah = drop plus add jujur               | `UT-0042-AC2`, `CT-0042-AC2`, `E2E-0042-AC2`                | Terbukti (PASS) |
| [AC-3](test.md#ac-3) | Editor FK: kolom lokal, target, aturan ON; validasi tipe dan index pendukung MySQL                                 | `UT-0042-AC3`, `IT-0042-AC3`, `CT-0042-AC3`, `E2E-0042-AC3` | Terbukti (PASS) |
| [AC-4](test.md#ac-4) | Editor check divalidasi provider saat preview; MySQL tanpa penegakan dinonaktifkan dengan alasan capability        | `UT-0042-AC4`, `IT-0042-AC4`, `E2E-0042-AC4`                | Terbukti (PASS) |
| [AC-5](test.md#ac-5) | Composite index dan composite PK/unique dengan pengurutan kolom drag; batas kolom mengikuti engine                 | `UT-0042-AC5`, `IT-0042-AC5`, `E2E-0042-AC5`                | Terbukti (PASS) |
| [AC-6](test.md#ac-6) | Drop index/constraint pakai konfirmasi destructive; peringatan dampak PK/FK; audit `table.altered` sebelum sukses  | `IT-0042-AC6`, `E2E-0042-AC6`, `SEC-0042-AC6`               | Terbukti (PASS) |
| [AC-7](test.md#ac-7) | Setelah terapkan, invalidasi metadata; data browser menyegarkan rowIdentity bila PK berubah                        | `UT-0042-AC7`, `IT-0042-AC7`, `E2E-0042-AC7`                | Terbukti (PASS) |
| [AC-8](test.md#ac-8) | Snapshot kompilasi semua jenis index/constraint kedua engine; e2e FK, composite unique, drop index lewat pratinjau | `UT-0042-AC8`, `IT-0042-AC8`, `E2E-0042-AC8`                | Terbukti (PASS) |

## Follow-up

- [ ] Tidak ada.
