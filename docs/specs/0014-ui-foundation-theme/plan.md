# Plan 0014. UI foundation dan theme

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
| Acceptance criteria | 7 AC: 7 PASS, 0 PARTIAL, 0 BLOCKED                                                                                  |
| Verdict verifikasi  | Belum diverifikasi; verdict hanya boleh berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau. |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                                                                                        | AC terkait       | Status  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- | ------- |
| 1   | Pasang @ojiepermana/angular v22.1.7 atau lebih baru dari npm publik, kunci versi di lockfile, tambahkan @angular/material sebagai peer bila dibutuhkan | AC-1             | Selesai |
| 2   | Bangun `core/theme/` (konfigurasi identitas, token, mode) dan `theme-preference.store.ts` dengan abstraksi sumber                                      | AC-2, AC-3, AC-4 | Selesai |
| 3   | Lakukan audit kapabilitas terhadap daftar kebutuhan V1 dan tulis hasilnya (tabel kebutuhan ke API paket) di docs/architecture                          | AC-5             | Selesai |
| 4   | Bangun halaman demo dev only                                                                                                                           | AC-6             | Selesai |
| 5   | Tambahkan aturan lint/boundary larangan design system kedua dan pola komponen generik                                                                  | AC-7             | Selesai |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                                 | Test / proof ID                     | Status evidence |
| -------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------- | --------------- |
| [AC-1](test.md#ac-1) | @ojiepermana/angular v22.1.7+ terkunci di lockfile; theme dan provider lewat `core/theme/`          | `SMOKE-0014-AC1`                    | Terbukti (PASS) |
| [AC-2](test.md#ac-2) | Mode light, dark, dan system bekerja hidup tanpa reload, mengikuti `prefers-color-scheme`           | `E2E-0014-AC2`, `VIS-0014-AC2`      | Terbukti (PASS) |
| [AC-3](test.md#ac-3) | Preferensi theme tersimpan di localStorage; store memisahkan sumber untuk penyambungan server nanti | `E2E-0014-AC3`                      | Terbukti (PASS) |
| [AC-4](test.md#ac-4) | Identitas Myadmin lewat mekanisme extension paket foundation, bukan CSS penimpa komponen            | `VIS-0014-AC4`, `MANUAL-0014-AC4`   | Terbukti (PASS) |
| [AC-5](test.md#ac-5) | Audit kapabilitas terdokumentasi: kebutuhan generik V1 dipetakan ke API paket, gap dicatat          | `SMOKE-0014-AC5`, `MANUAL-0014-AC5` | Terbukti (PASS) |
| [AC-6](test.md#ac-6) | Halaman demo internal dev only menampilkan komponen inti pada kedua mode                            | `VIS-0014-AC6`, `SMOKE-0014-AC6`    | Terbukti (PASS) |
| [AC-7](test.md#ac-7) | Boundary/lint menolak import design system lain dan komponen generik lokal di `shared/`             | `IT-0014-AC7`                       | Terbukti (PASS) |

## Follow-up

- [ ] Isi hasil audit kapabilitas (AC-5); setiap gap menjadi issue di repo paket @ojiepermana/angular.
- [ ] Setelah spec 0052, sambungkan store preferensi theme ke preferences server.
