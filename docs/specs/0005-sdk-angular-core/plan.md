# Plan 0005. SDK Angular core

**Date**: 2026-08-30
**Spec status**: mengikuti [index.md](index.md)
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Aturan dokumen

- Dokumen planning ini disusulkan setelah spec berjalan. Isinya diturunkan dari `index.md`, `test.md`, `verify.md`, dan `docs/specs/ac-evidence-matrix.md`; file ini bukan sumber kebenaran baru.
- Status pada tabel di bawah adalah snapshot per 2026-08-30. Bila build plan, acceptance criteria, atau evidence berubah, perbarui tabel ini bersama file sumbernya.
- Status implementasi tidak boleh dinaikkan tanpa evidence pada `verify.md` atau matrix acceptance.

## Ringkasan progres

| Dimensi             | Nilai                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| Status spec         | In Progress                                                                                       |
| Build plan          | Tidak dinyatakan (daftar 7 langkah tanpa checkbox pada index.md)                                  |
| Acceptance criteria | 8 AC: 8 PASS, 0 PARTIAL, 0 BLOCKED                                                                |
| Verdict verifikasi  | Belum diverifikasi; result per AC pada verify.md belum diisi dengan evidence yang dapat ditinjau. |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                                                                                         | AC terkait | Status           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------- |
| 1   | Bangun `transport/` yang mengadaptasi infrastruktur request @ojiepermana/angular, dengan fallback HttpClient terisolasi di satu file di dalam transport | AC-5       | Tidak dinyatakan |
| 2   | Bangun `SdkError` dan mapper dari `ApiError` plus kegagalan jaringan                                                                                    | AC-3       | Tidak dinyatakan |
| 3   | Bangun `provideMyadminSdk` dan config                                                                                                                   | AC-2       | Tidak dinyatakan |
| 4   | Bangun facade client `health`, `setup`, `auth` di atas tipe generated, plus event `sessionExpired`                                                      | AC-1, AC-4 | Tidak dinyatakan |
| 5   | Buat kerangka `realtime/` dengan antarmuka `RealtimeClient`                                                                                             | AC-7       | Tidak dinyatakan |
| 6   | Tambahkan aturan boundary untuk `apps/web` (larangan HttpClient, fetch, dan string `/api`)                                                              | AC-6       | Tidak dinyatakan |
| 7   | Tulis unit test SDK                                                                                                                                     | AC-8       | Tidak dinyatakan |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                                            | Test / proof ID | Status evidence |
| -------------------- | -------------------------------------------------------------------------------------------------------------- | --------------- | --------------- |
| [AC-1](test.md#ac-1) | Client bertipe per domain kontrak dengan tipe dari generated, tanpa tipe tulisan ulang manual                  | `CT-0005-AC1`   | Terbukti (PASS) |
| [AC-2](test.md#ac-2) | `provideMyadminSdk(config)` mendaftarkan SDK lewat DI Angular, base URL relatif default `/api/v1`              | `UT-0005-AC2`   | Terbukti (PASS) |
| [AC-3](test.md#ac-3) | Kegagalan HTTP dinormalisasi jadi `SdkError`; kegagalan jaringan tanpa response berkode `NETWORK_ERROR`        | `UT-0005-AC3`   | Terbukti (PASS) |
| [AC-4](test.md#ac-4) | Response 401 non publik memicu event `sessionExpired`; SDK tidak melakukan redirect                            | `UT-0005-AC4`   | Terbukti (PASS) |
| [AC-5](test.md#ac-5) | Transport memakai infrastruktur @ojiepermana/angular; tidak ada `fetch` atau `HttpClient` di luar `transport/` | `IT-0005-AC5`   | Terbukti (PASS) |
| [AC-6](test.md#ac-6) | Boundary check menolak `HttpClient`, `fetch`, dan literal `/api` di `apps/web` di luar SDK                     | `IT-0005-AC6`   | Terbukti (PASS) |
| [AC-7](test.md#ac-7) | Kerangka `realtime/` dengan antarmuka publik `RealtimeClient` tanpa implementasi dan detail transport          | `CT-0005-AC7`   | Terbukti (PASS) |
| [AC-8](test.md#ac-8) | Unit test SDK menutup pemetaan error, konfigurasi provider, dan satu panggilan happy path                      | `UT-0005-AC8`   | Terbukti (PASS) |

## Follow-up

- [ ] Setelah spec 0014, audit transport: pastikan kapabilitas infrastruktur @ojiepermana/angular yang tersedia benar benar dipakai dan fallback dilepas bila tidak perlu.
