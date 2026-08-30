# Plan 0001. Fondasi repo satu manifest dan modul source

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
| Build plan          | Tidak dinyatakan (daftar 8 langkah tanpa checkbox pada index.md)                                  |
| Acceptance criteria | 9 AC: 8 PASS, 1 PARTIAL, 0 BLOCKED                                                                |
| Verdict verifikasi  | Belum diverifikasi; result per AC pada verify.md belum diisi dengan evidence yang dapat ditinjau. |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                                                                                                                                                       | AC terkait       | Status           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------------- |
| 1   | Buat `package.json` akar sesuai root manifest contract tanpa `workspaces`, plus `bun.lock`, `bunfig.toml`, `.gitignore`, `.editorconfig`, `.env.example`, dan konfigurasi TypeScript strict dengan alias `@myadmin/*` | AC-1, AC-2, AC-7 | Tidak dinyatakan |
| 2   | Buat skeleton modul source di `packages/*` sesuai daftar AC-8, masing masing dengan `src/index.ts` dan `test/` tanpa `package.json`                                                                                   | AC-7, AC-8       | Tidak dinyatakan |
| 3   | Buat aplikasi Angular di `apps/web` lewat Angular CLI, registrasikan pada `angular.json` akar, dependency tetap di manifest akar                                                                                      | AC-3, AC-7, AC-9 | Tidak dinyatakan |
| 4   | Buat `apps/server` dengan Elysia minimal serta endpoint `/health`                                                                                                                                                     | AC-4, AC-9       | Tidak dinyatakan |
| 5   | Buat `apps/cli` dengan parsing subcommand sederhana dan command `version`                                                                                                                                             | AC-5, AC-9       | Tidak dinyatakan |
| 6   | Tulis script dev `start-server.ts`, `start-web.ts`, `stop-ports.ts`, dan script `build:web` pada manifest akar                                                                                                        | AC-6             | Tidak dinyatakan |
| 7   | Buat kerangka folder `tests/`, `tooling/`, `scripts/`, serta `distribution/` sesuai `struktur.md`, tanpa manifest tambahan                                                                                            | AC-7             | Tidak dinyatakan |
| 8   | Dokumentasikan smoke check install, dev, health, CLI, dan pemeriksaan satu manifest pada README repo                                                                                                                  | AC-1 sampai AC-7 | Tidak dinyatakan |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                                                  | Test / proof ID  | Status evidence    |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------ |
| [AC-1](test.md#ac-1) | `bun install` dari checkout bersih menghasilkan satu `bun.lock` di akar tanpa manifest lain                          | `SMOKE-0001-AC1` | Terbukti (PASS)    |
| [AC-2](test.md#ac-2) | `bun run typecheck` mencakup seluruh source; `tsconfig.base.json` strict dan alias `@myadmin/*` resolve benar        | `SMOKE-0001-AC2` | Terbukti (PASS)    |
| [AC-3](test.md#ac-3) | `apps/web` Angular 22.1+, standalone component, lulus build production `bun run build:web`                           | `SMOKE-0001-AC3` | Terbukti (PASS)    |
| [AC-4](test.md#ac-4) | `apps/server` berjalan dengan Elysia dan menjawab `GET /health` 200 berisi status dan version                        | `IT-0001-AC4`    | Terbukti (PASS)    |
| [AC-5](test.md#ac-5) | `apps/cli` dapat dijalankan; subcommand `version` mencetak versi dari `package.json` akar                            | `IT-0001-AC5`    | Terbukti (PASS)    |
| [AC-6](test.md#ac-6) | Script dev menjalankan server dan Angular dev server bersamaan; proxy `/api` dan `/ws` ke server                     | `IT-0001-AC6`    | Terbukti (PASS)    |
| [AC-7](test.md#ac-7) | Pemeriksaan filesystem menemukan tepat satu `package.json` di akar dengan field wajib, tanpa `workspaces`            | `IT-0001-AC7`    | Terbukti (PASS)    |
| [AC-8](test.md#ac-8) | Seluruh modul source `@myadmin/*` punya `src/index.ts` valid dan folder `test/`, dipetakan alias TypeScript          | `SMOKE-0001-AC8` | Sebagian (PARTIAL) |
| [AC-9](test.md#ac-9) | Konfigurasi akar mengarah langsung ke folder source tanpa package discovery; build, health, CLI membuktikan resolusi | `SMOKE-0001-AC9` | Terbukti (PASS)    |

## Follow-up

- [ ] Setelah scaffold tersedia, AGENTS.md root perlu mencatat aturan satu manifest, alias internal, stack, dan skill implementasi yang dipakai proyek.
- [x] `struktur.md` sudah menetapkan tepat satu `package.json` di akar, tanpa Bun workspaces atau manifest per folder (2026-08-28).
- [x] `apps/web/project.json` sudah dihapus dari pohon folder karena Nx tidak dipakai (2026-08-28).
- [x] Link companion pada `v1-feature-specification.md` sudah menunjuk `struktur.md`.
- [x] `@ojiepermana/angular` terverifikasi tersedia di npm publik pada 2026-08-28.
- [ ] Folder rencana telah dipindahkan pemilik proyek dari `docs/plan/` ke `plan/` di akar repo. Rujukan implementasi perlu memakai lokasi baru.
