# Plan 0018. User management dan change password

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
| Status spec         | Accepted                                                                                                            |
| Build plan          | Tidak dinyatakan (6 langkah tanpa checkbox pada index.md)                                                           |
| Acceptance criteria | 9 AC: 7 PASS, 2 PARTIAL, 0 BLOCKED                                                                                  |
| Verdict verifikasi  | Belum diverifikasi; verdict hanya boleh berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau. |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                                                                                | AC terkait                   | Status           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ---------------- |
| 1   | Use case di `packages/auth`: changePassword, createUser, updateUserRoleStatus (LAST_ADMIN dalam transaksi), resetPassword; unit test fake repo | AC-1, AC-3, AC-4, AC-5, AC-6 | Tidak dinyatakan |
| 2   | Tambahkan operasi ke kontrak OpenAPI plus regenerasi tipe dan SDK, daftarkan ke contract test                                                  | -                            | Tidak dinyatakan |
| 3   | Endpoint server plus middleware role admin                                                                                                     | AC-2                         | Tidak dinyatakan |
| 4   | Web: halaman ganti password dan halaman admin users (daftar, form, konfirmasi), guard role                                                     | AC-7                         | Tidak dinyatakan |
| 5   | Audit event lengkap                                                                                                                            | AC-8                         | Tidak dinyatakan |
| 6   | E2e dua peran dan test keamanan otorisasi di `tests/security/authorization/`                                                                   | AC-9                         | Tidak dinyatakan |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                                                     | Test / proof ID            | Status evidence    |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------ |
| [AC-1](test.md#ac-1) | Change password memverifikasi password lama, lolos policy, mengganti hash, mencabut sesi lain, diaudit                  | IT-0018-AC1, SEC-0018-AC1  | Terbukti (PASS)    |
| [AC-2](test.md#ac-2) | Endpoint admin `/users*` (list, buat, patch, reset password) hanya untuk role admin; user 403                           | CT-0018-AC2, SEC-0018-AC2  | Terbukti (PASS)    |
| [AC-3](test.md#ac-3) | Menonaktifkan user mencabut seluruh sesi dan menolak login; mengaktifkan memulihkan tanpa ubah password                 | IT-0018-AC3, SEC-0018-AC3  | Terbukti (PASS)    |
| [AC-4](test.md#ac-4) | Invariant Admin terakhir: nonaktifkan atau turunkan Admin aktif terakhir ditolak 409 LAST_ADMIN                         | IT-0018-AC4, SEC-0018-AC4  | Terbukti (PASS)    |
| [AC-5](test.md#ac-5) | Reset password oleh Admin mengganti hash, mencabut sesi target, diaudit; password tidak tampil                          | IT-0018-AC5, SEC-0018-AC5  | Terbukti (PASS)    |
| [AC-6](test.md#ac-6) | Admin tidak bisa mengubah role atau status dirinya bila melanggar invariant Admin terakhir                              | IT-0018-AC6, SEC-0018-AC6  | Terbukti (PASS)    |
| [AC-7](test.md#ac-7) | UI ganti password dan manajemen user; guard role dua lapis; dialog konfirmasi foundation                                | E2E-0018-AC7, VIS-0018-AC7 | Sebagian (PARTIAL) |
| [AC-8](test.md#ac-8) | Audit event user.created, role_changed, deactivated, activated, password_changed, password_reset tanpa material rahasia | IT-0018-AC8, SEC-0018-AC8  | Terbukti (PASS)    |
| [AC-9](test.md#ac-9) | E2e: user biasa tanpa menu admin dan 403 di API; alur buat, login, nonaktifkan, login ditolak                           | E2E-0018-AC9, SEC-0018-AC9 | Sebagian (PARTIAL) |

## Follow-up

- [ ] V2: alur force change password dan kebijakan password yang bisa dikonfigurasi.
