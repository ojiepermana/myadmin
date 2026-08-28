# 0001. Fondasi repo satu manifest dan modul source

**Date**: 2026-08-28
**Status**: Proposed
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Repo Myadmin memakai tepat satu `package.json` di akar. Folder `apps/*` dan `packages/*` adalah modul source TypeScript, bukan package manager workspace dan bukan package mandiri. Semua dependency, script, instalasi, serta versi aplikasi dikelola dari manifest akar agar fondasi V1 tetap sederhana dan seragam.

## Context

Myadmin menghasilkan satu produk dan satu executable dari tiga entrypoint source, yaitu web Angular, server Bun, dan CLI. Repo belum memiliki source code, jadi keputusan kepemilikan manifest perlu jelas sebelum scaffold dibuat. Tanpa aturan ini, setiap folder mudah mendapat manifest sendiri dan membentuk workspace package manager yang tidak dibutuhkan oleh pola rilis V1.

Dokumen `struktur.md` sudah menetapkan satu `package.json` di akar, tanpa Bun workspaces, Nx, atau Turborepo. Folder aplikasi dan modul internal tetap dipisahkan untuk menjaga boundary arsitektur. Pemisahan itu ditegakkan lewat alias TypeScript dan pemeriksaan import, bukan lewat manifest per folder.

Registrasi project Angular hidup di `angular.json` akar, tanpa `project.json`. Istilah package internal pada spec berikutnya berarti modul source di bawah `packages/*`, bukan package manager package dan bukan artefak yang dipublikasikan secara terpisah.

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: tidak ada. Ini spec pertama.

## Requirements

**User stories**:

