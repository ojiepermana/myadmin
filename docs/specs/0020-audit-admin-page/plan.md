# Plan 0020. Halaman audit Admin

**Date**: 2026-08-30
**Spec status**: mengikuti [index.md](index.md)
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Aturan dokumen

- Dokumen planning ini disusulkan setelah spec berjalan. Isinya diturunkan dari `index.md`, `test.md`, `verify.md`, dan `docs/specs/ac-evidence-matrix.md`; file ini bukan sumber kebenaran baru.
- Status pada tabel di bawah adalah snapshot per 2026-08-30. Bila build plan, acceptance criteria, atau evidence berubah, perbarui tabel ini bersama file sumbernya.
- Status implementasi tidak boleh dinaikkan tanpa evidence pada `verify.md` atau matrix acceptance.

## Ringkasan progres

| Dimensi             | Nilai                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Status spec         | In Progress                                                                                                                                      |
| Build plan          | 5 dari 5 langkah selesai                                                                                                                         |
| Acceptance criteria | 7 AC: 7 PASS, 0 PARTIAL, 0 BLOCKED                                                                                                               |
| Verdict verifikasi  | Belum diverifikasi; evidence lokal per AC lulus, namun verdict hanya berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau. |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                                              | AC terkait       | Status  |
| --- | ------------------------------------------------------------------------------------------------------------ | ---------------- | ------- |
| 1   | Perluas `AuditRepository.query` dengan builder filter parameterized plus test                                | AC-1, AC-2, AC-6 | Selesai |
| 2   | Tambahkan operasi `/audit` dan `/audit/actions` ke kontrak, regenerasi tipe dan SDK, daftarkan contract test | AC-1, AC-3       | Selesai |
| 3   | Endpoint server admin only                                                                                   | AC-4             | Selesai |
| 4   | Web: feature `audit` (halaman grid, panel filter, baris expandable), guard admin                             | AC-5             | Selesai |
| 5   | E2e alur audit dari aksi nyata                                                                               | AC-7             | Selesai |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                                       | Test / proof ID            | Status evidence |
| -------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------- | --------------- |
| [AC-1](test.md#ac-1) | `GET /audit` admin only dengan filter waktu, actor, action, koneksi, targetRef, result yang bisa digabung | IT-0020-AC1, SEC-0020-AC1  | Terbukti (PASS) |
| [AC-2](test.md#ac-2) | Hasil terurut `occurred_at` menurun dengan pagination server side, pageSize maksimum 100                  | IT-0020-AC2                | Terbukti (PASS) |
| [AC-3](test.md#ac-3) | Response memuat kolom `audit_logs` yang aman; `details` sudah tersensor; tanpa un redact                  | IT-0020-AC3, SEC-0020-AC3  | Terbukti (PASS) |
| [AC-4](test.md#ac-4) | Role user 403; guard web menyembunyikan menu audit; server tetap penegak                                  | E2E-0020-AC4, SEC-0020-AC4 | Terbukti (PASS) |
| [AC-5](test.md#ac-5) | Halaman audit data grid foundation, panel filter dari `GET /audit/actions`, baris expandable              | E2E-0020-AC5               | Terbukti (PASS) |
| [AC-6](test.md#ac-6) | Query berfilter memakai index; responsif pada 100 ribu baris sintetis                                     | PERF-0020-AC6              | Terbukti (PASS) |
| [AC-7](test.md#ac-7) | E2e: aksi destructive dari test muncul di halaman audit dengan filter action tepat                        | E2E-0020-AC7               | Terbukti (PASS) |

## Follow-up

- [ ] Tinjau kebutuhan ekspor audit setelah pemakaian nyata (kandidat V2).
