# Plan 0032. Object search

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
| Build plan          | 4 dari 4 langkah selesai                                                                                            |
| Acceptance criteria | 6 AC: 6 PASS, 0 PARTIAL, 0 BLOCKED                                                                                  |
| Verdict verifikasi  | Belum diverifikasi; verdict hanya boleh berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau. |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                               | AC terkait | Status  |
| --- | --------------------------------------------------------------------------------------------- | ---------- | ------- |
| 1   | Tambah operasi search ke kontrak, endpoint server di modul explorer, contract test            | AC-1, AC-2 | Selesai |
| 2   | UI kotak pencarian plus daftar hasil berkelompok dengan debounce, abort, pagination, keyboard | AC-3, AC-5 | Selesai |
| 3   | Lompat ke node (ekspansi malas berjalur) dan aksi langsung lewat registry                     | AC-4       | Selesai |
| 4   | E2e dua engine pada fixture besar                                                             | AC-6       | Selesai |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                           | Test / proof ID             | Status evidence |
| -------------------- | --------------------------------------------------------------------------------------------- | --------------------------- | --------------- |
| [AC-1](test.md#ac-1) | GET search memanggil searchObjects provider, paginated pageSize 50, q minimal 2 karakter      | IT-0032-AC1, CT-0032-AC1    | Terbukti (PASS) |
| [AC-2](test.md#ac-2) | pencarian hanya pada koneksi tersambung milik user; input sebagai parameter query             | IT-0032-AC2, SEC-0032-AC2   | Terbukti (PASS) |
| [AC-3](test.md#ac-3) | kotak pencarian debounce 300 ms, hasil per tipe, keyboard penuh, state kosong dan error jelas | UT-0032-AC3, E2E-0032-AC3   | Terbukti (PASS) |
| [AC-4](test.md#ac-4) | hasil melompat ke node explorer atau langsung ke aksi utama object                            | E2E-0032-AC4                | Terbukti (PASS) |
| [AC-5](test.md#ac-5) | request pencarian lama di abort otomatis saat kueri berubah                                   | UT-0032-AC5, E2E-0032-AC5   | Terbukti (PASS) |
| [AC-6](test.md#ac-6) | e2e fixture 2000 table: hasil paginated cepat, lompat ke node bekerja, kedua engine           | E2E-0032-AC6, PERF-0032-AC6 | Terbukti (PASS) |

## Follow-up

- [ ] Tidak ada.
