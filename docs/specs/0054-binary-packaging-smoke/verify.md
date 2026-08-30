# Verify 0054. Packaging binary dan smoke test

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Verdict**: Belum diverifikasi
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md)

## Ruang verifikasi

Verifikasi membuktikan perilaku implementasi terhadap seluruh acceptance criteria pada [test.md](test.md#acceptance-criteria). File ini tidak mengubah definisi AC dan tidak boleh diberi verdict lulus sebelum aplikasi, test, serta environment yang relevan benar benar dijalankan.

## Prasyarat eksekusi

| Kebutuhan     | Cara memeriksa                                                                   | Status awal                    |
| ------------- | -------------------------------------------------------------------------------- | ------------------------------ |
| Implementasi  | Build plan pada `index.md` selesai untuk slice yang diverifikasi.                | Tersedia; bukti lokal tercatat |
| Dependency    | Semua relation `requires` pada `relation.md` sudah diterima.                     | Belum diperiksa                |
| Root manifest | Tepat satu `package.json` ada di akar dan tidak ada manifest nested.             | Belum diperiksa                |
| Test plan     | Test ID relevan pada `test.md` sudah diimplementasikan.                          | Belum siap                     |
| Environment   | Service, database, browser, VM, certificate, atau akun yang dibutuhkan tersedia. | Belum diperiksa                |

## Matriks verifikasi AC

| AC                   | Test atau proof ID                                              | Metode                                                   | Bukti wajib                                                                                                                                            | Result                                                                                                                                                                                                                   |
| -------------------- | --------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [AC-1](test.md#ac-1) | `UT-0054-AC1`, `IT-0054-AC1`, `SMOKE-0054-AC1`                  | Unit, Integration, Smoke dan operational                 | output command dan assertion                                                                                                                           | Partial: lima target berhasil dikompilasi; smoke lokal lulus pada macOS ARM64, target runtime lain belum dijalankan                                                                                                      |
| [AC-2](test.md#ac-2) | `IT-0054-AC2`, `SMOKE-0054-AC2`                                 | Integration, Smoke dan operational                       | output command dan assertion                                                                                                                           | Partial: lima binary dan lima checksum lokal lulus; smoke matrix target belum dibuktikan                                                                                                                                 |
| [AC-3](test.md#ac-3) | `UT-0054-AC3`, `IT-0054-AC3`, `SEC-0054-AC3`, `SMOKE-0054-AC3`  | Unit, Integration, Security, Smoke dan operational       | output command dan assertion; log tersanitasi tanpa secret                                                                                             | Partial: invariant packaging, deterministic checksum pada filesystem disposable, exclusion of non-binary files, lima binary, dan smoke macOS ARM64 lulus; seluruh target runtime serta clean-host proof belum dibuktikan |
| [AC-4](test.md#ac-4) | `IT-0054-AC4`, `E2E-0054-AC4`, `SEC-0054-AC4`, `SMOKE-0054-AC4` | Integration, E2E, Security, Smoke dan operational        | output command dan assertion; log tersanitasi tanpa secret                                                                                             | Partial: binary smoke database-backed lulus pada 4 URL disposable dan E2E wrapper menjalankan binary ARM64 nyata; clean release environment serta full security proof belum dibuktikan                                   |
| [AC-5](test.md#ac-5) | `IT-0054-AC5`, `SMOKE-0054-AC5`, `MANUAL-0054-AC5`              | Integration, Smoke dan operational, Manual atau external | output command dan assertion; review manusia atau artefak eksternal; Tag workflow, runner platform, dan upload artefak harus dibuktikan pada CI nyata. | Parsial lokal; packaging/release invariant test lulus, tetapi tag workflow, runner, upload artifact, dan hosted proof belum                                                                                              |
| [AC-6](test.md#ac-6) | `IT-0054-AC6`, `PERF-0054-AC6`, `SMOKE-0054-AC6`                | Integration, Performance, Smoke dan operational          | output command dan assertion; dataset, baseline, ambang, pengulangan, dan toleransi                                                                    | Parsial lokal; embedded SPA smoke dan ukuran artefak lulus, performance baseline belum                                                                                                                                   |
| [AC-7](test.md#ac-7) | `IT-0054-AC7`, `SMOKE-0054-AC7`, `MANUAL-0054-AC7`              | Integration, Smoke dan operational, Manual atau external | output command dan assertion; review manusia atau artefak eksternal                                                                                    | Partial: local smoke dan invariant tersedia; review hosted/manual belum ada                                                                                                                                              |

## Urutan verifikasi

1. Catat commit, versi Bun, sistem operasi, dan environment yang benar benar dipakai.
2. Dari akar repo, jalankan pemeriksaan satu manifest, lint, typecheck, serta command test yang tersedia pada `package.json` akar.
3. Jalankan seluruh test ID pada matriks sesuai jenisnya. Jangan mengganti integration atau operational proof dengan mock.
4. Kumpulkan manual, staged, environment, atau external proof yang ditetapkan. Jangan menandainya lulus bila dependency belum tersedia.
5. Simpan evidence yang tersanitasi, lalu isi result per AC dan verdict akhir.

## Pemeriksaan otomatis

| Area                  | Command source                                        | Expected result                                                         |
| --------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------- |
| Unit                  | Script root yang didaftarkan pada satu `package.json` | Semua `UT-0054-*` lulus dan memiliki assertion yang menutup AC.         |
| Integration           | Script root yang didaftarkan pada satu `package.json` | Resource nyata disposable dipakai dan cleanup lulus.                    |
| E2E                   | Script root yang didaftarkan pada satu `package.json` | Semua `E2E-0054-*` lulus dan memiliki assertion yang menutup AC.        |
| Security              | Script root yang didaftarkan pada satu `package.json` | Semua `SEC-0054-*` lulus dan memiliki assertion yang menutup AC.        |
| Performance           | Script root yang didaftarkan pada satu `package.json` | Dataset dan threshold terukur tercatat serta terpenuhi.                 |
| Smoke dan operational | Script root yang didaftarkan pada satu `package.json` | Artefak atau workflow berjalan pada environment bersih yang ditetapkan. |

## Pemeriksaan manual, staged, environment, atau external

| ID                  | AC                   | Langkah atau dependency                                                           | Expected result                                                                     | Evidence  |
| ------------------- | -------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------- |
| `EVIDENCE-0054-AC5` | [AC-5](test.md#ac-5) | Tag workflow, runner platform, dan upload artefak harus dibuktikan pada CI nyata. | Seluruh kewajiban AC terbukti tanpa mengganti external proof dengan simulasi lokal. | Belum ada |
| `EVIDENCE-0054-AC7` | [AC-7](test.md#ac-7) | Review outcome AC secara langsung dan catat alasan bila tidak dapat diotomasi.    | Seluruh kewajiban AC terbukti tanpa mengganti external proof dengan simulasi lokal. | Belum ada |

## Evidence lokal terbaru

| Command                                                                                                                | Result | Coverage                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run build:web` dan `bun run build:web:release`                                                                    | Lulus  | Angular production assets berhasil dibangun untuk release.                                                                                                          |
| `bun run build:binaries --target=macos-arm64`                                                                          | Lulus  | Binary macOS ARM64 berhasil dikompilasi.                                                                                                                            |
| `bun run smoke:binary -- --binary dist/binaries/macos-arm64/myadmin --database-url '<fixture URL>' --require-database` | Lulus  | Health, embedded SPA, setup, login, auth, koneksi database, shutdown, dan doctor lulus pada binary macOS ARM64 terhadap PostgreSQL 55433 dan MySQL 3380 disposable. |
| `bun run checksums` dan `bun run release:sizes`                                                                        | Lulus  | SHA-256 checksum dan ukuran artefak macOS ARM64 tersedia.                                                                                                           |

Rerun 2026-08-29: `bun test scripts/build/packaging.test.ts scripts/release/changelog.test.ts tests/quality/distribution-release.test.ts` lulus **17 test, 85 assertions**; lima target binary berhasil dikompilasi ulang, checksum, dan size report juga lulus. Root regression terbaru dengan fixture disposable aktif menghasilkan **664 pass, 0 fail, 4.532 assertions**; smoke runtime tetap hanya dijalankan pada macOS ARM64 host.

Rerun tambahan 2026-08-30: `bun test scripts/build/packaging.test.ts` lulus **7 test, 19 assertions**, termasuk size report deterministik untuk kelima target dan format singular/plural byte; quality gate format juga lulus.

Evidence lokal membuktikan kompilasi lima target release dan smoke database pada binary macOS ARM64 untuk PostgreSQL/MySQL; tag workflow, upload artefak, atau hosted CI belum terbukti.

## Catatan eksekusi

| Waktu      | Commit       | Environment                                                                             | Hasil                                                                                                                                                                                            | Evidence                                                                                                                                                                                                     |
| ---------- | ------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-08-29 | working tree | Bun 1.4.0, macOS arm64 host                                                             | Lima target (`linux-x64`, `linux-arm64`, `macos-x64`, `macos-arm64`, `windows-x64`) dikompilasi; 5 checksum dan size report lulus; hosted release proof belum tersedia                           | `bun run build:binaries -- --target=linux-x64 --target=linux-arm64 --target=macos-x64 --target=macos-arm64 --target=windows-x64 && bun run checksums && bun run release:sizes`                               |
| 2026-08-29 | working tree | Binary macOS ARM64, smoke tanpa database URL                                            | Smoke binary lulus untuk health, embedded SPA, setup/login/auth, shutdown, dan doctor; database smoke dilewati karena URL tidak diberikan                                                        | `bun run smoke:binary -- --binary dist/binaries/macos-arm64/myadmin`                                                                                                                                         |
| 2026-08-29 | working tree | Binary macOS ARM64 baru dibangun, PostgreSQL disposable 55433                           | Database-required binary smoke lulus: health, embedded SPA, setup/login/auth, database connection, shutdown, dan doctor                                                                          | `bun run smoke:binary -- --binary dist/binaries/macos-arm64/myadmin --database-url '<fixture URL>' --require-database`                                                                                       |
| 2026-08-29 | working tree | Binary macOS ARM64 hasil lima-target build terbaru, PostgreSQL disposable 55433         | Database-required smoke pada artifact terbaru lulus: health, embedded SPA, setup/login/auth, koneksi database, shutdown, dan doctor                                                              | `bun run smoke:binary -- --binary dist/binaries/macos-arm64/myadmin --database-url '<fixture URL>' --require-database`                                                                                       |
| 2026-08-30 | working tree | Playwright Node runner, Bun subprocess, macOS ARM64 binary, PostgreSQL disposable 55433 | **1 E2E pass, 0 fail** dalam 8,7 detik; wrapper menjalankan `smoke-binary.ts` melalui Bun dan membuktikan health, embedded SPA, setup/login/auth, koneksi PostgreSQL, SIGTERM, dan doctor        | `MYADMIN_SMOKE_DATABASE_URL='postgres://myadmin_test:<fixture-password>@127.0.0.1:55433/myadmin_test?sslmode=disable' bunx playwright test --config playwright.config.ts tests/e2e/web/binary-smoke.spec.ts` |
| 2026-08-30 | working tree | Bun 1.4.0, macOS ARM64                                                                  | Release web build lulus dan menghasilkan `dist/web`; packaging/changelog/distribution invariant suite **18 pass, 0 fail, 86 assertions**                                                         | `bun run build:web:release && bun test --isolate scripts/build/packaging.test.ts scripts/release/changelog.test.ts tests/quality/distribution-release.test.ts`                                               |
| 2026-08-30 | working tree | Bun 1.4.0, release workflow and platform README invariants                              | **10 pass, 0 fail, 65 assertions**; local test membuktikan quality-job dependency, target build/smoke/artifact upload wiring, dan README per platform; hosted tag execution tetap belum terbukti | `bun test tests/quality/distribution-release.test.ts`                                                                                                                                                        |

| 2026-08-30 | working tree | Bun 1.4.0, macOS ARM64, lima target compile, PostgreSQL 55433, MySQL 3380 | `build:web:release`, embed, lima binary, checksum, dan size report lulus; database-required binary smoke PostgreSQL dan MySQL masing-masing lulus health, embedded SPA, setup/login/auth, connection, shutdown, dan doctor | `bun run build:web:release && bun run embed:web && bun run build:binaries && bun run checksums && bun run release:sizes`; `bun run smoke:binary -- --binary dist/binaries/macos-arm64/myadmin --database-url '<PostgreSQL fixture URL>' --require-database`; `bun run smoke:binary -- --binary dist/binaries/macos-arm64/myadmin --database-url '<MySQL fixture URL>' --require-database` |

## Gap dan blocker

| AC                     | Gap                                                                                                    | Dampak                                                             | Tindak lanjut                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| AC-1, AC-2, AC-3, AC-7 | Lima target local packaging, checksum, size report, dan metadata sudah lulus.                          | Release workflow hosted dan external release proof belum lengkap.  | Jalankan release workflow pada hosted CI dan verifikasi artefak publik.     |
| AC-4                   | Binary smoke database-backed sudah dibuktikan pada macOS ARM64 dengan PostgreSQL dan MySQL disposable. | Clean release environment dan smoke seluruh target belum terbukti. | Ulangi smoke dari artefak release pada target environment yang disyaratkan. |
| AC-5, AC-6             | Tag workflow, artifact upload, dan performance packaging belum dibuktikan.                             | Acceptance external dan performance tetap terbuka.                 | Lengkapi CI evidence serta benchmark yang ditetapkan.                       |

## Verdict akhir

Belum diverifikasi. Status ini hanya boleh berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau.
