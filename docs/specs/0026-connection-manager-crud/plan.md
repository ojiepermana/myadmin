# Plan 0026. Connection manager: CRUD dan vault

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
| Build plan          | 6 langkah; status per langkah tidak dinyatakan pada index.md (daftar tanpa checkbox) |
| Acceptance criteria | 10 AC: 10 PASS, 0 PARTIAL, 0 BLOCKED                                                 |
| Verdict verifikasi  | Lulus; spec dapat ditandai penuh berdasarkan evidence yang tersedia.                 |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                                           | AC terkait                                     | Status           |
| --- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------- |
| 1   | Tambah operasi connections dan server-groups ke kontrak, regenerasi tipe dan SDK, daftar ke contract test | -                                              | Tidak dinyatakan |
| 2   | Use case connections di modul server (validasi, vault, policies otorisasi, audit) dengan unit test fake   | AC-1, AC-2, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9 | Tidak dinyatakan |
| 3   | Endpoint test dengan jalur transient dan by id plus rate limit                                            | AC-3                                           | Tidak dinyatakan |
| 4   | UI feature connections (daftar per group, form, test inline, duplicate, delete konfirmasi, group manager) | AC-7, AC-10                                    | Tidak dinyatakan |
| 5   | Test keamanan: tidak ada secret transient di log atau audit, otorisasi lintas user                        | AC-2, AC-3, AC-8                               | Tidak dinyatakan |
| 6   | E2e alur lengkap kedua engine terhadap server test                                                        | AC-10                                          | Tidak dinyatakan |

## Rencana acceptance dan status evidence

| AC                     | Ringkasan kebutuhan                                                                       | Test / proof ID              | Status evidence |
| ---------------------- | ----------------------------------------------------------------------------------------- | ---------------------------- | --------------- |
| [AC-1](test.md#ac-1)   | POST /connections menerima descriptor lengkap plus secret opsional dengan validasi server | IT-0026-AC1, CT-0026-AC1     | Terbukti (PASS) |
| [AC-2](test.md#ac-2)   | secret dienkripsi vault bila saveSecret; secret tidak pernah muncul di response           | IT-0026-AC2, SEC-0026-AC2    | Terbukti (PASS) |
| [AC-3](test.md#ac-3)   | POST /connections/test menguji tanpa menyimpan; secret transient tidak dicatat            | IT-0026-AC3, SEC-0026-AC3    | Terbukti (PASS) |
| [AC-4](test.md#ac-4)   | PATCH mengubah descriptor dan secret; GET daftar hanya descriptor tanpa material rahasia  | IT-0026-AC4, SEC-0026-AC4    | Terbukti (PASS) |
| [AC-5](test.md#ac-5)   | DELETE dengan konfirmasi eksplisit, cascade credential, memutus sesi aktif, diaudit       | IT-0026-AC5, E2E-0026-AC5    | Terbukti (PASS) |
| [AC-6](test.md#ac-6)   | duplicate menyalin descriptor; credential tersalin hanya oleh pemilik yang memilih        | IT-0026-AC6, SEC-0026-AC6    | Terbukti (PASS) |
| [AC-7](test.md#ac-7)   | server group CRUD; menghapus group tidak menghapus koneksinya                             | IT-0026-AC7, E2E-0026-AC7    | Terbukti (PASS) |
| [AC-8](test.md#ac-8)   | pemilik penuh; Admin kelola descriptor tanpa akses credential milik orang lain            | SEC-0026-AC8                 | Terbukti (PASS) |
| [AC-9](test.md#ac-9)   | mutasi koneksi menghasilkan audit event tanpa secret                                      | IT-0026-AC9, SEC-0026-AC9    | Terbukti (PASS) |
| [AC-10](test.md#ac-10) | UI connections lengkap dengan form, test inline, keyboard; e2e alur penuh                 | E2E-0026-AC10, VIS-0026-AC10 | Terbukti (PASS) |

## Follow-up

- [ ] Spec 0027 memakai registry sesi aktif untuk memutus sesi saat delete (AC-5) secara penuh.
