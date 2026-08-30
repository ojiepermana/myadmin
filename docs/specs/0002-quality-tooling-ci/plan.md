# Plan 0002. Quality tooling dan CI

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
| Build plan          | Tidak dinyatakan (daftar 7 langkah tanpa checkbox pada index.md)                                  |
| Acceptance criteria | 9 AC: 7 PASS, 1 PARTIAL, 1 BLOCKED                                                                |
| Verdict verifikasi  | Belum diverifikasi; result per AC pada verify.md belum diisi dengan evidence yang dapat ditinjau. |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                                                                                                              | AC terkait       | Status           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------------- |
| 1   | Pasang dependency quality pada `package.json` akar, konfigurasi ESLint flat config plus Prettier di `tooling/` serta script `scripts/quality/` untuk lint, format, typecheck | AC-1             | Tidak dinyatakan |
| 2   | Pasang husky plus lint-staged (pre-commit) dan commitlint config conventional (commit-msg)                                                                                   | AC-2, AC-3       | Tidak dinyatakan |
| 3   | Konfigurasi root `bunfig.toml` dengan preload DOM dan pola test untuk `apps/*` dan `packages/*` tanpa package discovery, tambah satu unit test contoh per aplikasi           | AC-4             | Tidak dinyatakan |
| 4   | Konfigurasi `playwright.config.ts` menunjuk web dev server, tulis satu smoke e2e di `tests/e2e/web/`                                                                         | AC-5             | Tidak dinyatakan |
| 5   | Tulis konfigurasi dependency-cruiser dari tabel struktur.md bagian 5 dan `scripts/verify/check-boundaries.ts`, tambah test negatif pelanggaran                               | AC-6             | Tidak dinyatakan |
| 6   | Tulis `scripts/verify/check-manifests.ts` sesuai aturan traversal dan output AC-9, daftarkan script root `check:manifests`, tambah test negatif manifest nested dan symlink  | AC-9             | Tidak dinyatakan |
| 7   | Tulis `.github/workflows/ci.yml` untuk install, lint, typecheck, boundary, manifest check, unit test, lalu tambah `dependabot.yml`                                           | AC-7, AC-8, AC-9 | Tidak dinyatakan |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                                                 | Test / proof ID                 | Status evidence          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------ |
| [AC-1](test.md#ac-1) | `bun run lint`, `format:check`, `typecheck`, `test` tersedia dari root dan lulus                                    | `SMOKE-0002-AC1`                | Terbukti (PASS)          |
| [AC-2](test.md#ac-2) | Pre-commit hook menjalankan format dan lint hanya pada file berubah; pelanggaran menggagalkan commit                | `IT-0002-AC2`                   | Terbukti (PASS)          |
| [AC-3](test.md#ac-3) | Commit-msg hook memvalidasi conventional commits; pesan tidak valid ditolak                                         | `IT-0002-AC3`                   | Terbukti (PASS)          |
| [AC-4](test.md#ac-4) | Konfigurasi Bun test akar mencakup `apps/*` dan `packages/*` langsung; satu unit test per aplikasi lulus            | `SMOKE-0002-AC4`                | Sebagian (PARTIAL)       |
| [AC-5](test.md#ac-5) | Playwright terkonfigurasi dengan satu smoke e2e halaman root web dev yang lulus lokal                               | `E2E-0002-AC5`                  | Terbukti (PASS)          |
| [AC-6](test.md#ac-6) | `check-boundaries.ts` menegakkan tabel dependency; import terlarang gagal dengan pesan aturan yang dilanggar        | `IT-0002-AC6`                   | Terbukti (PASS)          |
| [AC-7](test.md#ac-7) | Workflow CI `ci.yml` berjalan pada push dan pull request dengan install, lint, typecheck, boundary, unit test       | `SMOKE-0002-AC7`                | Terbukti (PASS)          |
| [AC-8](test.md#ac-8) | `dependabot.yml` terpasang untuk ekosistem npm dan GitHub Actions                                                   | `MANUAL-0002-AC8`               | Belum terbukti (BLOCKED) |
| [AC-9](test.md#ac-9) | `check:manifests` gagal kecuali satu-satunya `package.json` di akar, melaporkan seluruh pelanggaran, berjalan di CI | `IT-0002-AC9`, `SMOKE-0002-AC9` | Terbukti (PASS)          |

## Follow-up

- [ ] Saat AGENTS.md dibuat (/audit), catat konvensi commit dan perintah quality sebagai aturan proyek.
