# Plan 0009. Internal repositories

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
| Acceptance criteria | 8 AC: 8 PASS, 0 PARTIAL, 0 BLOCKED                                                                                  |
| Verdict verifikasi  | Belum diverifikasi; verdict hanya boleh berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau. |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                                                           | AC terkait       | Status  |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------- |
| 1   | Definisikan entity, value object, dan port di `internal-domain` (termasuk tipe `EncryptedCredential` terpisah)            | AC-1, AC-2       | Selesai |
| 2   | Implementasikan repository SQLite plus mapper untuk users, sessions, server_groups, connections, connection_credentials   | AC-3             | Selesai |
| 3   | Implementasikan repository workspaces, query_history (dengan retention), saved_queries, settings, preferences, audit_logs | AC-3, AC-5, AC-6 | Selesai |
| 4   | Bangun unit of work di atas helper transaksi spec 0008                                                                    | AC-4             | Selesai |
| 5   | Tulis fake in memory di `testkit/fakes/`                                                                                  | AC-8             | Selesai |
| 6   | Integration test lengkap di `tests/integration/internal-sqlite/`                                                          | AC-7             | Selesai |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                                                | Test / proof ID                  | Status evidence |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------- | --------------- |
| [AC-1](test.md#ac-1) | Entity dan value object di `internal-domain` tanpa import SQLite atau driver apa pun                               | `IT-0009-AC1`                    | Terbukti (PASS) |
| [AC-2](test.md#ac-2) | Port repository per agregat dengan operasi minimum V1 untuk sebelas agregat                                        | `CT-0009-AC2`                    | Terbukti (PASS) |
| [AC-3](test.md#ac-3) | Implementasi SQLite semua port dengan SQL parameterized dan mapper eksplisit                                       | `IT-0009-AC3`, `SEC-0009-AC3`    | Terbukti (PASS) |
| [AC-4](test.md#ac-4) | Unit of work atomik; kegagalan di tengah membatalkan seluruh transaksi                                             | `IT-0009-AC4`                    | Terbukti (PASS) |
| [AC-5](test.md#ac-5) | `enforceRetention` memangkas entri terlama; batas default 1000 dibaca dari settings                                | `IT-0009-AC5`                    | Terbukti (PASS) |
| [AC-6](test.md#ac-6) | `AuditRepository` append only di tingkat tipe, tanpa update dan delete                                             | `CT-0009-AC6`, `MANUAL-0009-AC6` | Terbukti (PASS) |
| [AC-7](test.md#ac-7) | Integration test round trip, constraint unik, cascade delete credential, pagination history tanpa server eksternal | `IT-0009-AC7`                    | Terbukti (PASS) |
| [AC-8](test.md#ac-8) | Fake in memory untuk setiap port tersedia di `packages/testkit`                                                    | `CT-0009-AC8`                    | Terbukti (PASS) |

## Follow-up

- [ ] Saat use case pertama dibangun (spec 0016), nilai default settings (`history.maxEntriesPerUser`) di seed lewat migrasi atau boot.
