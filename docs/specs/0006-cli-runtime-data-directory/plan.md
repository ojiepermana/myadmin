# Plan 0006. CLI runtime dan data directory

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
| Build plan          | Tidak dinyatakan (daftar 6 langkah tanpa checkbox pada index.md)                                  |
| Acceptance criteria | 8 AC: 8 PASS, 0 PARTIAL, 0 BLOCKED                                                                |
| Verdict verifikasi  | Belum diverifikasi; result per AC pada verify.md belum diisi dengan evidence yang dapat ditinjau. |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                                                      | AC terkait       | Status           |
| --- | -------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------------- |
| 1   | Bangun `runtime/data-directory.ts`: resolusi platform, override, pembuatan subfolder, pemeriksaan tulis              | AC-2, AC-3       | Tidak dinyatakan |
| 2   | Bangun parsing perintah dan flag di `main.ts` plus `commands/serve.ts`, `commands/version.ts`                        | AC-1, AC-6       | Tidak dinyatakan |
| 3   | Bangun `runtime/signal-handling.ts` dan alur draining di server (`bootstrap/runtime-lifecycle.ts`)                   | AC-4             | Tidak dinyatakan |
| 4   | Bangun `static-web/serve-assets.ts` dan `spa-fallback.ts` dengan pengurungan path, plus `runtime/embedded-assets.ts` | AC-5             | Tidak dinyatakan |
| 5   | Bangun keluaran terminal (`output/terminal-presenter.ts`) untuk pesan boot dan kegagalan                             | AC-7, AC-8       | Tidak dinyatakan |
| 6   | Test unit resolusi data directory per platform dan test e2e proses: boot, sinyal, exit code                          | AC-1 sampai AC-5 | Tidak dinyatakan |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                                               | Test / proof ID               | Status evidence |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------- | --------------- |
| [AC-1](test.md#ac-1) | `myadmin serve` default bind `127.0.0.1:8080`; flag dan env mengoverride, flag berprioritas                       | `IT-0006-AC1`                 | Terbukti (PASS) |
| [AC-2](test.md#ac-2) | Data directory default per platform; `--data-dir` dan `MYADMIN_DATA_DIR` mengoverride                             | `UT-0006-AC2`                 | Terbukti (PASS) |
| [AC-3](test.md#ac-3) | Boot membuat data directory dan subfolder; kegagalan menulis berhenti dengan pesan jelas dan exit bukan nol       | `IT-0006-AC3`, `SEC-0006-AC3` | Terbukti (PASS) |
| [AC-4](test.md#ac-4) | SIGINT dan SIGTERM memicu graceful shutdown; sinyal kedua memaksa keluar                                          | `IT-0006-AC4`                 | Terbukti (PASS) |
| [AC-5](test.md#ac-5) | Aset web dari embed release atau `dist/web`; fallback SPA `index.html`; `/api/*` tak dikenal tetap 404 `ApiError` | `IT-0006-AC5`                 | Terbukti (PASS) |
| [AC-6](test.md#ac-6) | `myadmin version` mencetak versi, commit hash bila ada, dan platform tanpa membaca data directory                 | `IT-0006-AC6`                 | Terbukti (PASS) |
| [AC-7](test.md#ac-7) | `myadmin serve` mencetak alamat, lokasi data directory, cara berhenti; tanpa secret                               | `IT-0006-AC7`, `SEC-0006-AC7` | Terbukti (PASS) |
| [AC-8](test.md#ac-8) | Rangkaian bootstrap terurut yang tiap tahapnya melaporkan kegagalan secara berbeda dan aman                       | `UT-0006-AC8`                 | Terbukti (PASS) |

## Follow-up

- [ ] Setelah spec 0012, pindahkan pembacaan flag/env ke config loader tunggal supaya prioritas konfigurasi hidup di satu tempat.
