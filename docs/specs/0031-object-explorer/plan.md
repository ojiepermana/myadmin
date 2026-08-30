# Plan 0031. Object explorer

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
| Acceptance criteria | 8 AC: 8 PASS, 0 PARTIAL, 0 BLOCKED                                                                                  |
| Verdict verifikasi  | Belum diverifikasi; verdict hanya boleh berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau. |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                                                                                | AC terkait             | Status  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------- |
| 1   | Tambah endpoint metadata ke kontrak, implementasi server di modul explorer (meneruskan MetadataPort dengan pemeriksaan koneksi), contract test | AC-1                   | Selesai |
| 2   | Bangun `explorer.store` dan pohon virtualized data driven dengan lazy load dan halaman berikutnya                                              | AC-2, AC-3, AC-4, AC-7 | Selesai |
| 3   | Registry aksi context menu yang membaca capability dan fitur terpasang                                                                         | AC-5                   | Selesai |
| 4   | Refresh per node dengan invalidasi cache provider                                                                                              | AC-6                   | Selesai |
| 5   | E2e dua engine                                                                                                                                 | AC-8                   | Selesai |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                                  | Test / proof ID                           | Status evidence |
| -------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------- | --------------- |
| [AC-1](test.md#ac-1) | endpoint metadata paginated di kontrak; 409 NOT_CONNECTED bila belum connect                         | IT-0031-AC1, CT-0031-AC1, SEC-0031-AC1    | Terbukti (PASS) |
| [AC-2](test.md#ac-2) | pohon dirender dari data dan capability tanpa percabangan nama engine di UI                          | E2E-0031-AC2, MANUAL-0031-AC2             | Terbukti (PASS) |
| [AC-3](test.md#ac-3) | ekspansi memuat hanya anak node; item muat lebih banyak; tanpa prefetch rekursif                     | E2E-0031-AC3                              | Terbukti (PASS) |
| [AC-4](test.md#ac-4) | node berikon dengan detail ringkas; loading dan error per node, bisa retry                           | E2E-0031-AC4, VIS-0031-AC4                | Terbukti (PASS) |
| [AC-5](test.md#ac-5) | context menu per jenis node digerakkan capability; aksi tak tersedia dinonaktifkan dengan penjelasan | E2E-0031-AC5                              | Terbukti (PASS) |
| [AC-6](test.md#ac-6) | refresh manual per node menginvalidasi cache metadata dan memuat ulang                               | E2E-0031-AC6                              | Terbukti (PASS) |
| [AC-7](test.md#ac-7) | pohon virtualized mulus untuk ribuan node dengan navigasi keyboard penuh                             | E2E-0031-AC7, PERF-0031-AC7, VIS-0031-AC7 | Terbukti (PASS) |
| [AC-8](test.md#ac-8) | e2e kedua engine memverifikasi hierarki schema dan context menu sesuai capability                    | E2E-0031-AC8                              | Terbukti (PASS) |

## Follow-up

- [ ] Setiap fitur baru (0037, 0039, 0041, 0043, 0044, 0045) mendaftarkan aksinya ke registry menu.
