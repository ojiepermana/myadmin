# Plan 0039. Manajemen database

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

| #   | Langkah rencana                                                                                                          | AC terkait       | Status  |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ---------------- | ------- |
| 1   | Implementasikan `DatabasePort` create/drop/properties di kedua provider plus test integrasi                              | AC-1, AC-2, AC-3 | Selesai |
| 2   | Tambah operasi ke kontrak (termasuk confirmName), regenerasi, contract test                                              | AC-3, AC-4       | Selesai |
| 3   | Bangun komponen `destructive-action-confirmation` (ketik nama, ringkasan target, koneksi, engine) di database-components | AC-3             | Selesai |
| 4   | UI: halaman properti, form create data driven, aksi drop dari explorer, plus registrasi menu (spec 0031)                 | AC-1, AC-2, AC-5 | Selesai |
| 5   | Audit lewat `withAudit`, e2e dua engine                                                                                  | AC-4, AC-6       | Selesai |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                                       | Test / proof ID                                      | Status evidence |
| -------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | --------------- |
| [AC-1](test.md#ac-1) | Halaman properti database hanya menampilkan properti yang provider paparkan; ukuran dimuat malas          | IT-0039-AC1, E2E-0039-AC1                            | Terbukti (PASS) |
| [AC-2](test.md#ac-2) | `POST /databases` dengan opsi per engine dari metadata server target; validasi nama oleh provider         | UT-0039-AC2, IT-0039-AC2, CT-0039-AC2, E2E-0039-AC2  | Terbukti (PASS) |
| [AC-3](test.md#ac-3) | Drop database dengan konfirmasi ketik nama; server menolak database yang sedang dipakai tab aktif         | IT-0039-AC3, CT-0039-AC3, E2E-0039-AC3, SEC-0039-AC3 | Terbukti (PASS) |
| [AC-4](test.md#ac-4) | Create dan drop diaudit sebelum response sukses; confirmName diverifikasi server sebagai pertahanan kedua | IT-0039-AC4, CT-0039-AC4, SEC-0039-AC4               | Terbukti (PASS) |
| [AC-5](test.md#ac-5) | Kegagalan tiba sebagai `DbError` berkategori dengan pesan aman di formulir                                | UT-0039-AC5, IT-0039-AC5, E2E-0039-AC5, SEC-0039-AC5 | Terbukti (PASS) |
| [AC-6](test.md#ac-6) | E2e kedua engine: create, properti, drop ketik nama, audit; confirmName salah ditolak server              | IT-0039-AC6, E2E-0039-AC6, SEC-0039-AC6              | Terbukti (PASS) |

## Follow-up

- [x] Spec 0040, 0043, 0044, 0046, 0050 memakai komponen konfirmasi destructive ini.
