# Plan 0030. Workspace persistence

**Date**: 2026-08-30
**Spec status**: mengikuti [index.md](index.md)
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Aturan dokumen

- Dokumen planning ini disusulkan setelah spec berjalan. Isinya diturunkan dari `index.md`, `test.md`, `verify.md`, dan `docs/specs/ac-evidence-matrix.md`; file ini bukan sumber kebenaran baru.
- Status pada tabel di bawah adalah snapshot per 2026-08-30. Bila build plan, acceptance criteria, atau evidence berubah, perbarui tabel ini bersama file sumbernya.
- Status implementasi tidak boleh dinaikkan tanpa evidence pada `verify.md` atau matrix acceptance.

## Ringkasan progres

| Dimensi             | Nilai                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| Status spec         | Complete                                                                                                    |
| Build plan          | 4 langkah; status per langkah tidak dinyatakan pada index.md (daftar tanpa checkbox)                        |
| Acceptance criteria | 7 AC: 7 PASS, 0 PARTIAL, 0 BLOCKED                                                                          |
| Verdict verifikasi  | Lulus; seluruh AC memiliki result dan evidence yang dapat ditinjau (visual proof tidak diwajibkan AC 0030). |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                                    | AC terkait       | Status           |
| --- | -------------------------------------------------------------------------------------------------- | ---------------- | ---------------- |
| 1   | Tambah operasi workspace ke kontrak plus schema state berversi, regenerasi, contract test          | AC-1, AC-2       | Tidak dinyatakan |
| 2   | Endpoint server dengan validasi schema dan ukuran                                                  | AC-6             | Tidak dinyatakan |
| 3   | Klien: sinkronisasi `workspace.store` (debounce, flush, restore dengan sanitasi dan pemberitahuan) | AC-3, AC-4, AC-5 | Tidak dinyatakan |
| 4   | E2e restore dua skenario                                                                           | AC-7             | Tidak dinyatakan |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                            | Test / proof ID            | Status evidence |
| -------------------- | ---------------------------------------------------------------------------------------------- | -------------------------- | --------------- |
| [AC-1](test.md#ac-1) | GET dan PUT /workspace sesuai kontrak dengan schema state yang dinyatakan                      | IT-0030-AC1, CT-0030-AC1   | Terbukti (PASS) |
| [AC-2](test.md#ac-2) | state berversi memuat tabs, panels, activeConnectionId; context tab serializable eksplisit     | UT-0030-AC2, CT-0030-AC2   | Terbukti (PASS) |
| [AC-3](test.md#ac-3) | klien menyimpan dengan debounce 2 detik plus flush saat beforeunload                           | UT-0030-AC3, E2E-0030-AC3  | Terbukti (PASS) |
| [AC-4](test.md#ac-4) | restore membuang tab koneksi mati dengan pemberitahuan; tab pulih tidak tersambung             | E2E-0030-AC4, SEC-0030-AC4 | Terbukti (PASS) |
| [AC-5](test.md#ac-5) | field version memungkinkan migrasi; versi tak dikenal diperlakukan kosong dengan pemberitahuan | UT-0030-AC5, E2E-0030-AC5  | Terbukti (PASS) |
| [AC-6](test.md#ac-6) | state tanpa data sensitif; server menolak state melebihi 256 KB                                | UT-0030-AC6, SEC-0030-AC6  | Terbukti (PASS) |
| [AC-7](test.md#ac-7) | e2e: susunan pulih setelah login ulang; tab koneksi terhapus dilewati dengan pemberitahuan     | E2E-0030-AC7               | Terbukti (PASS) |

## Follow-up

- [ ] Fitur tab baru (query, data browser, designer) wajib mendefinisikan context serializable nya saat dibangun.
