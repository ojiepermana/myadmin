# Plan 0007. Perintah doctor dan migrate

**Date**: 2026-08-30
**Spec status**: mengikuti [index.md](index.md)
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Aturan dokumen

- Dokumen planning ini disusulkan setelah spec berjalan. Isinya diturunkan dari `index.md`, `test.md`, `verify.md`, dan `docs/specs/ac-evidence-matrix.md`; file ini bukan sumber kebenaran baru.
- Status pada tabel di bawah adalah snapshot per 2026-08-30. Bila build plan, acceptance criteria, atau evidence berubah, perbarui tabel ini bersama file sumbernya.
- Status implementasi tidak boleh dinaikkan tanpa evidence pada `verify.md` atau matrix acceptance.

## Ringkasan progres

| Dimensi             | Nilai                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| Status spec         | In Progress                                                                                       |
| Build plan          | 6 dari 6 langkah selesai                                                                          |
| Acceptance criteria | 7 AC: 7 PASS, 0 PARTIAL, 0 BLOCKED                                                                |
| Verdict verifikasi  | Belum diverifikasi; result per AC pada verify.md belum diisi dengan evidence yang dapat ditinjau. |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                                           | AC terkait       | Status  |
| --- | --------------------------------------------------------------------------------------------------------- | ---------------- | ------- |
| 1   | Definisikan antarmuka `DoctorCheck` dan registry nya di runtime CLI                                       | AC-4             | Selesai |
| 2   | Implementasikan pemeriksaan dasar: data directory, subfolder, SQLite terbuka plus versi migrasi, aset web | AC-2             | Selesai |
| 3   | Bangun presenter hasil (tabel terminal dan `--json`) dengan exit code benar                               | AC-1, AC-7       | Selesai |
| 4   | Implementasikan `migrate` dan `migrate --status` di atas runner spec 0008                                 | AC-5, AC-6       | Selesai |
| 5   | Test: doctor pada instalasi sehat, rusak sebagian, dan output json snapshot; migrate idempotent           | AC-1 sampai AC-7 | Selesai |
| 6   | Audit output terhadap redaction (tinjau semua string yang dicetak)                                        | AC-3             | Selesai |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                                           | Test / proof ID | Status evidence |
| -------------------- | ------------------------------------------------------------------------------------------------------------- | --------------- | --------------- |
| [AC-1](test.md#ac-1) | `myadmin doctor` menyajikan hasil per pemeriksaan dengan pesan tindakan; exit code sesuai hasil               | `IT-0007-AC1`   | Terbukti (PASS) |
| [AC-2](test.md#ac-2) | Pemeriksaan awal: data directory, subfolder, SQLite dan versi migrasi, aset web, config, keyfile              | `IT-0007-AC2`   | Terbukti (PASS) |
| [AC-3](test.md#ac-3) | Doctor tidak pernah mencetak secret; output aman ditempel ke issue publik                                     | `SEC-0007-AC3`  | Terbukti (PASS) |
| [AC-4](test.md#ac-4) | Subsistem mendaftarkan pemeriksaan lewat antarmuka `DoctorCheck` tanpa mengubah kode doctor                   | `UT-0007-AC4`   | Terbukti (PASS) |
| [AC-5](test.md#ac-5) | `myadmin migrate` menjalankan migrasi tertunda dan melaporkan versi; kegagalan berhenti dengan exit bukan nol | `IT-0007-AC5`   | Terbukti (PASS) |
| [AC-6](test.md#ac-6) | `myadmin migrate --status` menampilkan versi skema dan migrasi tertunda tanpa menjalankan apa pun             | `IT-0007-AC6`   | Terbukti (PASS) |
| [AC-7](test.md#ac-7) | `doctor --json` mengeluarkan hasil terstruktur dengan bentuk stabil untuk otomasi                             | `CT-0007-AC7`   | Terbukti (PASS) |

## Follow-up

- [ ] Spec 0010, 0012, 0049 wajib mendaftarkan check nya (keyfile, config, native tools) saat dibangun.
