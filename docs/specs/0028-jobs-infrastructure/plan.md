# Plan 0028. Jobs infrastructure

**Date**: 2026-08-30
**Spec status**: mengikuti [index.md](index.md)
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Aturan dokumen

- Dokumen planning ini disusulkan setelah spec berjalan. Isinya diturunkan dari `index.md`, `test.md`, `verify.md`, dan `docs/specs/ac-evidence-matrix.md`; file ini bukan sumber kebenaran baru.
- Status pada tabel di bawah adalah snapshot per 2026-08-30. Bila build plan, acceptance criteria, atau evidence berubah, perbarui tabel ini bersama file sumbernya.
- Status implementasi tidak boleh dinaikkan tanpa evidence pada `verify.md` atau matrix acceptance.

## Ringkasan progres

| Dimensi             | Nilai                                                                |
| ------------------- | -------------------------------------------------------------------- |
| Status spec         | Accepted                                                             |
| Build plan          | 5 dari 5 langkah selesai                                             |
| Acceptance criteria | 8 AC: 8 PASS, 0 PARTIAL, 0 BLOCKED                                   |
| Verdict verifikasi  | Lulus; spec dapat ditandai penuh berdasarkan evidence yang tersedia. |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                                            | AC terkait       | Status  |
| --- | ---------------------------------------------------------------------------------------------------------- | ---------------- | ------- |
| 1   | Model job, state machine, dan JobManager (submit, antrean, konkurensi, penyimpanan sementara, pembersihan) | AC-1, AC-2, AC-6 | Selesai |
| 2   | Cancellation (AbortSignal) dan progress (throttle, event internal)                                         | AC-3, AC-4       | Selesai |
| 3   | Normalisasi error executor plus logging correlation                                                        | AC-7             | Selesai |
| 4   | Operasi jobs ke kontrak, endpoint server dengan kepemilikan, SDK facade, contract test                     | AC-5             | Selesai |
| 5   | Unit test lengkap                                                                                          | AC-8             | Selesai |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                   | Test / proof ID                        | Status evidence |
| -------------------- | ------------------------------------------------------------------------------------- | -------------------------------------- | --------------- |
| [AC-1](test.md#ac-1) | model Job dan state machine terdefinisi; transisi ilegal ditolak                      | UT-0028-AC1                            | Terbukti (PASS) |
| [AC-2](test.md#ac-2) | submit mengembalikan job id seketika; konkurensi global default 4, antrean FIFO       | UT-0028-AC2                            | Terbukti (PASS) |
| [AC-3](test.md#ac-3) | cancellation kooperatif lewat AbortSignal dengan hasil state yang jelas               | UT-0028-AC3                            | Terbukti (PASS) |
| [AC-4](test.md#ac-4) | progress dengan throttle 5 update per detik; event internal bisa disubscribe          | UT-0028-AC4                            | Terbukti (PASS) |
| [AC-5](test.md#ac-5) | API jobs milik sendiri paginated; job orang lain 404 bagi non pemilik                 | IT-0028-AC5, CT-0028-AC5, SEC-0028-AC5 | Terbukti (PASS) |
| [AC-6](test.md#ac-6) | job selesai disimpan 1 jam lalu dibersihkan; restart menghilangkan job secara jujur   | UT-0028-AC6, E2E-0028-AC6              | Terbukti (PASS) |
| [AC-7](test.md#ac-7) | kegagalan executor dinormalisasi aman tanpa merobohkan proses; log dengan correlation | UT-0028-AC7, SEC-0028-AC7              | Terbukti (PASS) |
| [AC-8](test.md#ac-8) | unit test menutup transisi, konkurensi, cancel, throttle, pembersihan, kepemilikan    | UT-0028-AC8                            | Terbukti (PASS) |

## Follow-up

- [ ] V2: persistensi riwayat job dan scheduled job bila kebutuhan terbukti.
