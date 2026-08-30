# Plan 0003. Struktur kontrak OpenAPI v1 dan error model

**Date**: 2026-08-30
**Spec status**: mengikuti [index.md](index.md)
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Aturan dokumen

- Dokumen planning ini disusulkan setelah spec berjalan. Isinya diturunkan dari `index.md`, `test.md`, `verify.md`, dan `docs/specs/ac-evidence-matrix.md`; file ini bukan sumber kebenaran baru.
- Status pada tabel di bawah adalah snapshot per 2026-08-30. Bila build plan, acceptance criteria, atau evidence berubah, perbarui tabel ini bersama file sumbernya.
- Status implementasi tidak boleh dinaikkan tanpa evidence pada `verify.md` atau matrix acceptance.

## Ringkasan progres

| Dimensi             | Nilai                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| Status spec         | Accepted                                                                                                    |
| Build plan          | 4 dari 4 langkah selesai                                                                                    |
| Acceptance criteria | 8 AC: 8 PASS, 0 PARTIAL, 0 BLOCKED                                                                          |
| Verdict verifikasi  | Terverifikasi untuk seluruh acceptance criteria pada evidence lokal dan hosted Contract run yang ditautkan. |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                                                                                                                             | AC terkait             | Status  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------- |
| 1   | Buat kerangka `openapi/v1/openapi.yaml` (info, servers `/api/v1`, security default `sessionCookie`) plus `components/` berisi `ApiError`, pagination, `Capability`, `security-schemes.yaml` | AC-3, AC-4, AC-5, AC-6 | Selesai |
| 2   | Definisikan enam path awal di `paths/auth.yaml` dan file terkait                                                                                                                            | AC-8                   | Selesai |
| 3   | Definisikan `events/websocket-protocol.yaml` dan `events/websocket-events.yaml`                                                                                                             | AC-7                   | Selesai |
| 4   | Pasang Redocly CLI, konfigurasi aturan lint (termasuk aturan custom "semua error memakai ApiError"), tulis `scripts/validate-contract.ts` dan versi package, sambungkan ke CI               | AC-1, AC-2             | Selesai |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                                         | Test / proof ID                 | Status evidence |
| -------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------- | --------------- |
| [AC-1](test.md#ac-1) | `openapi.yaml` valid OpenAPI 3.1, terpecah ke `paths/` dan `components/`, dapat dibundel                    | `CT-0003-AC1`                   | Terbukti (PASS) |
| [AC-2](test.md#ac-2) | `scripts/validate-contract` gagal bila kontrak tidak valid atau melanggar lint; berjalan di CI              | `CT-0003-AC2`, `SMOKE-0003-AC2` | Terbukti (PASS) |
| [AC-3](test.md#ac-3) | Schema `ApiError` tunggal dengan `code`, `message`, `correlationId`, `details` dipakai semua response error | `CT-0003-AC3`                   | Terbukti (PASS) |
| [AC-4](test.md#ac-4) | Security scheme `sessionCookie` default semua operasi; hanya operasi publik yang bebas                      | `CT-0003-AC4`                   | Terbukti (PASS) |
| [AC-5](test.md#ac-5) | Komponen pagination baku: parameter `page`, `pageSize`, envelope `items`, `page`, `pageSize`, `total`       | `CT-0003-AC5`                   | Terbukti (PASS) |
| [AC-6](test.md#ac-6) | Schema `Capability`: `engine`, `version`, `capabilities` peta boolean, plus `reasons` opsional              | `CT-0003-AC6`                   | Terbukti (PASS) |
| [AC-7](test.md#ac-7) | Envelope WebSocket `{ type, channel, payload, correlationId }` dan event awal terdefinisi                   | `CT-0003-AC7`                   | Terbukti (PASS) |
| [AC-8](test.md#ac-8) | Enam path awal (health, setup, auth) lengkap dengan request, response, dan error                            | `CT-0003-AC8`                   | Terbukti (PASS) |

## Follow-up

- [ ] Saat fitur bertambah, jaga file `paths/` per domain (auth, connections, explorer, query, operations) sesuai struktur.md.
