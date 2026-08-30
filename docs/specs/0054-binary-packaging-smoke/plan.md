# Plan 0054. Packaging binary dan smoke test

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
| Build plan          | 5 dari 5 langkah selesai                                                                                      |
| Acceptance criteria | 7 AC: 3 PASS, 4 PARTIAL, 0 BLOCKED                                                                            |
| Verdict verifikasi  | Belum diverifikasi; verdict hanya berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau. |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                                                          | AC terkait       | Status  |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ---------------- | ------- |
| 1   | Tulis `build-web.ts` dan `embed-web-assets.ts` (manifest bertipe, MIME, hash) plus jalur penyajian release               | AC-1             | Selesai |
| 2   | Tulis `compile-binary.ts` lima target dengan injeksi versi                                                               | AC-2             | Selesai |
| 3   | Tulis `checksums.ts` dan pin toolchain                                                                                   | AC-3             | Selesai |
| 4   | Harness smoke (proses nyata, data dir sementara, urutan Definition of Done butir 4, database test untuk langkah koneksi) | AC-4             | Selesai |
| 5   | Rakit `release.yml` dengan gerbang dan matriks runner, laporan ukuran, README rilis                                      | AC-5, AC-6, AC-7 | Selesai |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                               | Test / proof ID                                                 | Status evidence    |
| -------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------ |
| [AC-1](test.md#ac-1) | Build production Angular ke `dist/web/`; manifest aset embed dipakai server pada mode release     | `UT-0054-AC1`, `IT-0054-AC1`, `SMOKE-0054-AC1`                  | Terbukti (PASS)    |
| [AC-2](test.md#ac-2) | Bun Compile kelima target dengan versi dan commit hash di-inject saat build                       | `IT-0054-AC2`, `SMOKE-0054-AC2`                                 | Terbukti (PASS)    |
| [AC-3](test.md#ac-3) | SHA-256 per artefak dalam satu file checksum; input build dipin (versi Bun, lockfile)             | `UT-0054-AC3`, `IT-0054-AC3`, `SEC-0054-AC3`, `SMOKE-0054-AC3`  | Terbukti (PASS)    |
| [AC-4](test.md#ac-4) | Harness smoke menjalankan binary nyata: health, SPA, setup, login, koneksi, shutdown rapi, doctor | `IT-0054-AC4`, `E2E-0054-AC4`, `SEC-0054-AC4`, `SMOKE-0054-AC4` | Sebagian (PARTIAL) |
| [AC-5](test.md#ac-5) | `release.yml` pada tag dengan prasyarat hijau, smoke per target runner tersedia, artefak diunggah | `IT-0054-AC5`, `SMOKE-0054-AC5`, `MANUAL-0054-AC5`              | Sebagian (PARTIAL) |
| [AC-6](test.md#ac-6) | Laporan ukuran binary per target; kegagalan embed terdeteksi smoke test                           | `IT-0054-AC6`, `PERF-0054-AC6`, `SMOKE-0054-AC6`                | Sebagian (PARTIAL) |
| [AC-7](test.md#ac-7) | README rilis berisi cara menjalankan tiap platform dihasilkan bersama artefak                     | `IT-0054-AC7`, `SMOKE-0054-AC7`, `MANUAL-0054-AC7`              | Sebagian (PARTIAL) |

## Follow-up

- [x] Spec 0055: signing, installer, service file, dan dokumentasi operator di atas artefak ini.
