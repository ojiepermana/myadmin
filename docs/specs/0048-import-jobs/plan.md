# Plan 0048. Import

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

| #   | Langkah rencana                                                                                          | AC terkait | Status  |
| --- | -------------------------------------------------------------------------------------------------------- | ---------- | ------- |
| 1   | Endpoint unggah streaming dengan batas mengalir, penyimpanan temp, uploadId, pratinjau terpotong server. | AC-1, AC-7 | Selesai |
| 2   | Mode streaming pemecah statement di provider plus executor job SQL (mode transaksi, laporan posisi).     | AC-2, AC-5 | Selesai |
| 3   | Executor job CSV (pemetaan, batch berparameter, ambang baris gagal, truncateFirst dengan konfirmasi).    | AC-3, AC-4 | Selesai |
| 4   | Kontrak, regenerasi, contract test; audit.                                                               | AC-6       | Selesai |
| 5   | UI alur import lengkap dengan pemetaan dan pratinjau.                                                    | AC-7       | Selesai |
| 6   | E2e roundtrip dan kegagalan.                                                                             | AC-8       | Selesai |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                                       | Test / proof ID                                              | Status evidence |
| -------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------- |
| [AC-1](test.md#ac-1) | `POST /import/upload` streaming ke temp, validasi ukuran saat mengalir dan tipe; uploadId berlaku 1 jam   | `UT-0048-AC1`, `IT-0048-AC1`, `CT-0048-AC1`, `SEC-0048-AC1`  | Terbukti (PASS) |
| [AC-2](test.md#ac-2) | Import SQL: pemecah statement streaming, eksekusi berurutan, mode transaksi single atau per-statement     | `UT-0048-AC2`, `IT-0048-AC2`, `CT-0048-AC2`                  | Terbukti (PASS) |
| [AC-3](test.md#ac-3) | Import CSV: pemetaan kolom, INSERT batch berparameter, baris gagal dicatat sampai ambang 100              | `UT-0048-AC3`, `IT-0048-AC3`, `CT-0048-AC3`                  | Terbukti (PASS) |
| [AC-4](test.md#ac-4) | Opsi destructive truncate dulu perlu konfirmasi eksplisit (flag plus confirmName), diaudit destructive    | `IT-0048-AC4`, `CT-0048-AC4`, `E2E-0048-AC4`, `SEC-0048-AC4` | Terbukti (PASS) |
| [AC-5](test.md#ac-5) | Cancel berhenti pada batas statement/batch; mode single di-rollback; hasil parsial dilaporkan jujur       | `IT-0048-AC5`, `E2E-0048-AC5`                                | Terbukti (PASS) |
| [AC-6](test.md#ac-6) | Hasil akhir job memuat ringkasan; audit `import.completed` atau `import.failed` tanpa isi data            | `IT-0048-AC6`, `CT-0048-AC6`, `SEC-0048-AC6`                 | Terbukti (PASS) |
| [AC-7](test.md#ac-7) | UI alur import: drag and drop, opsi per format, pemetaan CSV dengan pratinjau 20 baris terpotong server   | `CT-0048-AC7`, `E2E-0048-AC7`, `SEC-0048-AC7`                | Terbukti (PASS) |
| [AC-8](test.md#ac-8) | E2e kedua engine: roundtrip export SQL, CSV dengan baris gagal, konfirmasi truncate, batas unggah ditolak | `IT-0048-AC8`, `E2E-0048-AC8`, `SEC-0048-AC8`                | Terbukti (PASS) |

## Follow-up

- [ ] V2: jalur bulk load native (COPY, LOAD DATA LOCAL) per provider sebagai optimasi.
