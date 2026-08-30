# Plan 0019. Subsistem audit append only

**Date**: 2026-08-30
**Spec status**: mengikuti [index.md](index.md)
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Aturan dokumen

- Dokumen planning ini disusulkan setelah spec berjalan. Isinya diturunkan dari `index.md`, `test.md`, `verify.md`, dan `docs/specs/ac-evidence-matrix.md`; file ini bukan sumber kebenaran baru.
- Status pada tabel di bawah adalah snapshot per 2026-08-30. Bila build plan, acceptance criteria, atau evidence berubah, perbarui tabel ini bersama file sumbernya.
- Status implementasi tidak boleh dinaikkan tanpa evidence pada `verify.md` atau matrix acceptance.

## Ringkasan progres

| Dimensi             | Nilai                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Status spec         | In Progress                                                                                                                                      |
| Build plan          | 6 dari 6 langkah selesai                                                                                                                         |
| Acceptance criteria | 8 AC: 8 PASS, 0 PARTIAL, 0 BLOCKED                                                                                                               |
| Verdict verifikasi  | Belum diverifikasi; bukti lokal per AC tercatat, namun verdict hanya berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau. |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                                                         | AC terkait       | Status  |
| --- | ----------------------------------------------------------------------------------------------------------------------- | ---------------- | ------- |
| 1   | Definisikan taksonomi event V1 lengkap (daftar FR-AUD-01 plus event auth spec 0016 sampai 0018) dengan flag wajib audit | AC-1             | Selesai |
| 2   | Bangun `AuditWriter` di atas `AuditRepository` dengan redaction wajib dan correlation otomatis                          | AC-2, AC-4, AC-5 | Selesai |
| 3   | Bangun `withAudit` dengan semantik urutan dan kegagalan                                                                 | AC-3             | Selesai |
| 4   | Migrasikan penulisan audit sementara dari spec 0016 sampai 0018 ke jalur ini                                            | AC-1, AC-6       | Selesai |
| 5   | Doctor check informasional ukuran audit                                                                                 | AC-8             | Selesai |
| 6   | Unit test lengkap di `packages/audit/test/` plus test redaction di `tests/security/redaction/`                          | AC-7             | Selesai |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                                               | Test / proof ID              | Status evidence |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------- | --------------- |
| [AC-1](test.md#ac-1) | Taksonomi event `domain.aksi` sebagai daftar tertutup dalam satu modul `events/`                                  | UT-0019-AC1                  | Terbukti (PASS) |
| [AC-2](test.md#ac-2) | `AuditWriter.record` menerima bentuk terstruktur; seluruh payload melewati `Redaction.redactObject` sebelum tulis | IT-0019-AC2, SEC-0019-AC2    | Terbukti (PASS) |
| [AC-3](test.md#ac-3) | `withAudit` menulis event sebelum mengembalikan; kegagalan audit menggagalkan aksi wajib audit                    | UT-0019-AC3                  | Terbukti (PASS) |
| [AC-4](test.md#ac-4) | Correlation ID request otomatis terlampir pada setiap event                                                       | IT-0019-AC4                  | Terbukti (PASS) |
| [AC-5](test.md#ac-5) | Tidak ada API update atau delete pada audit; dilindungi review dan tanpa jalur di kode                            | CT-0019-AC5, MANUAL-0019-AC5 | Terbukti (PASS) |
| [AC-6](test.md#ac-6) | Kegagalan login mencatat `usernameAttempted` yang lolos redaction dan dibatasi panjang; tanpa password            | SEC-0019-AC6                 | Terbukti (PASS) |
| [AC-7](test.md#ac-7) | Unit test membuktikan urutan sukses, kegagalan audit, redaction details, dan penolakan action liar                | UT-0019-AC7                  | Terbukti (PASS) |
| [AC-8](test.md#ac-8) | Retensi V1: audit tidak dipangkas otomatis; ukuran dipantau doctor check informasional                            | IT-0019-AC8                  | Terbukti (PASS) |

## Follow-up

- [ ] V2: kebijakan retensi audit (arsip atau pangkas) setelah ada data pemakaian nyata.
