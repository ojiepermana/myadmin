# Plan 0029. Realtime WebSocket dan klien SDK

**Date**: 2026-08-30
**Spec status**: mengikuti [index.md](index.md)
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Aturan dokumen

- Dokumen planning ini disusulkan setelah spec berjalan. Isinya diturunkan dari `index.md`, `test.md`, `verify.md`, dan `docs/specs/ac-evidence-matrix.md`; file ini bukan sumber kebenaran baru.
- Status pada tabel di bawah adalah snapshot per 2026-08-30. Bila build plan, acceptance criteria, atau evidence berubah, perbarui tabel ini bersama file sumbernya.
- Status implementasi tidak boleh dinaikkan tanpa evidence pada `verify.md` atau matrix acceptance.

## Ringkasan progres

| Dimensi             | Nilai                                                                                |
| ------------------- | ------------------------------------------------------------------------------------ |
| Status spec         | Accepted                                                                             |
| Build plan          | 5 langkah; status per langkah tidak dinyatakan pada index.md (daftar tanpa checkbox) |
| Acceptance criteria | 8 AC: 8 PASS, 0 PARTIAL, 0 BLOCKED                                                   |
| Verdict verifikasi  | Lulus; spec dapat ditandai penuh berdasarkan evidence yang tersedia.                 |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                                                                                                            | AC terkait             | Status           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ---------------- |
| 1   | Transport/websocket di server: upgrade dengan sesi, registry koneksi, parser protokol, subscribe dan unsubscribe dengan otorisasi channel, heartbeat, batas                | AC-1, AC-2, AC-3, AC-5 | Tidak dinyatakan |
| 2   | Sambungkan sumber event: JobManager ke `jobs.<id>`, registry status ke `connections.status`; siapkan hook `query.<executionId>` untuk spec 0033                            | AC-4                   | Tidak dinyatakan |
| 3   | Pastikan jalur kirim WS melewati redaction, plus test                                                                                                                      | AC-7                   | Tidak dinyatakan |
| 4   | RealtimeClient SDK (connect, backoff, resubscribe, tipe payload dari kontrak) dan integrasi `core/realtime` di web; status koneksi beralih ke push dengan fallback polling | AC-4, AC-6             | Tidak dinyatakan |
| 5   | Integration dan e2e test realtime                                                                                                                                          | AC-8                   | Tidak dinyatakan |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                      | Test / proof ID           | Status evidence |
| -------------------- | ---------------------------------------------------------------------------------------- | ------------------------- | --------------- |
| [AC-1](test.md#ac-1) | upgrade /ws hanya untuk sesi valid; sesi berakhir memutus dengan close code khusus       | IT-0029-AC1, SEC-0029-AC1 | Terbukti (PASS) |
| [AC-2](test.md#ac-2) | protokol subscribe, unsubscribe, event sesuai kontrak; pesan tak dikenal dijawab error   | IT-0029-AC2, CT-0029-AC2  | Terbukti (PASS) |
| [AC-3](test.md#ac-3) | otorisasi channel per pemilik resource tanpa membocorkan keberadaan resource             | IT-0029-AC3, SEC-0029-AC3 | Terbukti (PASS) |
| [AC-4](test.md#ac-4) | event job dan status koneksi diteruskan; UI beralih ke push dengan fallback polling      | IT-0029-AC4, E2E-0029-AC4 | Terbukti (PASS) |
| [AC-5](test.md#ac-5) | heartbeat 30 detik; batas 4 koneksi WS per user dan 200 subscription                     | UT-0029-AC5, IT-0029-AC5  | Terbukti (PASS) |
| [AC-6](test.md#ac-6) | RealtimeClient reconnect dengan backoff dan resubscribe otomatis, bertipe sesuai kontrak | UT-0029-AC6, IT-0029-AC6  | Terbukti (PASS) |
| [AC-7](test.md#ac-7) | payload event melewati redaction jalur keluar yang sama dengan HTTP                      | IT-0029-AC7, SEC-0029-AC7 | Terbukti (PASS) |
| [AC-8](test.md#ac-8) | integration test: progress berurutan, reconnect dan resubscribe, sesi dicabut menutup WS | IT-0029-AC8               | Terbukti (PASS) |

## Follow-up

- [ ] Spec 0033 memakai channel query untuk state eksekusi.
