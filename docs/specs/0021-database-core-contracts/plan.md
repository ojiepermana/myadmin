# Plan 0021. Kontrak database-core, capability model, dan registry

**Date**: 2026-08-30
**Spec status**: mengikuti [index.md](index.md)
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Aturan dokumen

- Dokumen planning ini disusulkan setelah spec berjalan. Isinya diturunkan dari `index.md`, `test.md`, `verify.md`, dan `docs/specs/ac-evidence-matrix.md`; file ini bukan sumber kebenaran baru.
- Status pada tabel di bawah adalah snapshot per 2026-08-30. Bila build plan, acceptance criteria, atau evidence berubah, perbarui tabel ini bersama file sumbernya.
- Status implementasi tidak boleh dinaikkan tanpa evidence pada `verify.md` atau matrix acceptance.

## Ringkasan progres

| Dimensi             | Nilai                                                                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status spec         | In Progress                                                                                                                                                |
| Build plan          | 6 dari 6 langkah selesai                                                                                                                                   |
| Acceptance criteria | 9 AC: 9 PASS, 0 PARTIAL, 0 BLOCKED                                                                                                                         |
| Verdict verifikasi  | Belum diverifikasi; contract suite dan review lokal lulus, namun verdict hanya berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau. |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                                                                                                              | AC terkait       | Status  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------- |
| 1   | Definisikan model umum (`ObjectRef`, `Page`, kolom, index, constraint, principal, grant) dan `DbError` berkategori                                                           | AC-6, AC-7       | Selesai |
| 2   | Definisikan seluruh port per domain termasuk `ViewPort`, dokumentasikan kontrak perilaku, dan daftarkan boundary check yang melarang dependency konkret dari `database-core` | AC-1, AC-2, AC-8 | Selesai |
| 3   | Definisikan model capability dengan kunci tertutup, selaras schema kontrak API                                                                                               | AC-3             | Selesai |
| 4   | Bangun `ConnectionContext` non serializable plus test kebocoran                                                                                                              | AC-4             | Selesai |
| 5   | Bangun `ProviderRegistry` plus error engine tak dikenal                                                                                                                      | AC-5             | Selesai |
| 6   | Tulis suite test kontrak generik plus provider fake referensi di package                                                                                                     | AC-9             | Selesai |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                                                            | Test / proof ID              | Status evidence |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- | --------------- |
| [AC-1](test.md#ac-1) | Port kecil per domain (Connection sampai Monitoring); provider adalah komposisi port, bukan interface raksasa                  | CT-0021-AC1                  | Terbukti (PASS) |
| [AC-2](test.md#ac-2) | `database-core` tanpa impor driver, HTTP, SQLite, Angular, atau provider konkret; ditegakkan boundary check                    | CT-0021-AC2                  | Terbukti (PASS) |
| [AC-3](test.md#ac-3) | Model capability dengan `CapabilityKey` tertutup V1 plus kunci V2 bernilai false                                               | UT-0021-AC3, CT-0021-AC3     | Terbukti (PASS) |
| [AC-4](test.md#ac-4) | `ConnectionContext` membawa credential sesaat dan tidak serializable (secret sebagai getter non enumerable)                    | UT-0021-AC4, SEC-0021-AC4    | Terbukti (PASS) |
| [AC-5](test.md#ac-5) | `ProviderRegistry.get(engine)` mengembalikan provider; engine tak dikenal error ternormalisasi; registrasi di composition root | UT-0021-AC5, CT-0021-AC5     | Terbukti (PASS) |
| [AC-6](test.md#ac-6) | Model error ternormalisasi `DbError` dengan kategori tertutup dan pesan aman tanpa secret                                      | UT-0021-AC6, SEC-0021-AC6    | Terbukti (PASS) |
| [AC-7](test.md#ac-7) | Model umum engine netral: `ObjectRef`, `Page`, kolom, index, constraint, principal, grant                                      | CT-0021-AC7                  | Terbukti (PASS) |
| [AC-8](test.md#ac-8) | Setiap port punya dokumentasi kontrak perilaku singkat termasuk boundary `unsupported`                                         | CT-0021-AC8, MANUAL-0021-AC8 | Terbukti (PASS) |
| [AC-9](test.md#ac-9) | Suite test kontrak generik yang bisa dijalankan terhadap provider mana pun                                                     | CT-0021-AC9                  | Terbukti (PASS) |

## Follow-up

- [ ] Perbarui daftar kontrak di struktur.md: tambah `view.ts` (konsekuensi keputusan view V1).
