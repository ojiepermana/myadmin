# Plan 0017. Login, logout, dan session

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
| Build plan          | Tidak dinyatakan (6 langkah tanpa checkbox pada index.md)                                                           |
| Acceptance criteria | 10 AC: 7 PASS, 3 PARTIAL, 0 BLOCKED                                                                                 |
| Verdict verifikasi  | Belum diverifikasi; verdict hanya boleh berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau. |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                                                        | AC terkait             | Status           |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------- | ---------------- |
| 1   | Use case sessions di `packages/auth` (create, validate idle/absolut, revoke, deleteExpired) dengan unit test fake repo | AC-1, AC-4, AC-10      | Tidak dinyatakan |
| 2   | Endpoint login/logout/me plus rate limiter (dipakai bersama spec 0016) dan pesan gagal seragam                         | AC-1, AC-2, AC-3, AC-6 | Tidak dinyatakan |
| 3   | Middleware sesi HTTP plus pemeriksaan CSRF, dan hook validasi sesi pada upgrade dan pemeriksaan berkala WS             | AC-4, AC-5, AC-7       | Tidak dinyatakan |
| 4   | Web: halaman login, `auth.facade`, guard route, penanganan `sessionExpired`, header CSRF otomatis di SDK               | AC-7, AC-8             | Tidak dinyatakan |
| 5   | Audit event login/logout/gagal lewat jalur audit                                                                       | AC-9                   | Tidak dinyatakan |
| 6   | Contract test operasi auth; test keamanan di `tests/security/auth/`; e2e login logout expiry                           | Seluruh AC             | Tidak dinyatakan |

## Rencana acceptance dan status evidence

| AC                     | Ringkasan kebutuhan                                                                                         | Test / proof ID                          | Status evidence    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------ |
| [AC-1](test.md#ac-1)   | Login sukses membuat session dan cookie HttpOnly; token acak hanya disimpan sebagai hash                    | IT-0017-AC1, SEC-0017-AC1                | Terbukti (PASS)    |
| [AC-2](test.md#ac-2)   | Login gagal 401 dengan pesan dan waktu seragam untuk username atau password salah                           | SEC-0017-AC2, PERF-0017-AC2              | Sebagian (PARTIAL) |
| [AC-3](test.md#ac-3)   | Rate limit login per IP dan username; user nonaktif ditolak dengan pesan sama                               | SEC-0017-AC3                             | Terbukti (PASS)    |
| [AC-4](test.md#ac-4)   | Middleware sesi menegakkan token valid, idle, dan absolute timeout; pelanggaran 401 SESSION_EXPIRED         | IT-0017-AC4, SEC-0017-AC4                | Terbukti (PASS)    |
| [AC-5](test.md#ac-5)   | WebSocket memakai cookie sesi yang sama; sesi kadaluarsa atau dicabut memutus koneksi aktif                 | IT-0017-AC5, SEC-0017-AC5, PERF-0017-AC5 | Sebagian (PARTIAL) |
| [AC-6](test.md#ac-6)   | Logout mencabut sesi, menghapus cookie, mencatat audit; `GET /auth/me` mengembalikan user dan role          | IT-0017-AC6                              | Terbukti (PASS)    |
| [AC-7](test.md#ac-7)   | CSRF: mutasi non publik wajib header `X-Myadmin-Csrf: 1` dan validasi Origin                                | SEC-0017-AC7                             | Terbukti (PASS)    |
| [AC-8](test.md#ac-8)   | Route guard mengalihkan ke `/login`; `sessionExpired` membersihkan state; login bisa diselesaikan keyboard  | E2E-0017-AC8, VIS-0017-AC8               | Sebagian (PARTIAL) |
| [AC-9](test.md#ac-9)   | Login sukses, gagal, dan logout menghasilkan audit event tanpa password; pembersihan tidak membanjiri audit | IT-0017-AC9, SEC-0017-AC9                | Terbukti (PASS)    |
| [AC-10](test.md#ac-10) | Pembersihan sesi kadaluarsa berkala per jam lewat `SessionRepository.deleteExpired`                         | IT-0017-AC10                             | Terbukti (PASS)    |

## Follow-up

- [ ] Spec 0018 mencabut semua sesi user saat password diubah atau user dinonaktifkan.
