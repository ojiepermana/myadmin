# Plan 0043. Operasi destructive table

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
| Acceptance criteria | 6 AC: 6 PASS, 0 PARTIAL, 0 BLOCKED                                                                                  |
| Verdict verifikasi  | Belum diverifikasi; verdict hanya boleh berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau. |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                                                                      | AC terkait             | Status  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- | ------- |
| 1   | Implementasikan rename, truncate (dengan opsi), drop di provider `table/` kedua engine plus query dampak dependensi, test integrasi. | AC-1, AC-2, AC-3       | Selesai |
| 2   | Tambah tiga operasi ke kontrak dengan confirmName, regenerasi, contract test.                                                        | AC-4                   | Selesai |
| 3   | Endpoint server dengan verifikasi confirm dan audit `withAudit`.                                                                     | AC-4                   | Selesai |
| 4   | UI: tiga dialog di atas komponen konfirmasi baku dengan bagian dampak, registrasi menu, penanganan tab basi.                         | AC-1, AC-2, AC-3, AC-5 | Selesai |
| 5   | E2e dua engine.                                                                                                                      | AC-6                   | Selesai |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                                              | Test / proof ID                                                             | Status evidence |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------- |
| [AC-1](test.md#ac-1) | Rename table: dialog dengan peringatan dampak, validasi nama, pembaruan node dan tab setelah sukses              | `UT-0043-AC1`, `IT-0043-AC1`, `CT-0043-AC1`, `E2E-0043-AC1`                 | Terbukti (PASS) |
| [AC-2](test.md#ac-2) | Truncate table: perkiraan baris, opsi engine (restart identity), konfirmasi ketik nama dengan confirmName        | `UT-0043-AC2`, `IT-0043-AC2`, `CT-0043-AC2`, `E2E-0043-AC2`, `SEC-0043-AC2` | Terbukti (PASS) |
| [AC-3](test.md#ac-3) | Drop table: dialog dependensi diketahui, ketik nama, tanpa cascade di GUI; penolakan FK diteruskan jelas         | `IT-0043-AC3`, `CT-0043-AC3`, `E2E-0043-AC3`, `SEC-0043-AC3`                | Terbukti (PASS) |
| [AC-4](test.md#ac-4) | Audit `table.renamed`, `table.truncated`, `table.dropped` sebelum sukses; confirmName diverifikasi server        | `IT-0043-AC4`, `CT-0043-AC4`, `SEC-0043-AC4`                                | Terbukti (PASS) |
| [AC-5](test.md#ac-5) | Tiga aksi terdaftar di context menu explorer dan menu tab designer; nonaktif dengan alasan bila tidak tersambung | `UT-0043-AC5`, `E2E-0043-AC5`                                               | Terbukti (PASS) |
| [AC-6](test.md#ac-6) | E2e kedua engine: rename, truncate, drop dengan konfirmasi salah selalu ditolak server; audit tercatat           | `IT-0043-AC6`, `E2E-0043-AC6`, `SEC-0043-AC6`                               | Terbukti (PASS) |

## Follow-up

- [ ] Tidak ada.
