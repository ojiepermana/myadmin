# Plan 0050. Restore

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
| Acceptance criteria | 7 AC: 5 PASS, 2 PARTIAL, 0 BLOCKED                                                                            |
| Verdict verifikasi  | Belum diverifikasi; verdict hanya berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau. |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                                                                   | AC terkait | Status  |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------- |
| 1   | Modul validasi artefak (sniff format, engine, gzip) plus endpoint validate                                                        | AC-1       | Selesai |
| 2   | Executor job restore (opsional create database dulu, subprocess streaming, progress, cancel dengan pernyataan parsial, ringkasan) | AC-2, AC-4 | Selesai |
| 3   | Kontrak (confirmName wajib), endpoint restore, audit started/completed, regenerasi, contract test                                 | AC-3, AC-5 | Selesai |
| 4   | UI alur restore lengkap dengan gerbang capability                                                                                 | AC-6       | Selesai |
| 5   | E2e roundtrip dan skenario gagal dua engine                                                                                       | AC-7       | Selesai |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                                         | Test / proof ID                                                 | Status evidence    |
| -------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------ |
| [AC-1](test.md#ac-1) | Sumber artefak atau upload; validasi format dan engine sebelum konfirmasi, penolakan dini mismatch          | `UT-0050-AC1`, `IT-0050-AC1`, `CT-0050-AC1`, `SEC-0050-AC1`     | Terbukti (PASS)    |
| [AC-2](test.md#ac-2) | Target restore ke database ada atau database baru (jalur disarankan); tanpa drop otomatis                   | `UT-0050-AC2`, `IT-0050-AC2`, `CT-0050-AC2`, `E2E-0050-AC2`     | Terbukti (PASS)    |
| [AC-3](test.md#ac-3) | Konfirmasi destructive maksimum: ketik nama database target, server memverifikasi `confirmName`             | `IT-0050-AC3`, `CT-0050-AC3`, `E2E-0050-AC3`, `SEC-0050-AC3`    | Terbukti (PASS)    |
| [AC-4](test.md#ac-4) | Eksekusi subprocess streaming dengan credential aman, progress, stderr tersensor, cancel menyatakan parsial | `IT-0050-AC4`, `SEC-0050-AC4`, `SMOKE-0050-AC4`                 | Sebagian (PARTIAL) |
| [AC-5](test.md#ac-5) | Ringkasan hasil job; audit `restore.started`, `restore.completed`/`restore.failed` tanpa isi                | `IT-0050-AC5`, `CT-0050-AC5`, `SEC-0050-AC5`                    | Terbukti (PASS)    |
| [AC-6](test.md#ac-6) | UI alur restore di halaman backup-restore, digerbangi capability `backupRestore` dengan penjelasan          | `UT-0050-AC6`, `CT-0050-AC6`, `E2E-0050-AC6`                    | Terbukti (PASS)    |
| [AC-7](test.md#ac-7) | E2e kedua engine: roundtrip data identik, dump salah ditolak, cancel parsial, audit lengkap                 | `IT-0050-AC7`, `E2E-0050-AC7`, `SEC-0050-AC7`, `SMOKE-0050-AC7` | Sebagian (PARTIAL) |

## Follow-up

- [ ] V2: dukungan pg_restore format custom/directory dan pemulihan terpilih (per table).
