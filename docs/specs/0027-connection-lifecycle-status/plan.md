# Plan 0027. Connection manager: lifecycle dan status

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
| Build plan          | 5 langkah; status per langkah tidak dinyatakan pada index.md (daftar tanpa checkbox) |
| Acceptance criteria | 9 AC: 9 PASS, 0 PARTIAL, 0 BLOCKED                                                   |
| Verdict verifikasi  | Lulus; spec dapat ditandai penuh berdasarkan evidence yang tersedia.                 |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                                                                                    | AC terkait                    | Status           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------- |
| 1   | Registry sesi aktif di modul server connections (state, transisi, idle sweeper, penutupan saat logout, delete, shutdown) dengan unit test transisi | AC-2, AC-5, AC-6, AC-9        | Tidak dinyatakan |
| 2   | Tambah operasi connect, disconnect, reconnect, status ke kontrak; regenerasi; contract test                                                        | -                             | Tidak dinyatakan |
| 3   | Implementasi endpoint dengan jalur vault dan transient plus audit                                                                                  | AC-1, AC-3, AC-8              | Tidak dinyatakan |
| 4   | UI: aksi connect di sidebar dengan dialog password transient, indikator status per koneksi, segmen status bar, polling 10 detik                    | AC-4, AC-7                    | Tidak dinyatakan |
| 5   | Integration test lifecycle terhadap kedua engine, e2e connect disconnect                                                                           | AC-1 sampai AC-9 (seluruh AC) | Tidak dinyatakan |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                       | Test / proof ID                          | Status evidence |
| -------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------- | --------------- |
| [AC-1](test.md#ac-1) | connect membuka sesi provider dengan credential vault atau secret transient tanpa dicatat | IT-0027-AC1, SEC-0027-AC1                | Terbukti (PASS) |
| [AC-2](test.md#ac-2) | registry per (userId, connectionId); connect ulang no op; state independen antar koneksi  | UT-0027-AC2                              | Terbukti (PASS) |
| [AC-3](test.md#ac-3) | disconnect menutup sesi; reconnect menutup lalu membuka lagi dengan credential sama       | IT-0027-AC3, SEC-0027-AC3                | Terbukti (PASS) |
| [AC-4](test.md#ac-4) | GET /connections/status mengembalikan status seluruh koneksi; UI mem poll 10 detik        | IT-0027-AC4, E2E-0027-AC4                | Terbukti (PASS) |
| [AC-5](test.md#ac-5) | kegagalan sesi menjadi error berkategori; reconnect memulihkan; tanpa retry otomatis      | IT-0027-AC5                              | Terbukti (PASS) |
| [AC-6](test.md#ac-6) | logout, kadaluarsa sesi, penghapusan koneksi, dan shutdown menutup sesi provider          | IT-0027-AC6                              | Terbukti (PASS) |
| [AC-7](test.md#ac-7) | indikator status aksesibel di sidebar dan status bar tanpa credential                     | E2E-0027-AC7, SEC-0027-AC7, VIS-0027-AC7 | Terbukti (PASS) |
| [AC-8](test.md#ac-8) | connect dan disconnect tercatat audit tanpa secret; kegagalan berkategori                 | IT-0027-AC8, SEC-0027-AC8                | Terbukti (PASS) |
| [AC-9](test.md#ac-9) | idle timeout 30 menit menutup sesi dengan alasan idle_closed dari config                  | UT-0027-AC9, IT-0027-AC9                 | Terbukti (PASS) |

## Follow-up

- [ ] Spec 0029 mengganti polling status dengan push channel `connections.status`.
