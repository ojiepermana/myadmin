# Plan 0049. Backup

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
| Build plan          | 6 dari 6 langkah selesai                                                                                      |
| Acceptance criteria | 8 AC: 5 PASS, 3 PARTIAL, 0 BLOCKED                                                                            |
| Verdict verifikasi  | Belum diverifikasi; verdict hanya berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau. |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                                 | AC terkait       | Status  |
| --- | ----------------------------------------------------------------------------------------------- | ---------------- | ------- |
| 1   | Modul deteksi tool (config, PATH, versi, kecocokan) plus doctor check plus penentuan capability | AC-1, AC-7       | Selesai |
| 2   | Pembangun argumen dan penanganan credential subprocess per engine di provider                   | AC-2             | Selesai |
| 3   | Executor job backup (subprocess, streaming ke file, gzip, progress, cancel, validasi, manifest) | AC-2, AC-3, AC-4 | Selesai |
| 4   | Kontrak, endpoint (backup, daftar, unduh, hapus), audit, regenerasi, contract test              | AC-5, AC-6       | Selesai |
| 5   | UI dialog backup dan halaman backup-restore (daftar artefak plus panel jobs)                    | AC-6, AC-7       | Selesai |
| 6   | E2e dua engine plus simulasi tanpa tool                                                         | AC-8             | Selesai |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                              | Test / proof ID                                               | Status evidence    |
| -------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- | ------------------ |
| [AC-1](test.md#ac-1) | Deteksi tool via config lalu PATH, cek versi, menentukan capability `backupRestore` dan doctor   | `UT-0049-AC1`, `IT-0049-AC1`, `CT-0049-AC1`, `SMOKE-0049-AC1` | Sebagian (PARTIAL) |
| [AC-2](test.md#ac-2) | `POST /backup` membuat job subprocess native tool; password lewat mekanisme aman, tidak di argv  | `UT-0049-AC2`, `IT-0049-AC2`, `CT-0049-AC2`, `SEC-0049-AC2`   | Terbukti (PASS)    |
| [AC-3](test.md#ac-3) | Keluaran streaming ke folder backups dengan gzip, progress; cancel membersihkan artefak parsial  | `IT-0049-AC3`, `SMOKE-0049-AC3`                               | Sebagian (PARTIAL) |
| [AC-4](test.md#ac-4) | Validasi hasil: exit code nol, file non-kosong, sniff header; stderr kegagalan ter-redaksi       | `UT-0049-AC4`, `IT-0049-AC4`, `SEC-0049-AC4`                  | Terbukti (PASS)    |
| [AC-5](test.md#ac-5) | `GET /backups` daftar artefak milik user dengan manifest; unduh dan hapus terkonfirmasi          | `IT-0049-AC5`, `CT-0049-AC5`, `E2E-0049-AC5`, `SEC-0049-AC5`  | Terbukti (PASS)    |
| [AC-6](test.md#ac-6) | Audit `backup.completed`/`backup.failed` tanpa isi; UI dialog backup plus halaman backup-restore | `IT-0049-AC6`, `E2E-0049-AC6`, `SEC-0049-AC6`                 | Terbukti (PASS)    |
| [AC-7](test.md#ac-7) | Tanpa tool: UI nonaktif dengan penjelasan dan tautan doctor; endpoint menjawab `unsupported`     | `UT-0049-AC7`, `IT-0049-AC7`, `CT-0049-AC7`, `E2E-0049-AC7`   | Terbukti (PASS)    |
| [AC-8](test.md#ac-8) | E2e kedua engine: backup compress valid, structure only, cancel bersih, simulasi tanpa tool      | `IT-0049-AC8`, `E2E-0049-AC8`, `SMOKE-0049-AC8`               | Sebagian (PARTIAL) |

## Follow-up

- [x] Spec 0055 mengevaluasi pembundelan atau pemaketan tool per platform.
