# Plan 0024. Provider MySQL: koneksi, TLS, capability, error mapping

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
| Acceptance criteria | 8 AC: 8 PASS, 0 PARTIAL, 0 BLOCKED                                                                                  |
| Verdict verifikasi  | Belum diverifikasi; verdict hanya boleh berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau. |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                         | AC terkait | Status           |
| --- | ----------------------------------------------------------------------- | ---------- | ---------------- |
| 1   | Lingkungan test MySQL dua versi di `tests/environments/`                | AC-7       | Tidak dinyatakan |
| 2   | `driver/` adaptor Bun.sql MySQL plus registry sesi dengan connection_id | AC-1       | Tidak dinyatakan |
| 3   | Mode TLS lengkap plus test per mode                                     | AC-2       | Tidak dinyatakan |
| 4   | `mappers/` kode error ke `DbError` plus test tabel                      | AC-5       | Tidak dinyatakan |
| 5   | `capabilities/` deteksi versi dan tabel capability dengan reasons       | AC-4       | Tidak dinyatakan |
| 6   | `test()` dan cancel `KILL QUERY`                                        | AC-3, AC-6 | Tidak dinyatakan |
| 7   | Suite kontrak generik dan boundary check                                | AC-7, AC-8 | Tidak dinyatakan |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                                           | Test / proof ID           | Status evidence |
| -------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------- | --------------- |
| [AC-1](test.md#ac-1) | `open(context)` membuka koneksi Bun.sql MySQL; `connection_id()` tercatat; `close` bersih; timeout ditegakkan | IT-0024-AC1               | Terbukti (PASS) |
| [AC-2](test.md#ac-2) | Mode TLS disable, require, verify-ca, verify-full; gagal `tls_failed` tanpa downgrade                         | IT-0024-AC2, SEC-0024-AC2 | Terbukti (PASS) |
| [AC-3](test.md#ac-3) | `test(context)` ternormalisasi: sukses (versi, latency) atau `DbError`; tanpa penyimpanan                     | IT-0024-AC3, SEC-0024-AC3 | Terbukti (PASS) |
| [AC-4](test.md#ac-4) | `describe` mengembalikan capability V1 MySQL yang jujur, `schemas` false dengan reason                        | IT-0024-AC4, CT-0024-AC4  | Terbukti (PASS) |
| [AC-5](test.md#ac-5) | Pemetaan kode error MySQL ke kategori `DbError`; pesan tanpa secret                                           | UT-0024-AC5, SEC-0024-AC5 | Terbukti (PASS) |
| [AC-6](test.md#ac-6) | Cancel lewat `KILL QUERY` dari koneksi kontrol; sesi menerima error `cancelled`                               | IT-0024-AC6               | Terbukti (PASS) |
| [AC-7](test.md#ac-7) | Suite kontrak generik lulus pada MySQL nyata dua versi yang didukung                                          | IT-0024-AC7, CT-0024-AC7  | Terbukti (PASS) |
| [AC-8](test.md#ac-8) | Boundary: tanpa impor dari `database-postgresql`; semantik MySQL tidak bocor keluar package                   | CT-0024-AC8               | Terbukti (PASS) |

## Follow-up

- [ ] Bila gerbang test Bun.sql MySQL gagal, kembali ke /architect untuk supersede keputusan driver.
