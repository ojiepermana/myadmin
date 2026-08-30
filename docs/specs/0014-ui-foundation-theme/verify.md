# Verify 0014. UI foundation dan theme

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Verdict**: Belum diverifikasi
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md)

## Ruang verifikasi

Verifikasi membuktikan perilaku implementasi terhadap seluruh acceptance criteria pada [test.md](test.md#acceptance-criteria). File ini tidak mengubah definisi AC dan tidak boleh diberi verdict lulus sebelum aplikasi, test, serta environment yang relevan benar benar dijalankan.

## Prasyarat eksekusi

| Kebutuhan     | Cara memeriksa                                                                   | Status awal                                 |
| ------------- | -------------------------------------------------------------------------------- | ------------------------------------------- |
| Implementasi  | Build plan pada `index.md` selesai untuk slice yang diverifikasi.                | Tersedia; bukti lokal tercatat              |
| Dependency    | Semua relation `requires` pada `relation.md` sudah diterima.                     | Belum diperiksa                             |
| Root manifest | Tepat satu `package.json` ada di akar dan tidak ada manifest nested.             | Lulus quality gates lokal                   |
| Test plan     | Test ID relevan pada `test.md` sudah diimplementasikan.                          | E2E theme dan screenshot tersedia           |
| Environment   | Service, database, browser, VM, certificate, atau akun yang dibutuhkan tersedia. | Browser lokal tersedia; manual review belum |

## Matriks verifikasi AC

| AC                   | Test atau proof ID                  | Metode                                          | Bukti wajib                                                                                                        | Result                                                                                                                                             |
| -------------------- | ----------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| [AC-1](test.md#ac-1) | `SMOKE-0014-AC1`                    | Smoke dan operational                           | output command dan assertion                                                                                       | Parsial lokal; dependency pin dan theme entrypoints lulus, clean artifact smoke belum                                                              |
| [AC-2](test.md#ac-2) | `E2E-0014-AC2`, `VIS-0014-AC2`      | E2E, Visual dan accessibility                   | output command dan assertion; screenshot dengan viewport dan state terkunci                                        | E2E lulus lokal; light/dark artifact tersedia, visual belum direview formal                                                                        |
| [AC-3](test.md#ac-3) | `E2E-0014-AC3`                      | E2E                                             | output command dan assertion                                                                                       | Lulus lokal                                                                                                                                        |
| [AC-4](test.md#ac-4) | `VIS-0014-AC4`, `MANUAL-0014-AC4`   | Visual dan accessibility, Manual atau external  | output command dan assertion; screenshot dengan viewport dan state terkunci; review manusia atau artefak eksternal | Visual dan review lokal Codex lulus; external/package-owner sign-off tidak diklaim                                                                 |
| [AC-5](test.md#ac-5) | `SMOKE-0014-AC5`, `MANUAL-0014-AC5` | Smoke dan operational, Manual atau external     | output command dan assertion; review artifact audit terhadap source package                                        | Invariant audit lulus; review lokal Codex selesai; external/human sign-off terpisah tidak diklaim                                                  |
| [AC-6](test.md#ac-6) | `VIS-0014-AC6`, `SMOKE-0014-AC6`    | Visual dan accessibility, Smoke dan operational | output command dan assertion; screenshot dengan viewport dan state terkunci                                        | Dev-only route dirender pada development build dalam light/dark dan diinspeksi; clean-platform smoke dan formal accessibility review tetap terbuka |
| [AC-7](test.md#ac-7) | `IT-0014-AC7`                       | Integration                                     | output command dan assertion                                                                                       | Lulus lokal; negative dan positive UI boundary checks lulus                                                                                        |

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
| E2E                      | Script root yang didaftarkan pada satu `package.json` | Semua `E2E-0014-*` lulus dan memiliki assertion yang menutup AC.        |
| Visual dan accessibility | Script root yang didaftarkan pada satu `package.json` | Screenshot, viewport, mode warna, dan state yang disyaratkan tersimpan. |
| Smoke dan operational    | Script root yang didaftarkan pada satu `package.json` | Artefak atau workflow berjalan pada environment bersih yang ditetapkan. |

## Pemeriksaan manual, staged, environment, atau external

| ID                  | AC                   | Langkah atau dependency                                                        | Expected result                                                                     | Evidence                                                                                                            |
| ------------------- | -------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `EVIDENCE-0014-AC4` | [AC-4](test.md#ac-4) | Review outcome AC secara langsung dan catat alasan bila tidak dapat diotomasi. | Seluruh kewajiban AC terbukti tanpa mengganti external proof dengan simulasi lokal. | Review lokal atas theme config, provider extension, dan demo selesai; external/package-owner sign-off tidak diklaim |
| `EVIDENCE-0014-AC5` | [AC-5](test.md#ac-5) | Review outcome AC secara langsung dan catat alasan bila tidak dapat diotomasi. | Seluruh kewajiban AC terbukti tanpa mengganti external proof dengan simulasi lokal. | Audit artifact dan invariant test direview lokal; external/human sign-off tambahan tidak diklaim                    |

## Catatan eksekusi

| 2026-08-30 | working tree | Playwright development configuration | UI foundation demo **1 passed dalam 6,4 detik**; dev route, foundation status, light/dark mode, dan screenshot visual lulus. | [UI foundation demo evidence](../evidence/2026-08-30-ui-foundation-demo.md) |

| 2026-08-30 | working tree | Playwright local web server | Shell/settings browser wave **8 passed, 1 skipped dalam 14,1 detik**; theme sync dan mode light/dark/system lulus. | [Shell and settings E2E evidence](../evidence/2026-08-30-shell-settings-e2e.md) |
| 2026-08-30 | working tree | Playwright local web server | Accessibility-oriented shell smoke **9 passed dalam 14,3 detik**; theme, landmark, keyboard, ARIA state, dan responsive checks lulus. | [Shell accessibility smoke evidence](../evidence/2026-08-30-shell-accessibility-smoke.md) |

| 2026-08-30 | working tree | Bun 1.4.0, Playwright local web server | **2 pass, 0 fail**; account theme sync dan light/dark/system mode transition tanpa navigation lulus | `bun run test:e2e -- tests/e2e/web/settings-preferences.spec.ts` |

| Waktu      | Commit       | Environment                                                   | Hasil                                                                                                                                                                             | Evidence                                                                                                                                                                                                         |
| ---------- | ------------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-30 | Working tree | Bun 1.4.0, macOS arm64, Playwright local web server           | **6 E2E lulus dalam 11,2 detik**; 0 gagal; light/dark screenshot artifact tersedia dan diinspeksi; formal visual/accessibility review tetap terbuka                               | `PLAYWRIGHT_HTML_OPEN=never bunx playwright test tests/e2e/web/settings-preferences.spec.ts tests/e2e/web/z-shell-navigation.spec.ts`; `test-results/visual-0014-light.png`; `test-results/visual-0014-dark.png` |
| 2026-08-29 | Working tree | Bun 1.4.0, UI boundary fixture dan source scan                | **2 pass, 2 assertions**; design-system import dan generic shared component ditolak, foundation/domain shared diizinkan                                                           | `bun run test:ui-boundary && bun run lint:ui-boundary`                                                                                                                                                           |
| 2026-08-30 | Working tree | Bun 1.4.0, package/lock/theme/route/template smoke invariants | **2 pass, 12 assertions**; package `@ojiepermana/angular@22.1.7`, theme entrypoints, production dev-route exclusion, dan demo template primitives invariant lulus                 | `bun test scripts/quality/ui-foundation-smoke.test.ts`                                                                                                                                                           |
| 2026-08-30 | Working tree | Bun 1.4.0, development web configuration, Playwright 1280x900 | **1 pass dalam 6,6 detik**; dev-only demo route memuat foundation status dan komponen inti, lalu light/dark screenshot diinspeksi; clean smoke/accessibility formal tetap terbuka | `MYADMIN_E2E_WEB_CONFIGURATION=development MYADMIN_WEB_PORT=4201 bun run test:e2e -- tests/e2e/web/ui-foundation-demo.spec.ts`                                                                                   |

## Gap dan blocker

| AC               | Gap                                                                              | Dampak                            | Tindak lanjut                                              |
| ---------------- | -------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------- |
| AC-1, AC-2, AC-6 | Clean artifact smoke, visual, accessibility, atau manual evidence belum lengkap. | Verdict tetap belum diverifikasi. | Lengkapi clean smoke, screenshot review, dan manual proof. |

## Verdict akhir

Belum diverifikasi. Status ini hanya boleh berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau.
