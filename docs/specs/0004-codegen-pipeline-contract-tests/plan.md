# Plan 0004. Pipeline codegen dan contract test

**Date**: 2026-08-30
**Spec status**: mengikuti [index.md](index.md)
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Aturan dokumen

- Dokumen planning ini disusulkan setelah spec berjalan. Isinya diturunkan dari `index.md`, `test.md`, `verify.md`, dan `docs/specs/ac-evidence-matrix.md`; file ini bukan sumber kebenaran baru.
- Status pada tabel di bawah adalah snapshot per 2026-08-30. Bila build plan, acceptance criteria, atau evidence berubah, perbarui tabel ini bersama file sumbernya.
- Status implementasi tidak boleh dinaikkan tanpa evidence pada `verify.md` atau matrix acceptance.

## Ringkasan progres

| Dimensi             | Nilai                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| Status spec         | Accepted                                                                                               |
| Build plan          | 5 dari 5 langkah selesai                                                                               |
| Acceptance criteria | 7 AC: 7 PASS, 0 PARTIAL, 0 BLOCKED                                                                     |
| Verdict verifikasi  | Terverifikasi; seluruh acceptance memiliki evidence lokal dan hosted Contract workflow yang ditautkan. |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                                                                         | AC terkait | Status  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------- |
| 1   | Tulis `generate-contract-types.ts` (bundel Redocly ke openapi-typescript ke generated), pastikan deterministik                          | AC-1       | Selesai |
| 2   | Tambah pemeriksaan drift generated ke CI dan header "generated, jangan edit" pada file hasil                                            | AC-2, AC-6 | Selesai |
| 3   | Bangun harness contract test di `tests/contract/`: boot server in memory, introspeksi route, muat operasi kontrak, uji cakupan dua arah | AC-3       | Selesai |
| 4   | Tambah validasi response berbasis ajv untuk enam path awal plus uji bentuk `ApiError` pada request tidak valid                          | AC-4, AC-5 | Selesai |
| 5   | Tulis workflow `contract.yml` yang menjalankan validasi kontrak, drift, dan contract test                                               | AC-7       | Selesai |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                       | Test / proof ID  | Status evidence |
| -------------------- | ----------------------------------------------------------------------------------------- | ---------------- | --------------- |
| [AC-1](test.md#ac-1) | Generate tipe dari bundel OpenAPI ke `src/generated/` secara deterministik (byte identik) | `CT-0004-AC1`    | Terbukti (PASS) |
| [AC-2](test.md#ac-2) | CI meregenerasi lalu `git diff --exit-code` pada folder generated; drift menggagalkan CI  | `SMOKE-0004-AC2` | Terbukti (PASS) |
| [AC-3](test.md#ac-3) | Cakupan dua arah kontrak-server; ketidakcocokan menyebut operasi yang hilang              | `CT-0004-AC3`    | Terbukti (PASS) |
| [AC-4](test.md#ac-4) | Validasi bentuk response nyata server terhadap schema kontrak untuk enam path awal        | `CT-0004-AC4`    | Terbukti (PASS) |
| [AC-5](test.md#ac-5) | Request tidak valid menghasilkan `ApiError` sesuai schema, dibuktikan test                | `CT-0004-AC5`    | Terbukti (PASS) |
| [AC-6](test.md#ac-6) | Folder `src/generated/` dilindungi dari edit manual lewat header dan pemeriksaan drift    | `IT-0004-AC6`    | Terbukti (PASS) |
| [AC-7](test.md#ac-7) | Workflow `contract.yml` menjalankan validasi kontrak, codegen drift, dan contract test    | `SMOKE-0004-AC7` | Terbukti (PASS) |

## Follow-up

- [ ] Setiap spec fitur berikutnya menambahkan operasinya ke daftar validasi response contract test.
