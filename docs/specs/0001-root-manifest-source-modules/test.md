# Test dan acceptance criteria 0001. Fondasi repo satu manifest dan modul source

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Belum dijalankan
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0001.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

`bun install` dari checkout bersih membaca `./package.json`, menghasilkan satu `bun.lock` di akar, dan selesai tanpa membutuhkan manifest lain di repo.

### AC-2

`bun run typecheck` dari akar mencakup seluruh source di `apps/*` dan `packages/*`; `tsconfig.base.json` memakai mode strict dan alias `@myadmin/*` resolve ke modul source yang benar.

### AC-3

`apps/web` adalah aplikasi Angular 22.1 atau lebih baru, memakai standalone component dan lulus build production lewat `bun run build:web`.

### AC-4

`apps/server` berjalan dengan Elysia dan menjawab `GET /health` dengan 200 berisi `{ status, version }`.

### AC-5

`apps/cli` dapat dijalankan dan subcommand `version` mencetak versi dari `package.json` akar.

### AC-6

script dev `scripts/dev/start-server.ts` dan `start-web.ts` menjalankan server serta Angular dev server bersamaan; dev server web mem proxy `/api` dan `/ws` ke server.

### AC-7

pemeriksaan filesystem dari akar, tanpa mengikuti symlink dan dengan pengecualian `.git/`, `node_modules/`, `dist/`, `.angular/`, serta `coverage/`, menemukan tepat satu file bernama `package.json`, yaitu `./package.json`; manifest akar memiliki `name: "myadmin"`, `version: "0.1.0"`, `private: true`, `type: "module"`, tidak memiliki field `workspaces`, dan tidak ada manifest pada folder source lain.

### AC-8

seluruh modul source `@myadmin/kernel`, `@myadmin/api-contract`, `@myadmin/sdk-angular`, `@myadmin/internal-domain`, `@myadmin/internal-sqlite`, `@myadmin/crypto`, `@myadmin/auth`, `@myadmin/audit`, `@myadmin/database-core`, `@myadmin/database-postgresql`, `@myadmin/database-mysql`, `@myadmin/jobs`, `@myadmin/config`, `@myadmin/observability`, dan `@myadmin/testkit` memiliki `src/index.ts` yang valid serta folder `test/`; nama tersebut dipetakan oleh alias TypeScript, bukan field `name` pada manifest terpisah.

### AC-9

`angular.json`, konfigurasi TypeScript, script Bun, dan build web mengarah langsung ke folder source yang sama tanpa package discovery; build web, server health, dan CLI version membuktikan resolusi source bekerja dari konfigurasi akar.

## Matriks cakupan