- Sebagai developer, saya ingin satu manifest, satu lockfile, dan satu perintah install supaya dependency serta script proyek mudah dipahami.
- Sebagai reviewer, saya ingin struktur folder dan arah dependency sesuai dokumen arsitektur supaya pelanggaran mudah terlihat.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): `bun install` dari checkout bersih membaca `./package.json`, menghasilkan satu `bun.lock` di akar, dan selesai tanpa membutuhkan manifest lain di repo.
- [**AC-2**](test.md#ac-2): `bun run typecheck` dari akar mencakup seluruh source di `apps/*` dan `packages/*`; `tsconfig.base.json` memakai mode strict dan alias `@myadmin/*` resolve ke modul source yang benar.
- [**AC-3**](test.md#ac-3): `apps/web` adalah aplikasi Angular 22.1 atau lebih baru, memakai standalone component dan lulus build production lewat `bun run build:web`.
- [**AC-4**](test.md#ac-4): `apps/server` berjalan dengan Elysia dan menjawab `GET /health` dengan 200 berisi `{ status, version }`.
- [**AC-5**](test.md#ac-5): `apps/cli` dapat dijalankan dan subcommand `version` mencetak versi dari `package.json` akar.
- [**AC-6**](test.md#ac-6): script dev `scripts/dev/start-server.ts` dan `start-web.ts` menjalankan server serta Angular dev server bersamaan; dev server web mem proxy `/api` dan `/ws` ke server.
- [**AC-7**](test.md#ac-7): pemeriksaan filesystem dari akar, tanpa mengikuti symlink dan dengan pengecualian `.git/`, `node_modules/`, `dist/`, `.angular/`, serta `coverage/`, menemukan tepat satu file bernama `package.json`, yaitu `./package.json`; manifest akar memiliki `name: "myadmin"`, `version: "0.1.0"`, `private: true`, `type: "module"`, tidak memiliki field `workspaces`, dan tidak ada manifest pada folder source lain.
- [**AC-8**](test.md#ac-8): seluruh modul source `@myadmin/kernel`, `@myadmin/api-contract`, `@myadmin/sdk-angular`, `@myadmin/internal-domain`, `@myadmin/internal-sqlite`, `@myadmin/crypto`, `@myadmin/auth`, `@myadmin/audit`, `@myadmin/database-core`, `@myadmin/database-postgresql`, `@myadmin/database-mysql`, `@myadmin/jobs`, `@myadmin/config`, `@myadmin/observability`, dan `@myadmin/testkit` memiliki `src/index.ts` yang valid serta folder `test/`; nama tersebut dipetakan oleh alias TypeScript, bukan field `name` pada manifest terpisah.
- [**AC-9**](test.md#ac-9): `angular.json`, konfigurasi TypeScript, script Bun, dan build web mengarah langsung ke folder source yang sama tanpa package discovery; build web, server health, dan CLI version membuktikan resolusi source bekerja dari konfigurasi akar.

## Options considered

### Option 1: Satu manifest akar dengan modul source (dipilih)

Semua dependency dan script dikelola di `package.json` akar. Folder `apps/*` serta `packages/*` diperlakukan sebagai boundary source dan dihubungkan lewat alias TypeScript.

**Pros**:

- Cocok dengan satu produk, satu siklus versi, dan satu executable.
- Instalasi, pembaruan dependency, serta script hanya memiliki satu sumber kebenaran.
- Tidak menambah package graph yang belum diperlukan.

**Cons**:

- Semua dependency terlihat pada satu manifest, sehingga aturan boundary import harus ditegakkan oleh tooling.
- Modul internal tidak dapat dirilis atau diberi versi secara mandiri tanpa perubahan arsitektur.

### Option 2: Bun workspaces dengan manifest per folder

Manifest akar memiliki field `workspaces`, lalu aplikasi dan modul internal memiliki `package.json` sendiri.

**Pros**:

- Kepemilikan dependency dapat dibagi per package.
- Memberi jalur lebih langsung bila modul internal perlu dipublikasikan secara terpisah.

**Cons**:

- Menambah banyak manifest, aturan versi, dan package graph untuk satu produk yang dirilis bersama.
- Membuka ruang drift antara alias source, dependency package, dan urutan build.

### Option 3: Nx atau Turborepo

Repo memakai orchestrator untuk project graph, task graph, generator, dan cache.

**Pros**:

- Task graph dan cache membantu repo besar dengan banyak tim serta target build independen.

**Cons**:

- Menambah lapisan konfigurasi dan pola kerja yang belum dibutuhkan pada V1.
- Tidak menghilangkan kebutuhan untuk menetapkan ownership dependency dan boundary source.

## Decision

**Chosen option**: Option 1: Satu manifest akar dengan modul source.

Repo memiliki tepat satu `package.json` di akar dan manifest itu tidak memiliki field `workspaces`. Semua dependency dan script dimiliki manifest akar. Folder `apps/*` serta `packages/*` adalah modul source TypeScript yang di resolve lewat konfigurasi akar dan alias `@myadmin/*`.

**Implementation skills**: `angular-new-app` dan `angular-developer` untuk aplikasi Angular, serta `elysiajs` untuk skeleton server.

## Rationale

Myadmin V1 dibangun oleh satu tim sebagai satu produk dan satu executable. Tidak ada kebutuhan untuk versioning, publishing, atau instalasi independen pada modul internal. Satu manifest mengurangi konfigurasi yang harus disinkronkan tanpa menghilangkan boundary arsitektur, karena boundary tetap dapat ditegakkan dari path source dan import graph.

Bun workspaces adalah pilihan kedua bila kebutuhan publish atau ownership per modul benar benar muncul. Nx atau Turborepo baru layak dipertimbangkan ketika waktu build atau koordinasi banyak tim menjadi masalah yang terukur.

## Feature design

**Data model sketch**: tidak ada entity data. Artefaknya adalah struktur repo, konfigurasi akar, dan skeleton source.

**Root manifest contract**:

| Field | Nilai atau aturan |
|---|---|
| `name` | `myadmin` |
| `version` | `0.1.0` sebagai versi pengembangan awal, lalu menjadi sumber versi release |
| `private` | `true`, karena aplikasi tidak dipublikasikan sebagai package npm |
| `type` | `module` |
| `workspaces` | tidak boleh ada |
| `dependencies`, `devDependencies`, `scripts` | mencakup seluruh kebutuhan repo dan hanya hidup pada manifest akar |

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| /health | GET | tidak ada | status, version | publik | 503 bila proses belum siap |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| `GET /health` | version | field `version` pada `package.json` akar, dibaca saat build atau boot |
| `cli version` | version | field `version` pada `package.json` akar |
| proxy dev | target port server | default dev `8080`, dapat dioverride oleh `MYADMIN_PORT` |
| install dan script root | dependency serta command | `package.json` akar |
| import `@myadmin/*` | file source tujuan | pemetaan alias pada konfigurasi TypeScript akar |

**Key invariants**:

- Hanya `./package.json` yang boleh ada pada source repo. Pemeriksaan berjalan dari filesystem, tidak mengikuti symlink, dan hanya mengecualikan `.git/`, `node_modules/`, `dist/`, `.angular/`, serta `coverage/`. Manifest lain adalah pelanggaran.
- `package.json` akar tidak memiliki field `workspaces`.
- Semua dependency runtime, development, dan peer yang perlu dipasang oleh aplikasi dicatat di manifest akar.
- Nama `@myadmin/*` adalah alias modul source internal. Nama itu bukan bukti bahwa sebuah folder adalah package manager package.
- Tidak ada source yang mengimpor dari `dist/`, `tests/`, atau `testkit`; penegakan otomatis diselesaikan oleh spec 0002.
- `apps/web` tidak memiliki dependency ke modul server side seperti `internal-sqlite`, `database-*`, atau `crypto`.

**Security model**: belum ada permukaan auth. `/health` bersifat publik dan tidak boleh membocorkan path, konfigurasi, atau versi dependency selain versi aplikasi.

**Configuration required**:

- `MYADMIN_HOST`: host bind server dev, default `127.0.0.1`.
- `MYADMIN_PORT`: port server dev, default `8080`.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

Pendekatan build mengikuti fondasi dulu, lalu irisan end to end per fitur seperti yang dicatat di `scope.md`.

1. Buat `package.json` akar sesuai root manifest contract tanpa field `workspaces`, lalu buat `bun.lock`, `bunfig.toml`, `.gitignore`, `.editorconfig`, `.env.example`, serta konfigurasi TypeScript strict dengan alias `@myadmin/*`, memenuhi **AC-1**, **AC-2**, dan **AC-7**.
2. Buat skeleton modul source di `packages/*` sesuai daftar **AC-8**, masing masing dengan `src/index.ts` dan `test/` tanpa `package.json`, memenuhi **AC-7** dan **AC-8**.
3. Buat aplikasi Angular di `apps/web` lewat Angular CLI, registrasikan pada `angular.json` akar, dan pastikan seluruh dependency tetap di manifest akar, memenuhi **AC-3**, **AC-7**, dan **AC-9**.
4. Buat `apps/server` dengan Elysia minimal serta endpoint `/health`, memenuhi **AC-4** dan **AC-9**.
5. Buat `apps/cli` dengan parsing subcommand sederhana dan command `version`, memenuhi **AC-5** dan **AC-9**.
6. Tulis script dev `start-server.ts`, `start-web.ts`, `stop-ports.ts`, dan script `build:web` pada manifest akar, memenuhi **AC-6**.
7. Buat kerangka folder `tests/`, `tooling/`, `scripts/`, serta `distribution/` sesuai `struktur.md`, tanpa manifest tambahan, memenuhi **AC-7**.
8. Dokumentasikan smoke check install, dev, health, CLI, dan pemeriksaan satu manifest pada README repo, memenuhi **AC-1** sampai **AC-7**.

## Consequences

**Positive**:

- Semua dependency, script, dan versi aplikasi memiliki satu sumber kebenaran.
- Boundary modul tetap terlihat dari struktur folder dan dapat diperiksa dari import graph.
- Scaffold awal lebih kecil dan lebih mudah dirawat oleh tim kecil.

**Negative / tradeoffs**:

- Manifest akar akan lebih panjang ketika fitur bertambah.
- Tooling harus diberi path atau glob source secara eksplisit karena tidak ada package discovery.
- Modul internal tidak memiliki dependency ownership atau versi independen.

**Neutral**:

- `angular.json` tetap menjadi sumber konfigurasi project web.
- Istilah package internal pada spec lain tetap boleh dipakai sebagai nama boundary source, tetapi tidak berarti ada manifest per folder.

## Follow-up

- [ ] Setelah scaffold tersedia, AGENTS.md root perlu mencatat aturan satu manifest, alias internal, stack, dan skill implementasi yang dipakai proyek.
- [x] `struktur.md` sudah menetapkan tepat satu `package.json` di akar, tanpa Bun workspaces atau manifest per folder (2026-08-28).
- [x] `apps/web/project.json` sudah dihapus dari pohon folder karena Nx tidak dipakai (2026-08-28).
- [x] Link companion pada `v1-feature-specification.md` sudah menunjuk `struktur.md`.
- [x] `@ojiepermana/angular` terverifikasi tersedia di npm publik pada 2026-08-28.
- [ ] Folder rencana telah dipindahkan pemilik proyek dari `docs/plan/` ke `plan/` di akar repo. Rujukan implementasi perlu memakai lokasi baru.

## References

**Project sources**:

- `struktur.md` bagian 1, 2, 5, dan 7 untuk keputusan satu manifest, pohon folder, arah dependency, dan urutan implementasi.
- `v1-feature-specification.md` bagian 7.1 untuk kebutuhan runtime.

**Practices & standards**:

- Satu manifest untuk satu produk dengan satu siklus rilis.
- Boundary source eksplisit yang ditegakkan lewat konfigurasi TypeScript dan analisis import.

**Links**:

- Angular releases: https://angular.dev/reference/releases
- Bun blog: https://bun.com/blog
- Elysia di npm: https://www.npmjs.com/package/elysia
