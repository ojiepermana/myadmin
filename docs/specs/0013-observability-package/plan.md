# Plan 0013. Package observability

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
| Build plan          | 6 dari 6 langkah selesai                                                                                            |
| Acceptance criteria | 7 AC: 7 PASS, 0 PARTIAL, 0 BLOCKED                                                                                  |
| Verdict verifikasi  | Belum diverifikasi; verdict hanya boleh berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau. |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                                         | AC terkait | Status  |
| --- | ------------------------------------------------------------------------------------------------------- | ---------- | ------- |
| 1   | Bangun logger inti (level, JSON lines, modul, penulis stdout plus file dengan rotasi)                   | AC-1, AC-7 | Selesai |
| 2   | Bangun correlation (AsyncLocalStorage, generator UUIDv7) dan middleware transport yang memasangnya      | AC-2       | Selesai |
| 3   | Pasang redaction wajib pada fungsi tulis                                                                | AC-4       | Selesai |
| 4   | Bangun error handler transport tunggal yang memancarkan `ApiError` 500 generik plus log stack tersensor | AC-3, AC-5 | Selesai |
| 5   | Bangun metric counter dasar                                                                             | AC-6       | Selesai |
| 6   | Tambahkan aturan lint larangan console langsung; unit test seluruh AC                                   | -          | Selesai |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                             | Test / proof ID               | Status evidence |
| -------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------- | --------------- |
| [AC-1](test.md#ac-1) | Logger JSON lines ke stdout dengan field baku; level dari config `log.level`                    | `UT-0013-AC1`                 | Terbukti (PASS) |
| [AC-2](test.md#ac-2) | Correlation ID UUIDv7 per request dan WebSocket, mengalir otomatis lewat AsyncLocalStorage      | `IT-0013-AC2`                 | Terbukti (PASS) |
| [AC-3](test.md#ac-3) | Correlation ID yang sama dikirim ke klien pada setiap `ApiError`                                | `IT-0013-AC3`                 | Terbukti (PASS) |
| [AC-4](test.md#ac-4) | Seluruh keluaran logger melewati `Redaction.redactObject` sebelum ditulis                       | `SEC-0013-AC4`                | Terbukti (PASS) |
| [AC-5](test.md#ac-5) | Error handler tunggal: `ApiError` 500 generik plus correlation ID; stack hanya ke log tersensor | `IT-0013-AC5`, `SEC-0013-AC5` | Terbukti (PASS) |
| [AC-6](test.md#ac-6) | Metric counter dasar dalam memori, dibaca lewat modul, tanpa endpoint metrics publik V1         | `UT-0013-AC6`                 | Terbukti (PASS) |
| [AC-7](test.md#ac-7) | Log juga ke file dengan rotasi berdasar ukuran; kegagalan menulis file tidak mematikan proses   | `IT-0013-AC7`                 | Terbukti (PASS) |

## Follow-up

- [ ] Spec 0019 (audit) memakai correlation ID yang sama supaya audit dan log saling terhubung.