| AC | Unit | Integration | Contract | E2E | Security | Performance | Visual | Smoke | Manual atau external |
|---|---|---|---|---|---|---|---|---|---|
| [AC-1](#ac-1) | n/a | n/a | n/a | n/a | n/a | n/a | n/a | `SMOKE-0001-AC1` | n/a |
| [AC-2](#ac-2) | n/a | n/a | n/a | n/a | n/a | n/a | n/a | `SMOKE-0001-AC2` | n/a |
| [AC-3](#ac-3) | n/a | n/a | n/a | n/a | n/a | n/a | n/a | `SMOKE-0001-AC3` | n/a |
| [AC-4](#ac-4) | n/a | `IT-0001-AC4` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-5](#ac-5) | n/a | `IT-0001-AC5` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-6](#ac-6) | n/a | `IT-0001-AC6` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-7](#ac-7) | n/a | `IT-0001-AC7` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-8](#ac-8) | n/a | n/a | n/a | n/a | n/a | n/a | n/a | `SMOKE-0001-AC8` | n/a |
| [AC-9](#ac-9) | n/a | n/a | n/a | n/a | n/a | n/a | n/a | `SMOKE-0001-AC9` | n/a |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

Tidak ada unit yang diwajibkan oleh acceptance criteria saat ini.

## Integration test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `IT-0001-AC4` | [AC-4](#ac-4) | apps/server berjalan dengan Elysia dan menjawab GET /health dengan 200 berisi { status, version }. | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `IT-0001-AC5` | [AC-5](#ac-5) | apps/cli dapat dijalankan dan subcommand version mencetak versi dari package.json akar. | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `IT-0001-AC6` | [AC-6](#ac-6) | script dev scripts/dev/start-server.ts dan start-web.ts menjalankan server serta Angular dev server bersamaan; dev server web mem proxy /api dan /ws ke server. | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `IT-0001-AC7` | [AC-7](#ac-7) | pemeriksaan filesystem dari akar, tanpa mengikuti symlink dan dengan pengecualian .git/, node_modules/, dist/, .angular/, serta coverage/, menemukan tepat sa... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

## Test tambahan

### Contract test

Tidak ada contract yang diwajibkan oleh acceptance criteria saat ini.

### E2E

Tidak ada e2e yang diwajibkan oleh acceptance criteria saat ini.

### Security

Tidak ada security yang diwajibkan oleh acceptance criteria saat ini.

### Performance

Tidak ada performance yang diwajibkan oleh acceptance criteria saat ini.

### Visual dan accessibility

Tidak ada visual dan accessibility yang diwajibkan oleh acceptance criteria saat ini.

### Smoke dan operational acceptance

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `SMOKE-0001-AC1` | [AC-1](#ac-1) | bun install dari checkout bersih membaca ./package.json, menghasilkan satu bun.lock di akar, dan selesai tanpa membutuhkan manifest lain di repo. | Jalankan artefak atau workflow pada environment bersih dan simpan bukti operasional. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `SMOKE-0001-AC2` | [AC-2](#ac-2) | bun run typecheck dari akar mencakup seluruh source di apps/ dan packages/; tsconfig.base.json memakai mode strict dan alias @myadmin/ resolve ke modul sourc... | Jalankan artefak atau workflow pada environment bersih dan simpan bukti operasional. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `SMOKE-0001-AC3` | [AC-3](#ac-3) | apps/web adalah aplikasi Angular 22.1 atau lebih baru, memakai standalone component dan lulus build production lewat bun run build:web. | Jalankan artefak atau workflow pada environment bersih dan simpan bukti operasional. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `SMOKE-0001-AC8` | [AC-8](#ac-8) | seluruh modul source @myadmin/kernel, @myadmin/api-contract, @myadmin/sdk-angular, @myadmin/internal-domain, @myadmin/internal-sqlite, @myadmin/crypto, @myad... | Jalankan artefak atau workflow pada environment bersih dan simpan bukti operasional. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |
| `SMOKE-0001-AC9` | [AC-9](#ac-9) | angular.json, konfigurasi TypeScript, script Bun, dan build web mengarah langsung ke folder source yang sama tanpa package discovery; build web, server healt... | Jalankan artefak atau workflow pada environment bersih dan simpan bukti operasional. | Seluruh outcome dan failure boundary AC-9 terpenuhi. |

### Manual atau external proof

Tidak ada manual atau external yang diwajibkan oleh acceptance criteria saat ini.

## Critical test scenarios

- Happy path: install bersih, typecheck root, build web, start server, `GET /health` 200, dan CLI version lulus, memverifikasi **AC-1** sampai **AC-6** serta **AC-9**.
- Failure case: pemeriksaan manifest menemukan `apps/web/package.json` atau `packages/kernel/package.json`, lalu gagal dan melaporkan seluruh path pelanggaran secara terurut, memverifikasi **AC-7**.
- Boundary case: import alias untuk setiap modul source dapat di typecheck, sementara import server side dari web ditolak, memverifikasi **AC-2**, **AC-8**, dan invariant boundary.
- Security case: `/health` hanya mengembalikan status dan versi aplikasi, memverifikasi **AC-4**.

## Staged, environment, dan external proof

Tidak ada staged, environment, atau external proof khusus yang sudah diidentifikasi.

## Fixture dan environment

| Area | Aturan |
|---|---|
| Data | Gunakan data sintetis atau tersanitasi. Jangan memakai credential, token, atau data produksi nyata. |
| Resource | Database, file, port, process, dan container harus disposable serta memiliki cleanup deterministik. |
| Version | Pin versi environment yang dibuktikan. Jangan memakai label dinamis seperti `latest` sebagai bukti acceptance. |
| Root command | Instalasi dan command test selalu dimulai dari akar repo dan satu `package.json`. |

## Exit criteria test

- Setiap AC memiliki test ID atau jalur proof yang eksplisit pada [verify.md](verify.md).
- Unit dan integration test yang relevan diimplementasikan, lulus, dan dapat diulang dari checkout bersih.
- Test yang tidak relevan ditandai `n/a` dengan alasan yang tetap benar setelah implementasi.
- External proof tidak boleh diganti local smoke test. Staged proof tidak boleh ditutup sebelum dependency yang disebut tersedia.
- Tidak ada test yang dianggap lulus hanya karena file atau placeholder tersedia.
