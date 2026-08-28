# Test dan acceptance criteria 0002. Quality tooling dan CI

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Belum dijalankan
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0002.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

`bun run lint`, `bun run format:check`, `bun run typecheck`, `bun run test` tersedia dari root dan lulus pada repo skeleton.

### AC-2

pre-commit hook menjalankan format dan lint hanya pada file yang berubah; commit dengan pelanggaran gagal.

### AC-3

commit-msg hook memvalidasi format conventional commits; pesan tidak valid ditolak.

### AC-4

konfigurasi Vitest di akar mencakup test pada `apps/*` dan `packages/*` secara langsung, tanpa package discovery atau manifest nested; minimal satu unit test contoh per aplikasi lulus.

### AC-5

Playwright terkonfigurasi dengan satu smoke e2e (buka halaman root web dev) yang lulus lokal.

### AC-6

`check-boundaries.ts` menegakkan tabel dependency struktur.md bagian 5; menambah import terlarang (misal `packages/database-core` mengimpor `database-postgresql`) membuat perintah gagal dengan pesan yang menyebut aturan yang dilanggar.

### AC-7

workflow CI `ci.yml` berjalan pada push dan pull request: install, lint, typecheck, boundary check, unit test.

### AC-8

`dependabot.yml` terpasang untuk ekosistem npm dan GitHub Actions.

### AC-9

`bun run check:manifests` berjalan dari filesystem tanpa mengikuti symlink, mengecualikan hanya `.git/`, `node_modules/`, `dist/`, `.angular/`, serta `coverage/`, lalu gagal kecuali satu satunya `package.json` berada di akar; output gagal memuat seluruh path pelanggaran secara terurut dan pemeriksaan ini berjalan di CI.

## Matriks cakupan

| AC | Unit | Integration | Contract | E2E | Security | Performance | Visual | Smoke | Manual atau external |
|---|---|---|---|---|---|---|---|---|---|
| [AC-1](#ac-1) | n/a | n/a | n/a | n/a | n/a | n/a | n/a | `SMOKE-0002-AC1` | n/a |
| [AC-2](#ac-2) | n/a | `IT-0002-AC2` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-3](#ac-3) | n/a | `IT-0002-AC3` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-4](#ac-4) | n/a | n/a | n/a | n/a | n/a | n/a | n/a | `SMOKE-0002-AC4` | n/a |
| [AC-5](#ac-5) | n/a | n/a | n/a | `E2E-0002-AC5` | n/a | n/a | n/a | n/a | n/a |
| [AC-6](#ac-6) | n/a | `IT-0002-AC6` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-7](#ac-7) | n/a | n/a | n/a | n/a | n/a | n/a | n/a | `SMOKE-0002-AC7` | n/a |
| [AC-8](#ac-8) | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | `MANUAL-0002-AC8` |
| [AC-9](#ac-9) | n/a | `IT-0002-AC9` | n/a | n/a | n/a | n/a | n/a | `SMOKE-0002-AC9` | n/a |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

Tidak ada unit yang diwajibkan oleh acceptance criteria saat ini.

## Integration test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `IT-0002-AC2` | [AC-2](#ac-2) | pre-commit hook menjalankan format dan lint hanya pada file yang berubah; commit dengan pelanggaran gagal. | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `IT-0002-AC3` | [AC-3](#ac-3) | commit-msg hook memvalidasi format conventional commits; pesan tidak valid ditolak. | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `IT-0002-AC6` | [AC-6](#ac-6) | check-boundaries.ts menegakkan tabel dependency struktur.md bagian 5; menambah import terlarang (misal packages/database-core mengimpor database-postgresql)... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `IT-0002-AC9` | [AC-9](#ac-9) | bun run check:manifests berjalan dari filesystem tanpa mengikuti symlink, mengecualikan hanya .git/, node_modules/, dist/, .angular/, serta coverage/, lalu g... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-9 terpenuhi. |

## Test tambahan

### Contract test

Tidak ada contract yang diwajibkan oleh acceptance criteria saat ini.

### E2E

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `E2E-0002-AC5` | [AC-5](#ac-5) | Playwright terkonfigurasi dengan satu smoke e2e (buka halaman root web dev) yang lulus lokal. | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |

### Security

Tidak ada security yang diwajibkan oleh acceptance criteria saat ini.

### Performance

Tidak ada performance yang diwajibkan oleh acceptance criteria saat ini.

### Visual dan accessibility

Tidak ada visual dan accessibility yang diwajibkan oleh acceptance criteria saat ini.

### Smoke dan operational acceptance

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `SMOKE-0002-AC1` | [AC-1](#ac-1) | bun run lint, bun run format:check, bun run typecheck, bun run test tersedia dari root dan lulus pada repo skeleton. | Jalankan artefak atau workflow pada environment bersih dan simpan bukti operasional. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `SMOKE-0002-AC4` | [AC-4](#ac-4) | konfigurasi Vitest di akar mencakup test pada apps/ dan packages/ secara langsung, tanpa package discovery atau manifest nested; minimal satu unit test conto... | Jalankan artefak atau workflow pada environment bersih dan simpan bukti operasional. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `SMOKE-0002-AC7` | [AC-7](#ac-7) | workflow CI ci.yml berjalan pada push dan pull request: install, lint, typecheck, boundary check, unit test. | Jalankan artefak atau workflow pada environment bersih dan simpan bukti operasional. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |
| `SMOKE-0002-AC9` | [AC-9](#ac-9) | bun run check:manifests berjalan dari filesystem tanpa mengikuti symlink, mengecualikan hanya .git/, node_modules/, dist/, .angular/, serta coverage/, lalu g... | Jalankan artefak atau workflow pada environment bersih dan simpan bukti operasional. | Seluruh outcome dan failure boundary AC-9 terpenuhi. |

### Manual atau external proof

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `MANUAL-0002-AC8` | [AC-8](#ac-8) | dependabot.yml terpasang untuk ekosistem npm dan GitHub Actions. | Lakukan review manusia atau kumpulkan bukti eksternal yang tidak dapat digantikan test otomatis. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

## Critical test scenarios

- Happy path: commit bersih lolos hook dan CI hijau, verifikasi **AC-1**, **AC-2**, **AC-7**.
- Failure case: import `database-postgresql` dari `database-core` membuat boundary check gagal dengan pesan aturan, verifikasi **AC-6**.
- Failure case: penambahan `package.json` di bawah `apps/*` atau `packages/*` membuat pemeriksaan manifest dan CI gagal dengan path pelanggaran, verifikasi **AC-9**.
- Failure case: pesan commit `update stuff` ditolak commitlint, verifikasi **AC-3**.

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
