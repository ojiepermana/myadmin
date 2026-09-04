# Plan 0057. Remediasi audit gelombang 1

**Date**: 2026-09-04
**Spec status**: mengikuti [index.md](index.md)
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md) | [Rationale](rationale.md)

## Aturan dokumen

- Dokumen ini diturunkan dari `index.md`, `test.md`, dan `verify.md`; bukan sumber kebenaran baru.
- Status pada tabel adalah snapshot. Bila build plan, acceptance criteria, atau evidence berubah, perbarui tabel ini bersama file sumbernya.

## Ringkasan progres

| Dimensi             | Nilai                                                |
| ------------------- | ---------------------------------------------------- |
| Status spec         | In Progress                                          |
| Build plan          | 15 dari 16 langkah selesai                           |
| Acceptance criteria | 16 AC: 9 PASS, 6 PARTIAL, 1 BLOCKED                  |
| Verdict verifikasi  | Belum diverifikasi; `/check verify` belum dijalankan |

## Rencana build dan status implementasi

| #   | Langkah rencana                                          | AC terkait | Status                   |
| --- | -------------------------------------------------------- | ---------- | ------------------------ |
| 1   | `ESCAPE` PostgreSQL dan MySQL                            | AC-1       | Selesai                  |
| 2   | Koersi nilai lossless dan identitas baris                | AC-2       | Selesai                  |
| 3   | Klausa autentikasi MySQL tunggal                         | AC-3       | Selesai                  |
| 4   | Tabel error berbasis data                                | AC-4       | Selesai                  |
| 5   | `RestoreUploadStore` streaming dengan expiry dan cleanup | AC-5       | Selesai                  |
| 6   | Allowlist environment subprocess                         | AC-6       | Selesai                  |
| 7   | Validasi nama database backup dan pemisah `--`           | AC-7       | Selesai                  |
| 8   | Modul `apps/server/src/http/` dan migrasi route          | AC-8       | Selesai                  |
| 9   | Channel `notice` pada tiga halaman                       | AC-9       | Selesai                  |
| 10  | `provideZonelessChangeDetection()` dan pembersihan debug | AC-10      | Selesai                  |
| 11  | Tiering script test dan pemindahan test smoke            | AC-11      | Selesai                  |
| 12  | Generator matrix berbasis hasil test dan mode `--check`  | AC-12      | Selesai                  |
| 13  | `concurrency` workflow dan determinisme realtime         | AC-13      | Selesai                  |
| 14  | `strictTemplates` dan `angular-eslint`                   | AC-14      | Selesai                  |
| 15  | Analisis bundle dan budget                               | AC-15      | Selesai                  |
| 16  | Proteksi branch `main` dengan check wajib                | AC-16      | Belum; butuh akses admin |
