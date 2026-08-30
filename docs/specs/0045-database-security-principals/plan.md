# Plan 0045. Security database target: principal

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
| Acceptance criteria | 8 AC: 8 PASS, 0 PARTIAL, 0 BLOCKED                                                                                  |
| Verdict verifikasi  | Belum diverifikasi; verdict hanya boleh berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau. |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                                                                                         | AC terkait                   | Status  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------- |
| 1   | Perluas kontrak model principal dan deklarasi form; regenerasi; contract test.                                                                          | -                            | Selesai |
| 2   | Implementasikan `SecurityPort` bagian principal di kedua provider (list, describe form, create, alter, reset, drop; kompilasi DDL) plus test integrasi. | AC-1, AC-2, AC-3, AC-4, AC-5 | Selesai |
| 3   | Endpoint server bergerbang capability plus audit.                                                                                                       | AC-6, AC-7                   | Selesai |
| 4   | UI feature security: daftar principal, form dinamis, dialog reset, konfirmasi drop.                                                                     | AC-2, AC-3, AC-4, AC-5       | Selesai |
| 5   | E2e dua engine dan test kebersihan rahasia.                                                                                                             | AC-8                         | Selesai |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                                                      | Test / proof ID                                                             | Status evidence |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | --------------- |
| [AC-1](test.md#ac-1) | `GET /security/principals` mengembalikan daftar principal paginated engine netral dengan atribut deklaratif              | `UT-0045-AC1`, `IT-0045-AC1`, `CT-0045-AC1`                                 | Terbukti (PASS) |
| [AC-2](test.md#ac-2) | Create principal: form dinamis dari deklarasi provider, kompilasi DDL dengan pratinjau                                   | `UT-0045-AC2`, `IT-0045-AC2`, `CT-0045-AC2`, `E2E-0045-AC2`                 | Terbukti (PASS) |
| [AC-3](test.md#ac-3) | Edit principal lewat change set dengan pratinjau; rename tidak ada di V1                                                 | `UT-0045-AC3`, `IT-0045-AC3`, `CT-0045-AC3`, `E2E-0045-AC3`                 | Terbukti (PASS) |
| [AC-4](test.md#ac-4) | Reset password: dialog khusus, password tidak masuk log/audit/history; audit `security.credential_reset`                 | `IT-0045-AC4`, `CT-0045-AC4`, `E2E-0045-AC4`, `SEC-0045-AC4`                | Terbukti (PASS) |
| [AC-5](test.md#ac-5) | Drop principal: konfirmasi ketik nama; kegagalan kepemilikan diteruskan jelas; audit `security.principal_dropped`        | `IT-0045-AC5`, `CT-0045-AC5`, `E2E-0045-AC5`, `SEC-0045-AC5`                | Terbukti (PASS) |
| [AC-6](test.md#ac-6) | Fitur digerbangi `capabilities.principals`; kegagalan hak tampil sebagai `permission_denied` jelas                       | `UT-0045-AC6`, `IT-0045-AC6`, `CT-0045-AC6`, `E2E-0045-AC6`, `SEC-0045-AC6` | Terbukti (PASS) |
| [AC-7](test.md#ac-7) | Semua mutasi principal diaudit sebelum sukses; browse tidak diaudit                                                      | `IT-0045-AC7`, `SEC-0045-AC7`                                               | Terbukti (PASS) |
| [AC-8](test.md#ac-8) | E2e kedua engine: list, create, edit, reset password (login dengan password baru), drop; tanpa hash/password di response | `IT-0045-AC8`, `E2E-0045-AC8`, `SEC-0045-AC8`                               | Terbukti (PASS) |

## Follow-up

- [ ] Tidak ada.
