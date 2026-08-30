# Plan 0051. Monitoring status dasar

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
| Build plan          | 3 dari 3 langkah selesai                                                                                      |
| Acceptance criteria | 7 AC: 7 PASS, 0 PARTIAL, 0 BLOCKED                                                                            |
| Verdict verifikasi  | Belum diverifikasi; verdict hanya berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau. |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                                         | AC terkait       | Status  |
| --- | ------------------------------------------------------------------------------------------------------- | ---------------- | ------- |
| 1   | Implementasi `MonitoringPort.statusInfo` ringan di kedua provider plus endpoint, kontrak, contract test | AC-2             | Selesai |
| 2   | UI halaman monitoring (kartu, grafik latency kecil, uji sekarang, pernyataan batas V1)                  | AC-1, AC-3, AC-6 | Selesai |
| 3   | E2e reaktivitas dan kebersihan network membuktikan tidak ada polling berat; review data sensitif        | AC-4, AC-7, AC-5 | Selesai |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                               | Test / proof ID                                              | Status evidence |
| -------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------- |
| [AC-1](test.md#ac-1) | Kartu per koneksi: label, engine dan versi, status push, latency dan riwayat sesi, error terakhir | `UT-0051-AC1`, `IT-0051-AC1`, `E2E-0051-AC1`, `VIS-0051-AC1` | Terbukti (PASS) |
| [AC-2](test.md#ac-2) | `GET /connections/:id/status-info` info ringan dari `MonitoringPort.statusInfo` tanpa query berat | `IT-0051-AC2`, `CT-0051-AC2`, `PERF-0051-AC2`                | Terbukti (PASS) |
| [AC-3](test.md#ac-3) | Tombol uji sekarang memperbarui latency (rate limited); durasi operasi terakhir tampil            | `UT-0051-AC3`, `IT-0051-AC3`, `E2E-0051-AC3`, `SEC-0051-AC3` | Terbukti (PASS) |
| [AC-4](test.md#ac-4) | Tanpa permintaan berkala berat: pembaruan lewat push status, latency hanya event driven           | `E2E-0051-AC4`, `PERF-0051-AC4`                              | Terbukti (PASS) |
| [AC-5](test.md#ac-5) | Tanpa data sensitif: tanpa connection string, credential, atau isi query di halaman               | `IT-0051-AC5`, `E2E-0051-AC5`, `SEC-0051-AC5`                | Terbukti (PASS) |
| [AC-6](test.md#ac-6) | Halaman menyatakan batas V1 dengan kalimat kecil supaya ekspektasi jelas                          | `E2E-0051-AC6`                                               | Terbukti (PASS) |
| [AC-7](test.md#ac-7) | E2e: kartu mencerminkan connect/disconnect/error langsung; tanpa request berkala selain push WS   | `IT-0051-AC7`, `E2E-0051-AC7`, `PERF-0051-AC7`               | Terbukti (PASS) |

## Follow-up

- [ ] Perbarui struktur.md tabel fitur: deskripsi monitoring V1 dikoreksi menjadi status dasar (kontradiksi yang diputuskan 2026-08-28).
