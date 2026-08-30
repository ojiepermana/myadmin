# Plan 0052. Settings dan preferences

**Date**: 2026-08-30
**Spec status**: mengikuti [index.md](index.md)
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Aturan dokumen

- Dokumen planning ini disusulkan setelah spec berjalan. Isinya diturunkan dari `index.md`, `test.md`, `verify.md`, dan `docs/specs/ac-evidence-matrix.md`; file ini bukan sumber kebenaran baru.
- Status pada tabel di bawah adalah snapshot per 2026-08-30. Bila build plan, acceptance criteria, atau evidence berubah, perbarui tabel ini bersama file sumbernya.
- Status implementasi tidak boleh dinaikkan tanpa evidence pada `verify.md` atau matrix acceptance.

## Ringkasan progres

| Dimensi             | Nilai                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| Status spec         | In Progress                                                                                                   |
| Build plan          | 5 dari 5 langkah selesai                                                                                      |
| Acceptance criteria | 7 AC: 7 PASS, 0 PARTIAL, 0 BLOCKED                                                                            |
| Verdict verifikasi  | Belum diverifikasi; verdict hanya berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau. |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                          | AC terkait       | Status  |
| --- | ---------------------------------------------------------------------------------------- | ---------------- | ------- |
| 1   | Registry key (schema, scope, default) plus SettingsService dengan cache                  | AC-1, AC-3, AC-6 | Selesai |
| 2   | Kontrak dan endpoint preferences dan settings, audit settings, regenerasi, contract test | AC-1, AC-3, AC-4 | Selesai |
| 3   | Sambungkan theme store dan pageSize/editor prefs ke preferences                          | AC-2             | Selesai |
| 4   | UI halaman settings dua bagian dengan form dari registry                                 | AC-5             | Selesai |
| 5   | E2e tiga skenario                                                                        | AC-7             | Selesai |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                                    | Test / proof ID                                             | Status evidence |
| -------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | --------------- |
| [AC-1](test.md#ac-1) | Preferences API dengan daftar key dikenal dan schema per key; key tak dikenal ditolak 422              | `UT-0052-AC1`, `IT-0052-AC1`, `CT-0052-AC1`, `SEC-0052-AC1` | Terbukti (PASS) |
| [AC-2](test.md#ac-2) | Theme store membaca dan menulis `ui.theme` lewat preferences setelah login; server menang saat konflik | `UT-0052-AC2`, `IT-0052-AC2`, `E2E-0052-AC2`                | Terbukti (PASS) |
| [AC-3](test.md#ac-3) | Settings API admin only dengan key V1 kecil (`history.maxEntriesPerUser`) dan nilai tervalidasi        | `UT-0052-AC3`, `IT-0052-AC3`, `CT-0052-AC3`, `SEC-0052-AC3` | Terbukti (PASS) |
| [AC-4](test.md#ac-4) | Perubahan settings diaudit (`settings.changed`) sebelum sukses; preferences tidak diaudit              | `IT-0052-AC4`, `SEC-0052-AC4`                               | Terbukti (PASS) |
| [AC-5](test.md#ac-5) | UI dua bagian: Preferensi semua user dan Pengaturan Aplikasi khusus Admin, reaktif tanpa reload        | `UT-0052-AC5`, `E2E-0052-AC5`, `SEC-0052-AC5`               | Terbukti (PASS) |
| [AC-6](test.md#ac-6) | Nilai dibaca lewat lapisan tunggal SettingsService dengan cache dan invalidasi saat tulis              | `UT-0052-AC6`, `IT-0052-AC6`                                | Terbukti (PASS) |
| [AC-7](test.md#ac-7) | E2e: theme lintas konteks login; retensi Admin efektif; user biasa ditolak 403                         | `IT-0052-AC7`, `E2E-0052-AC7`, `SEC-0052-AC7`               | Terbukti (PASS) |

## Follow-up

- [ ] Tidak ada.
