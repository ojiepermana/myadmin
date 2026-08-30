# Plan 0046. Security database target: privilege (grant dan revoke)

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
| Build plan          | 5 dari 5 langkah selesai                                                                                            |
| Acceptance criteria | 7 AC: 7 PASS, 0 PARTIAL, 0 BLOCKED                                                                                  |
| Verdict verifikasi  | Belum diverifikasi; verdict hanya boleh berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau. |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                                                                        | AC terkait       | Status  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------- |
| 1   | Perluas kontrak (GrantEntry, katalog, change set, preview/apply), regenerasi, contract test.                                           | -                | Selesai |
| 2   | Implementasikan introspeksi grant efektif, katalog privilege, dan kompilator GRANT/REVOKE di kedua provider plus test integrasi nyata. | AC-1, AC-2, AC-4 | Selesai |
| 3   | Endpoint server bergerbang capability, konfirmasi revoke, audit.                                                                       | AC-4, AC-5, AC-6 | Selesai |
| 4   | UI matriks privilege (principal, scope picker, centang per privilege, pratinjau, konfirmasi revoke).                                   | AC-3             | Selesai |
| 5   | E2e efek nyata dua engine.                                                                                                             | AC-7             | Selesai |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                                             | Test / proof ID                                                             | Status evidence |
| -------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------- |
| [AC-1](test.md#ac-1) | `GET /security/principals/:name/grants` mengembalikan grant efektif engine netral (scope, privilege, grantable) | `UT-0046-AC1`, `IT-0046-AC1`, `CT-0046-AC1`                                 | Terbukti (PASS) |
| [AC-2](test.md#ac-2) | `GET /security/privileges/catalog` mendeklarasikan privilege per level per engine; UI tidak menghardcode        | `UT-0046-AC2`, `IT-0046-AC2`, `CT-0046-AC2`, `E2E-0046-AC2`                 | Terbukti (PASS) |
| [AC-3](test.md#ac-3) | UI matriks grant: change set → pratinjau GRANT/REVOKE → terapkan; revoke pakai konfirmasi destructive           | `UT-0046-AC3`, `IT-0046-AC3`, `CT-0046-AC3`, `E2E-0046-AC3`, `SEC-0046-AC3` | Terbukti (PASS) |
| [AC-4](test.md#ac-4) | `POST /security/grants/apply` menjalankan change set; `permission_denied` jelas; hasil per statement            | `IT-0046-AC4`, `CT-0046-AC4`                                                | Terbukti (PASS) |
| [AC-5](test.md#ac-5) | Audit `security.privilege_granted` dan `security.privilege_revoked` sebelum response sukses                     | `IT-0046-AC5`, `SEC-0046-AC5`                                               | Terbukti (PASS) |
| [AC-6](test.md#ac-6) | Fitur digerbangi `capabilities.grants`; WITH GRANT OPTION dan column privileges tidak ada di V1                 | `UT-0046-AC6`, `IT-0046-AC6`, `CT-0046-AC6`, `E2E-0046-AC6`                 | Terbukti (PASS) |
| [AC-7](test.md#ac-7) | E2e kedua engine: grant SELECT terbukti efeknya, revoke kembali, audit tercatat                                 | `IT-0046-AC7`, `E2E-0046-AC7`, `SEC-0046-AC7`                               | Terbukti (PASS) |

## Follow-up

- [ ] V2: object privileges lanjutan sesuai feature.md.
