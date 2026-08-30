# Plan 0012. Package config

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

| #   | Langkah rencana                                                                                                 | AC terkait       | Status  |
| --- | --------------------------------------------------------------------------------------------------------------- | ---------------- | ------- |
| 1   | Definisikan schema TypeBox plus default dan flag sensitif di `config/schema/`                                   | AC-1             | Selesai |
| 2   | Bangun loader (flag, env mapping, TOML, merge berprioritas, immutability, metadata sumber) di `config/loaders/` | AC-2, AC-3, AC-4 | Selesai |
| 3   | Integrasikan redaction (spec 0011) untuk dump                                                                   | AC-5             | Selesai |
| 4   | Pindahkan pembacaan host/port/dataDir CLI (spec 0006) ke loader ini; daftarkan doctor check                     | AC-2, AC-6       | Selesai |
| 5   | Unit test lengkap                                                                                               | AC-7             | Selesai |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                           | Test / proof ID               | Status evidence |
| -------------------- | --------------------------------------------------------------------------------------------- | ----------------------------- | --------------- |
| [AC-1](test.md#ac-1) | Schema config bertipe dengan default V1; setelan baru wajib lewat schema ini                  | `UT-0012-AC1`                 | Terbukti (PASS) |
| [AC-2](test.md#ac-2) | Prioritas sumber flag CLI, env `MYADMIN_`, file TOML, default; sumber pemenang terlaporkan    | `UT-0012-AC2`                 | Terbukti (PASS) |
| [AC-3](test.md#ac-3) | File config opsional; file tidak valid menggagalkan startup dengan daftar kesalahan per kunci | `IT-0012-AC3`                 | Terbukti (PASS) |
| [AC-4](test.md#ac-4) | Config immutable, di inject ke composition root; fitur menerima potongan, bukan objek global  | `UT-0012-AC4`                 | Terbukti (PASS) |
| [AC-5](test.md#ac-5) | Dump config melewati redaction; `MYADMIN_MASTER_KEY` tidak pernah masuk schema config         | `SEC-0012-AC5`                | Terbukti (PASS) |
| [AC-6](test.md#ac-6) | Doctor check config: validitas, path file, sumber pemenang per kunci, tanpa nilai sensitif    | `IT-0012-AC6`, `SEC-0012-AC6` | Terbukti (PASS) |
| [AC-7](test.md#ac-7) | Unit test menutup prioritas sumber, kegagalan validasi, pemetaan env, dan redaction dump      | `UT-0012-AC7`                 | Terbukti (PASS) |

## Follow-up

- [ ] Dokumentasi operator (spec 0055) memuat referensi lengkap kunci config dan env.
