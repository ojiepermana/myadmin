# Plan 0022. Provider PostgreSQL: koneksi, TLS, capability, error mapping

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
| Build plan          | Tidak dinyatakan (7 langkah tanpa checkbox pada index.md)                                                           |
| Acceptance criteria | 9 AC: 9 PASS, 0 PARTIAL, 0 BLOCKED                                                                                  |
| Verdict verifikasi  | Belum diverifikasi; verdict hanya boleh berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau. |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                                      | AC terkait | Status           |
| --- | ---------------------------------------------------------------------------------------------------- | ---------- | ---------------- |
| 1   | Siapkan lingkungan test PostgreSQL dua versi di `tests/environments/`                                | AC-8       | Tidak dinyatakan |
| 2   | Bangun `driver/` adaptor Bun.sql (open, close, ping, timeout) dan registry sesi dengan `backend_pid` | AC-1, AC-3 | Tidak dinyatakan |
| 3   | Implementasikan mode TLS lengkap plus test integrasi per mode                                        | AC-2       | Tidak dinyatakan |
| 4   | Bangun `mappers/` SQLSTATE ke `DbError` plus test tabel pemetaan                                     | AC-6       | Tidak dinyatakan |
| 5   | Bangun `capabilities/` deteksi versi dan tabel capability                                            | AC-5       | Tidak dinyatakan |
| 6   | Bangun `test()` dan infrastruktur cancel ganda                                                       | AC-4, AC-7 | Tidak dinyatakan |
| 7   | Jalankan suite kontrak generik pada server nyata; pasang boundary check antar provider               | AC-8, AC-9 | Tidak dinyatakan |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                                         | Test / proof ID           | Status evidence |
| -------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------- | --------------- |
| [AC-1](test.md#ac-1) | `ConnectionPort.open` membuka koneksi Bun.sql, handle sesi dengan `backend_pid`; `close` menutup bersih     | IT-0022-AC1               | Terbukti (PASS) |
| [AC-2](test.md#ac-2) | Mode TLS disable, require, verify-ca, verify-full ditegakkan; gagal `tls_failed` tanpa fallback plaintext   | IT-0022-AC2, SEC-0022-AC2 | Terbukti (PASS) |
| [AC-3](test.md#ac-3) | Connect timeout dari descriptor ditegakkan; lewat tenggat menghasilkan `timeout` dengan pesan aman          | IT-0022-AC3               | Terbukti (PASS) |
| [AC-4](test.md#ac-4) | `test(context)` mengembalikan hasil ternormalisasi (versi, latency) atau `DbError`; tidak menyimpan apa pun | IT-0022-AC4, SEC-0022-AC4 | Terbukti (PASS) |
| [AC-5](test.md#ac-5) | `CapabilityPort.describe` mendeteksi versi dan mengembalikan capability V1 PostgreSQL yang jujur            | IT-0022-AC5, CT-0022-AC5  | Terbukti (PASS) |
| [AC-6](test.md#ac-6) | Pemetaan SQLSTATE ke kategori `DbError`; pesan tanpa connection string atau secret                          | UT-0022-AC6, SEC-0022-AC6 | Terbukti (PASS) |
| [AC-7](test.md#ac-7) | Infrastruktur cancel ganda; hasil cancel terverifikasi query berhenti dengan SQLSTATE 57014                 | IT-0022-AC7               | Terbukti (PASS) |
| [AC-8](test.md#ac-8) | Suite kontrak generik lulus pada server PostgreSQL nyata dua versi mayor                                    | IT-0022-AC8, CT-0022-AC8  | Terbukti (PASS) |
| [AC-9](test.md#ac-9) | Tanpa import lintas provider; SQL dan semantik PostgreSQL tidak bocor keluar package                        | CT-0022-AC9               | Terbukti (PASS) |

## Follow-up

- [ ] Bila test TLS atau cancel Bun.sql gagal dipenuhi, kembali ke /architect untuk supersede keputusan driver (jangan menambal di luar spec).
