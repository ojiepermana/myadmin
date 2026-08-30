# Plan 0036. Query history dan saved queries

**Date**: 2026-08-30
**Spec status**: mengikuti [index.md](index.md)
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Aturan dokumen

- Dokumen planning ini disusulkan setelah spec berjalan. Isinya diturunkan dari `index.md`, `test.md`, `verify.md`, dan `docs/specs/ac-evidence-matrix.md`; file ini bukan sumber kebenaran baru.
- Status pada tabel di bawah adalah snapshot per 2026-08-30. Bila build plan, acceptance criteria, atau evidence berubah, perbarui tabel ini bersama file sumbernya.
- Status implementasi tidak boleh dinaikkan tanpa evidence pada `verify.md` atau matrix acceptance.

## Ringkasan progres

| Dimensi             | Nilai                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| Status spec         | In Progress                                                                                                   |
| Build plan          | 4 dari 4 langkah selesai                                                                                      |
| Acceptance criteria | 8 AC: 8 PASS, 0 PARTIAL, 0 BLOCKED                                                                            |
| Verdict verifikasi  | Belum diverifikasi; verdict hanya berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau. |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                                      | AC terkait             | Status  |
| --- | ---------------------------------------------------------------------------------------------------- | ---------------------- | ------- |
| 1   | Tambah operasi history dan saved ke kontrak, regenerasi, contract test                               | -                      | Selesai |
| 2   | Use case dan endpoint server (filter berparameter, kepemilikan, retensi saat penulisan, hapus semua) | AC-1 sampai AC-4, AC-6 | Selesai |
| 3   | UI halaman query-history dua tab plus panel cepat di editor plus simpan cepat                        | AC-5, AC-7             | Selesai |
| 4   | E2e dan test otorisasi                                                                               | AC-8                   | Selesai |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                                  | Test / proof ID            | Status evidence |
| -------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------- | --------------- |
| [AC-1](test.md#ac-1) | `GET /query/history` per user, terbaru dulu, paginated, dengan filter teks, koneksi, status, waktu   | IT-0036-AC1                | Terbukti (PASS) |
| [AC-2](test.md#ac-2) | Aksi entri riwayat: buka ke tab dengan konteks, salin, hapus entri, hapus semua dengan konfirmasi    | IT-0036-AC2, E2E-0036-AC2  | Terbukti (PASS) |
| [AC-3](test.md#ac-3) | Retensi otomatis pada setiap penulisan; batas dari settings; UI menampilkan keterangan retensi       | IT-0036-AC3, E2E-0036-AC3  | Terbukti (PASS) |
| [AC-4](test.md#ac-4) | Saved queries CRUD dengan nama unik per user, tag dan konteks opsional                               | IT-0036-AC4                | Terbukti (PASS) |
| [AC-5](test.md#ac-5) | Simpan cepat dari editor dengan konteks tab; timpa nama sama secara eksplisit                        | E2E-0036-AC5               | Terbukti (PASS) |
| [AC-6](test.md#ac-6) | Riwayat dan saved query privat per pemilik; Admin pun tidak bisa membaca milik user lain             | SEC-0036-AC6               | Terbukti (PASS) |
| [AC-7](test.md#ac-7) | Halaman dua tab (Riwayat, Tersimpan) dengan pencarian, filter, virtual list, plus panel cepat editor | E2E-0036-AC7, VIS-0036-AC7 | Terbukti (PASS) |
| [AC-8](test.md#ac-8) | E2e lifecycle riwayat dan saved query; isolasi antar user dibuktikan test otorisasi                  | E2E-0036-AC8, SEC-0036-AC8 | Terbukti (PASS) |

## Follow-up

Tidak ada follow-up terbuka pada index.md.
