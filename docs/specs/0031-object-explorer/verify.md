# Verify 0031. Object explorer

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

| AC                   | Test atau proof ID                              | Metode                                     | Bukti wajib                                                                                                                        | Result                                                                                                                                                                                              |
| -------------------- | ----------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [AC-1](test.md#ac-1) | `IT-0031-AC1`, `CT-0031-AC1`, `SEC-0031-AC1`    | Integration, Contract, Security            | output command dan assertion; log tersanitasi tanpa secret                                                                         | Integration metadata routes lulus lokal; contract/security khusus belum dipisahkan                                                                                                                  |
| [AC-2](test.md#ac-2) | `E2E-0031-AC2`, `MANUAL-0031-AC2`               | E2E, Manual atau external                  | output command dan assertion; review manusia atau artefak eksternal                                                                | E2E dan review lokal Codex lulus; formal accessibility/cross-browser atau external sign-off tidak diklaim                                                                                           |
| [AC-3](test.md#ac-3) | `E2E-0031-AC3`                                  | E2E                                        | output command dan assertion                                                                                                       | Lulus lokal                                                                                                                                                                                         |
| [AC-4](test.md#ac-4) | `E2E-0031-AC4`, `VIS-0031-AC4`                  | E2E, Visual dan accessibility              | output command dan assertion; screenshot dengan viewport dan state terkunci                                                        | E2E lulus lokal untuk ikon tipe, error per-node, dan retry; screenshot `visual-0031-explorer.png` diinspeksi; visual/accessibility belum formal                                                     |
| [AC-5](test.md#ac-5) | `E2E-0031-AC5`                                  | E2E                                        | output command dan assertion                                                                                                       | Lulus lokal                                                                                                                                                                                         |
| [AC-6](test.md#ac-6) | `E2E-0031-AC6`                                  | E2E                                        | output command dan assertion                                                                                                       | Lulus lokal                                                                                                                                                                                         |
| [AC-7](test.md#ac-7) | `E2E-0031-AC7`, `PERF-0031-AC7`, `VIS-0031-AC7` | E2E, Performance, Visual dan accessibility | output command dan assertion; screenshot dengan viewport dan state terkunci; dataset, baseline, ambang, pengulangan, dan toleransi | E2E, smoke performance, dan visual lokal lulus untuk dataset 2.000 hasil search per engine dengan ambang respons hasil pertama <3 detik; sign-off accessibility/cross-browser formal tetap terpisah |
| [AC-8](test.md#ac-8) | `E2E-0031-AC8`                                  | E2E                                        | output command dan assertion                                                                                                       | Mock dan real run dua engine lulus; viewport virtualized di-reset ke root sebelum setiap connection                                                                                                 |

## Urutan verifikasi

1. Catat commit, versi Bun, sistem operasi, dan environment yang benar benar dipakai.
2. Dari akar repo, jalankan pemeriksaan satu manifest, lint, typecheck, serta command test yang tersedia pada `package.json` akar.
3. Jalankan seluruh test ID pada matriks sesuai jenisnya. Jangan mengganti integration atau operational proof dengan mock.
4. Kumpulkan manual, staged, environment, atau external proof yang ditetapkan. Jangan menandainya lulus bila dependency belum tersedia.
5. Simpan evidence yang tersanitasi, lalu isi result per AC dan verdict akhir.

## Pemeriksaan otomatis

| Area                     | Command source                                        | Expected result                                                         |
| ------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------- |
| Integration              | Script root yang didaftarkan pada satu `package.json` | Resource nyata disposable dipakai dan cleanup lulus.                    |
| Contract                 | Script root yang didaftarkan pada satu `package.json` | Semua `CT-0031-*` lulus dan memiliki assertion yang menutup AC.         |
| E2E                      | Script root yang didaftarkan pada satu `package.json` | Semua `E2E-0031-*` lulus dan memiliki assertion yang menutup AC.        |
| Security                 | Script root yang didaftarkan pada satu `package.json` | Semua `SEC-0031-*` lulus dan memiliki assertion yang menutup AC.        |
| Performance              | Script root yang didaftarkan pada satu `package.json` | Dataset dan threshold terukur tercatat serta terpenuhi.                 |
| Visual dan accessibility | Script root yang didaftarkan pada satu `package.json` | Screenshot, viewport, mode warna, dan state yang disyaratkan tersimpan. |

## Pemeriksaan manual, staged, environment, atau external

| ID                  | AC                   | Langkah atau dependency                                                        | Expected result                                                                     | Evidence                                                                                             |
| ------------------- | -------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `EVIDENCE-0031-AC2` | [AC-2](test.md#ac-2) | Review outcome AC secara langsung dan catat alasan bila tidak dapat diotomasi. | Seluruh kewajiban AC terbukti tanpa mengganti external proof dengan simulasi lokal. | Review lokal source provider-driven dan screenshot explorer selesai; external sign-off tidak diklaim |

## Catatan eksekusi

| 2026-08-30 | working tree | Playwright local web server dengan API fixture | Object Explorer/Search UI **1 passed dalam 8,7 detik**; lazy tree, capability actions, pagination, refresh, dan visual capture lulus. | [Object Explorer UI evidence](../evidence/2026-08-30-object-explorer-ui.md) |

| 2026-08-30 | working tree | Playwright dengan PostgreSQL dan MySQL disposable | Real workflow E2E **4 passed dalam 2,6 menit** mencakup object search dan database-backed explorer flow. | [Real query workflow evidence](../evidence/2026-08-30-real-query-workflows.md) |

| 2026-08-30 | working tree | Bun 1.4.0, Playwright local web server | Mock browser Explorer/search flow **1 pass, 0 fail dalam 2,8 detik**; lazy tree, error/retry, context action, virtualized navigation, dan paginated search lulus; real two-engine workflow dicatat terpisah | `bun run test:e2e -- tests/e2e/web/zzz-object-explorer.spec.ts` |

| 2026-08-30 | Working tree | Playwright local web server, PostgreSQL 55433 dan MySQL 3380 disposable | Real-browser workflow **4 pass, 0 fail dalam 2,5 menit**; Explorer metadata/lazy reveal dan search berjalan pada kedua engine, bersama view/index paths | `MYADMIN_REAL_DATABASE_E2E=1 MYADMIN_TOOLS_PG_DUMP_PATH=/Users/ojiepermana/Development/ojiepermana/myadmin/tests/fixtures/postgres-pg-dump.sh MYADMIN_TOOLS_PSQL_PATH=/Users/ojiepermana/Development/ojiepermana/myadmin/tests/fixtures/postgres-psql.sh bunx playwright test tests/e2e/web/zz-real-query-editor.spec.ts` |
| 2026-08-30 | Working tree | Playwright local web server, PostgreSQL 55433 dan MySQL 3380 disposable | Real-browser Explorer/search workflow **1 pass, 0 fail dalam 8,3 detik**; provider-driven lazy tree dan paginated search lulus | `MYADMIN_REAL_DATABASE_E2E=1 PLAYWRIGHT_HTML_OPEN=never bunx playwright test tests/e2e/web/zzz-object-explorer.spec.ts` |
| 2026-08-30 | Working tree | Playwright local web server, mock provider fixture | Mock Explorer/search **1 pass, 0 fail dalam 8,0 detik**; screenshot `test-results/visual-0031-explorer.png` diinspeksi untuk tree, type icon, pagination, dan action affordance; formal visual/accessibility review tetap terbuka | `PLAYWRIGHT_HTML_OPEN=never bunx playwright test tests/e2e/web/zzz-object-explorer.spec.ts` |

| Waktu      | Commit       | Environment                                                         | Hasil                                                                                                                                                                                | Evidence                                                                                                                                                                                                                 |
| ---------- | ------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-08-29 | Working tree | Bun 1.4.0, object-explorer integration dengan fake provider         | 1 test lulus; routes metadata, connected-session gate, search, dan owner authorization teruji                                                                                        | `bun test tests/integration/object-explorer/object-explorer.test.ts`                                                                                                                                                     |
| 2026-08-29 | Working tree | Bun 1.4.0, macOS arm64, Playwright local web server                 | 1 mock E2E lulus; real search/reveal lulus pada dua engine                                                                                                                           | `bun run test:e2e -- tests/e2e/web/zzz-object-explorer.spec.ts`; real query-editor E2E run sebelumnya                                                                                                                    |
| 2026-08-29 | Working tree | Bun 1.4.0, object explorer unit/integration/contract dan Playwright | Explorer/search subset **4 pass, 35 assertions**; browser flow **1 pass dalam 8,8 detik**; metadata routes, closed authorization, lazy tree, error/retry, and paginated search lulus | `bun test apps/web/test/explorer-search-state.test.ts tests/integration/object-explorer/object-explorer.test.ts tests/contract/object-explorer.test.ts`; `bun run test:e2e -- tests/e2e/web/zzz-object-explorer.spec.ts` |

## Gap dan blocker

| AC         | Gap                                                                        | Dampak                            | Tindak lanjut                                                                                      |
| ---------- | -------------------------------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------- |
| AC-1, AC-7 | Integration/security, visual/accessibility, dan performance belum lengkap. | Verdict tetap belum diverifikasi. | Lengkapi proof yang tersisa; real reveal serta error/retry per-node sudah stabil pada run terbaru. |

## Verdict akhir

Belum diverifikasi. Status ini hanya boleh berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau.
