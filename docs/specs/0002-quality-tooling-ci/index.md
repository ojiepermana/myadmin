# 0002. Quality tooling dan CI

**Date**: 2026-08-28
**Status**: In Progress
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini memasang pagar kualitas repo: lint, format, typecheck, unit test runner, e2e runner, hook Git, penegakan boundary dependency, penjaga satu manifest, dan pipeline CI dasar. Setelah spec ini, pelanggaran arah dependency atau penambahan `package.json` nested gagal secara otomatis, bukan lewat mata reviewer.

## Context

Struktur.md bagian 5 mendefinisikan dependency yang diizinkan antar modul source, dan bagian 8 berisi guardrail reviewer. Aturan seperti itu hanya bertahan kalau ditegakkan mesin sejak commit pertama; menambahkannya belakangan berarti membersihkan pelanggaran yang sudah menyebar. Spec 0001 juga menetapkan tepat satu `package.json` di akar. Repo sudah menyiapkan tempat tooling pada `.husky/`, `tooling/`, `scripts/quality/`, `scripts/verify/`, `vitest.workspace.ts`, `playwright.config.ts`, dan `.github/workflows/`.

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0001.

## Requirements

**User stories**:
- Sebagai developer, saya ingin pelanggaran format, lint, dan boundary tertangkap sebelum commit supaya PR bersih.
- Sebagai pemilik proyek, saya ingin CI menolak perubahan yang merusak build atau melanggar arsitektur.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): `bun run lint`, `bun run format:check`, `bun run typecheck`, `bun run test` tersedia dari root dan lulus pada repo skeleton.
- [**AC-2**](test.md#ac-2): pre-commit hook menjalankan format dan lint hanya pada file yang berubah; commit dengan pelanggaran gagal.
- [**AC-3**](test.md#ac-3): commit-msg hook memvalidasi format conventional commits; pesan tidak valid ditolak.
- [**AC-4**](test.md#ac-4): konfigurasi Vitest di akar mencakup test pada `apps/*` dan `packages/*` secara langsung, tanpa package discovery atau manifest nested; minimal satu unit test contoh per aplikasi lulus.
- [**AC-5**](test.md#ac-5): Playwright terkonfigurasi dengan satu smoke e2e (buka halaman root web dev) yang lulus lokal.
- [**AC-6**](test.md#ac-6): `check-boundaries.ts` menegakkan tabel dependency struktur.md bagian 5; menambah import terlarang (misal `packages/database-core` mengimpor `database-postgresql`) membuat perintah gagal dengan pesan yang menyebut aturan yang dilanggar.
- [**AC-7**](test.md#ac-7): workflow CI `ci.yml` berjalan pada push dan pull request: install, lint, typecheck, boundary check, unit test.
- [**AC-8**](test.md#ac-8): `dependabot.yml` terpasang untuk ekosistem npm dan GitHub Actions.
- [**AC-9**](test.md#ac-9): `bun run check:manifests` berjalan dari filesystem tanpa mengikuti symlink, mengecualikan hanya `.git/`, `node_modules/`, `dist/`, `.angular/`, serta `coverage/`, lalu gagal kecuali satu satunya `package.json` berada di akar; output gagal memuat seluruh path pelanggaran secara terurut dan pemeriksaan ini berjalan di CI.

## Options considered

### Option 1: dependency-cruiser untuk boundary (dipilih)

Aturan boundary ditulis sebagai konfigurasi dependency-cruiser di `tooling/`, dipanggil `scripts/verify/check-boundaries.ts`.

**Pros**:
- Alat khusus analisis dependency, matang, output pelanggaran jelas, mendukung aturan folder ke folder persis seperti tabel struktur.md.

**Cons**:
- Satu konfigurasi tambahan yang harus dirawat terpisah dari ESLint.

### Option 2: eslint-plugin-boundaries

**Pros**:
- Menyatu dengan pipeline lint yang sudah ada; satu alat lebih sedikit.

**Cons**:
- Model elemennya lebih kaku untuk aturan lintas modul source; pelanggaran hanya terlihat per file yang di lint, bukan sebagai graf.

## Decision

**Chosen option**: Option 1: dependency-cruiser.

Toolchain kualitas memakai ESLint dengan flat config, Prettier, husky, lint-staged, commitlint, Vitest, Playwright, dependency-cruiser, dan GitHub Actions. Semua dependency serta script tooling dimiliki `package.json` akar. `vitest.workspace.ts` adalah konfigurasi test root untuk kumpulan source, bukan deklarasi Bun workspace atau alasan untuk membuat manifest nested (basis: file yang sudah dinyatakan ada di struktur.md: `.husky/`, `vitest.workspace.ts`, `playwright.config.ts`, `.github/workflows/ci.yml`).

**Implementation skills**: `playwright-cli` (`microsoft/playwright-cli`, `.agents/skills/playwright-cli/`) untuk konvensi Playwright.

## Rationale

Semua pilihan alat di sini sudah tersirat dari file yang dikunci struktur.md; spec ini hanya mengunci versi perilaku dan menambah satu keputusan nyata, alat boundary. dependency-cruiser dipilih karena tabel dependency struktur.md berbentuk aturan folder ke folder, bentuk yang paling alami diekspresikan di alat itu, dan kegagalan CI nya menunjuk aturan yang dilanggar secara eksplisit.

## Feature design

**Data model sketch**: tidak ada entity data; artefak berupa konfigurasi dan skrip.

**API surface**: tidak ada endpoint baru.

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| boundary check | daftar aturan dependency | tabel struktur.md bagian 5, disalin ke konfigurasi dependency-cruiser |
| CI | versi Bun yang dipakai | pin di workflow, sumber tunggal `.github/workflows/ci.yml` |
| manifest check | daftar manifest yang diizinkan | aturan satu manifest pada spec 0001 dan `struktur.md` bagian 1 |

**Key invariants**:
- Aturan boundary di konfigurasi adalah salinan setia tabel struktur.md bagian 5; perubahan aturan harus mengubah dokumen dan konfigurasi bersama.
- Seluruh dependency dan script quality dicatat hanya pada `package.json` akar.
- Konfigurasi test dan boundary menemukan source dari path atau glob, bukan dari package manager workspace.
- Pemeriksaan manifest tidak mengikuti symlink, memakai daftar pengecualian tetap dari **AC-9**, dan melaporkan seluruh pelanggaran agar satu eksekusi cukup untuk memperbaikinya.
- CI wajib hijau sebelum merge; tidak ada jalur bypass yang didokumentasikan.

**Security model**: workflow CI tidak menerima secret pada tahap ini; tidak ada kebutuhan token selain bawaan GitHub.

**Configuration required**: tidak ada environment variable baru.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. Pasang seluruh dependency quality pada `package.json` akar, lalu konfigurasi ESLint flat config plus Prettier di `tooling/eslint/` dan `tooling/typescript/` serta script `scripts/quality/{lint,format,typecheck}.ts`, memenuhi **AC-1**.
2. Pasang husky plus lint-staged (pre-commit) dan commitlint config conventional (commit-msg), memenuhi **AC-2**, **AC-3**.
3. Konfigurasi root `vitest.workspace.ts` dengan path atau project test untuk `apps/*` dan `packages/*`, tanpa package discovery, lalu tambah satu unit test contoh per aplikasi, memenuhi **AC-4**.
4. Konfigurasi `playwright.config.ts` menunjuk web dev server, tulis satu smoke e2e di `tests/e2e/web/`, memenuhi **AC-5**.
5. Tulis konfigurasi dependency-cruiser dari tabel struktur.md bagian 5 dan `scripts/verify/check-boundaries.ts`, tambah test negatif yang membuktikan pelanggaran terdeteksi, memenuhi **AC-6**.
6. Tulis `scripts/verify/check-manifests.ts` sesuai aturan traversal dan output pada **AC-9**, daftarkan script root `check:manifests`, lalu tambah test negatif untuk manifest nested serta symlink, memenuhi **AC-9**.
7. Tulis `.github/workflows/ci.yml` untuk install, lint, typecheck, boundary, manifest check, dan unit test, lalu tambah `dependabot.yml`, memenuhi **AC-7**, **AC-8**, dan **AC-9**.

## Consequences

**Positive**:
- Guardrail struktur.md bagian 8 sebagian besar menjadi otomatis sejak hari pertama.

**Negative / tradeoffs**:
- Hook lokal menambah beberapa detik per commit; diterima demi PR yang bersih.
- Dua tempat kebenaran untuk aturan boundary (dokumen dan konfigurasi) yang harus dijaga sinkron.

**Neutral**:
- Workflow `contract.yml`, `integration.yml`, `release.yml`, `security.yml` dibuat oleh spec yang relevan nanti, bukan di sini.

## Follow-up

- [ ] Saat AGENTS.md dibuat (/audit), catat konvensi commit dan perintah quality sebagai aturan proyek.

## References

**Project sources**:
- struktur.md bagian 5 (tabel dependency), bagian 8 (guardrail reviewer), pohon folder bagian 2.
- Spec 0001 (repo satu manifest dan modul source).

**Practices & standards**:
- Conventional commits untuk riwayat yang bisa dibaca mesin; penegakan arsitektur lewat CI, bukan konvensi lisan.

**Links**: tidak ada yang diverifikasi untuk spec ini.
