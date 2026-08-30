# Plan 0008. SQLite core dan migration runner

**Date**: 2026-08-30
**Spec status**: mengikuti [index.md](index.md)
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Aturan dokumen

- Dokumen planning ini disusulkan setelah spec berjalan. Isinya diturunkan dari `index.md`, `test.md`, `verify.md`, dan `docs/specs/ac-evidence-matrix.md`; file ini bukan sumber kebenaran baru.
- Status pada tabel di bawah adalah snapshot per 2026-08-30. Bila build plan, acceptance criteria, atau evidence berubah, perbarui tabel ini bersama file sumbernya.
- Status implementasi tidak boleh dinaikkan tanpa evidence pada `verify.md` atau matrix acceptance.

## Ringkasan progres

| Dimensi             | Nilai                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| Status spec         | In Progress                                                                                       |
| Build plan          | Tidak dinyatakan (daftar 6 langkah tanpa checkbox pada index.md)                                  |
| Acceptance criteria | 8 AC: 8 PASS, 0 PARTIAL, 0 BLOCKED                                                                |
| Verdict verifikasi  | Belum diverifikasi; result per AC pada verify.md belum diisi dengan evidence yang dapat ditinjau. |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                                               | AC terkait       | Status           |
| --- | ------------------------------------------------------------------------------------------------------------- | ---------------- | ---------------- |
| 1   | Bangun `database/connection.ts`, `pragmas.ts`, `transaction.ts`, `health.ts` di `packages/internal-sqlite`    | AC-1, AC-6       | Tidak dinyatakan |
| 2   | Bangun `migration-runner.ts` (urutan, transaksi, tabel riwayat, checksum)                                     | AC-2, AC-3, AC-5 | Tidak dinyatakan |
| 3   | Tulis migrasi `0001-initial.ts` berisi DDL sebelas tabel plus index                                           | AC-4             | Tidak dinyatakan |
| 4   | Tambah generator UUIDv7 di `packages/kernel/ids` beserta test keurutan                                        | -                | Tidak dinyatakan |
| 5   | Sambungkan runner ke boot `serve` dan perintah `migrate` (spec 0006, 0007), plus checkpoint WAL saat shutdown | AC-5, AC-7       | Tidak dinyatakan |
| 6   | Integration test di `tests/integration/internal-sqlite/`                                                      | AC-8             | Tidak dinyatakan |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                                     | Test / proof ID | Status evidence |
| -------------------- | ------------------------------------------------------------------------------------------------------- | --------------- | --------------- |
| [AC-1](test.md#ac-1) | Database dibuka dari `<data-dir>/myadmin.db` dengan pragma wajib yang diterapkan di satu tempat         | `IT-0008-AC1`   | Terbukti (PASS) |
| [AC-2](test.md#ac-2) | Runner migrasi bernomor berurutan, per transaksi, tercatat di tabel `migrations`; rerun no op           | `IT-0008-AC2`   | Terbukti (PASS) |
| [AC-3](test.md#ac-3) | Checksum migrasi diverifikasi; file migrasi lama yang berubah membuat start gagal jelas                 | `IT-0008-AC3`   | Terbukti (PASS) |
| [AC-4](test.md#ac-4) | Migrasi `0001-initial` membuat sebelas tabel lengkap dengan PK, FK, unique constraint, dan index        | `IT-0008-AC4`   | Terbukti (PASS) |
| [AC-5](test.md#ac-5) | Kegagalan buka atau migrasi menghentikan boot dengan exit bukan nol; tanpa database setengah termigrasi | `IT-0008-AC5`   | Terbukti (PASS) |
| [AC-6](test.md#ac-6) | Helper transaksi tersedia dengan dukungan nested lewat savepoint, dipakai repositories                  | `IT-0008-AC6`   | Terbukti (PASS) |
| [AC-7](test.md#ac-7) | Shutdown rapi menjalankan checkpoint WAL agar file db aman disalin                                      | `IT-0008-AC7`   | Terbukti (PASS) |
| [AC-8](test.md#ac-8) | Integration test: migrasi dari kosong, idempotensi, checksum mismatch gagal, foreign key ditegakkan     | `IT-0008-AC8`   | Terbukti (PASS) |

## Follow-up

- [ ] Dokumentasikan prosedur backup file internal (db plus WAL) di dokumentasi operator (spec 0055).
