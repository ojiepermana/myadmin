# Plan 0033. Query editor: tab dan eksekusi

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
| Build plan          | 7 dari 7 langkah selesai                                                                                      |
| Acceptance criteria | 9 AC: 9 PASS, 0 PARTIAL, 0 BLOCKED                                                                            |
| Verdict verifikasi  | Belum diverifikasi; verdict hanya berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau. |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                                                          | AC terkait       | Status  |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ---------------- | ------- |
| 1   | Definisikan operasi eksekusi plus bentuk hasil sel berlabel tipe di kontrak, regenerasi, contract test                   | AC-4, AC-6, AC-8 | Selesai |
| 2   | Bangun pemecah statement di masing masing provider (`query/` package provider) dengan test dialek menyeluruh             | AC-4             | Selesai |
| 3   | Bangun use case eksekusi di modul server query: sesi per tab, eksekusi berurutan, state, event WS, history               | AC-4, AC-5, AC-7 | Selesai |
| 4   | Bangun editor CodeMirror (dialek, keymap, pencarian) di feature query-editor plus tab context header dan pemilih konteks | AC-1, AC-2       | Selesai |
| 5   | Bangun autocomplete berbasis cache metadata malas                                                                        | AC-3             | Selesai |
| 6   | Render hasil sementara (tabel sederhana; grid penuh di spec 0034), pemetaan posisi error ke editor, indikator transaksi  | AC-6             | Selesai |
| 7   | E2e dua engine (fixture PostgreSQL dan MySQL disposable telah dijalankan)                                                | AC-9             | Selesai |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                                                   | Test / proof ID                         | Status evidence |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | --------------- |
| [AC-1](test.md#ac-1) | Tab query menyimpan konteks dan state sendiri; konteks tampil di header dan bisa diganti                              | UT-0033-AC1, E2E-0033-AC1               | Terbukti (PASS) |
| [AC-2](test.md#ac-2) | Editor CodeMirror 6 dengan dialek per engine, highlighting, pencarian, dan keymap eksekusi                            | UT-0033-AC2, E2E-0033-AC2, VIS-0033-AC2 | Terbukti (PASS) |
| [AC-3](test.md#ac-3) | Autocomplete dari cache metadata dimuat malas, tanpa unduhan katalog penuh                                            | IT-0033-AC3, E2E-0033-AC3               | Terbukti (PASS) |
| [AC-4](test.md#ac-4) | `POST /query/executions` asinkron dengan executionId; pemecahan multi statement oleh provider; state lewat channel WS | UT-0033-AC4, IT-0033-AC4, CT-0033-AC4   | Terbukti (PASS) |
| [AC-5](test.md#ac-5) | Sesi provider khusus per tab; transaksi manual bertahan antar eksekusi dengan indikator                               | IT-0033-AC5                             | Terbukti (PASS) |
| [AC-6](test.md#ac-6) | Hasil per statement dengan batas baris, affected rows, durasi, dan posisi error ke editor                             | IT-0033-AC6, CT-0033-AC6                | Terbukti (PASS) |
| [AC-7](test.md#ac-7) | Setiap eksekusi tercatat ke query history utuh, termasuk status failed                                                | IT-0033-AC7                             | Terbukti (PASS) |
| [AC-8](test.md#ac-8) | Serialisasi nilai aman tanpa kehilangan presisi; NULL berbeda dari string kosong                                      | UT-0033-AC8, CT-0033-AC8                | Terbukti (PASS) |
| [AC-9](test.md#ac-9) | E2e kedua engine: tab, autocomplete, seleksi, error berposisi, transaksi, history                                     | E2E-0033-AC9                            | Terbukti (PASS) |

## Follow-up

- [x] Spec 0034 mengganti render hasil sementara dengan result grid foundation.
- [x] Spec 0035 menambah cancel dan EXPLAIN pada model eksekusi ini.
