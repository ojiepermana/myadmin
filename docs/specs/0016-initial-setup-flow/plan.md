# Plan 0016. Initial setup end to end

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
| Acceptance criteria | 9 AC: 8 PASS, 1 PARTIAL, 0 BLOCKED                                                                                  |
| Verdict verifikasi  | Belum diverifikasi; verdict hanya boleh berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau. |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                                                                       | AC terkait       | Status  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------- |
| 1   | Implementasikan use case `initial-admin` di `packages/auth` (validasi, transaksi tepat satu admin, audit), unit test dengan fake repo | AC-3, AC-4, AC-7 | Selesai |
| 2   | Implementasikan controller dan middleware `SETUP_REQUIRED` di server, plus rate limit setup, sesuai kontrak                           | AC-1, AC-2, AC-6 | Selesai |
| 3   | Tambahkan validasi response setup ke contract test (spec 0004)                                                                        | AC-1, AC-3       | Selesai |
| 4   | Bangun facade SDK setup dan feature `initial-setup` di web (halaman, store, guard redirect)                                           | AC-2, AC-5, AC-8 | Selesai |
| 5   | Tulis e2e Playwright alur setup dan penolakan setup kedua                                                                             | AC-9             | Selesai |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                                      | Test / proof ID                | Status evidence    |
| -------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------ |
| [AC-1](test.md#ac-1) | `GET /setup/status` publik mengembalikan initialized dari keberadaan user role admin                     | `IT-0016-AC1`                  | Terbukti (PASS)    |
| [AC-2](test.md#ac-2) | Sebelum inisialisasi, route UI dialihkan ke `/setup`; API non publik menjawab 409 `SETUP_REQUIRED`       | `E2E-0016-AC2`                 | Terbukti (PASS)    |
| [AC-3](test.md#ac-3) | `POST /setup/admin` memvalidasi username dan password, membuat admin, menjawab 201 tanpa hash            | `IT-0016-AC3`, `SEC-0016-AC3`  | Terbukti (PASS)    |
| [AC-4](test.md#ac-4) | Setup sukses hanya sekali; race menghasilkan tepat satu admin; ulang menjawab 409 `ALREADY_INITIALIZED`  | `IT-0016-AC4`                  | Terbukti (PASS)    |
| [AC-5](test.md#ac-5) | Setelah setup sukses, UI mengarahkan ke login; tanpa auto login                                          | `E2E-0016-AC5`                 | Terbukti (PASS)    |
| [AC-6](test.md#ac-6) | Endpoint setup di rate limit per IP, maksimum 5 percobaan per menit                                      | `SEC-0016-AC6`                 | Terbukti (PASS)    |
| [AC-7](test.md#ac-7) | Setup sukses tercatat sebagai audit event `auth.initial_admin.created` tanpa memuat password             | `IT-0016-AC7`, `SEC-0016-AC7`  | Terbukti (PASS)    |
| [AC-8](test.md#ac-8) | Halaman setup memakai form foundation, validasi langsung, bisa keyboard, error lewat presenter spec 0015 | `E2E-0016-AC8`, `VIS-0016-AC8` | Sebagian (PARTIAL) |
| [AC-9](test.md#ac-9) | e2e Playwright: instance kosong sampai diarahkan ke login; setup kedua ditolak                           | `E2E-0016-AC9`                 | Terbukti (PASS)    |

## Follow-up

- [ ] Saat spec 0019 selesai, pindahkan penulisan audit setup ke jalur audit resmi.
