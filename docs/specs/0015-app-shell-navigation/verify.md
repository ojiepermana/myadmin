# Verify 0015. App shell dan navigation

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
| Test plan     | Test ID relevan pada `test.md` sudah diimplementasikan.                          | Shell E2E dan screenshot tersedia           |
| Environment   | Service, database, browser, VM, certificate, atau akun yang dibutuhkan tersedia. | Browser lokal tersedia; manual review belum |

## Matriks verifikasi AC

| AC                   | Test atau proof ID                | Metode                                         | Bukti wajib                                                                                                        | Result                                                                                                             |
| -------------------- | --------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| [AC-1](test.md#ac-1) | `VIS-0015-AC1`, `MANUAL-0015-AC1` | Visual dan accessibility, Manual atau external | output command dan assertion; screenshot dengan viewport dan state terkunci; review manusia atau artefak eksternal | Visual dan review lokal Codex lulus; formal accessibility/cross-browser sign-off tidak diklaim                     |
| [AC-2](test.md#ac-2) | `E2E-0015-AC2`                    | E2E                                            | output command dan assertion                                                                                       | Lulus lokal; shell screenshot artifact tersedia                                                                    |
| [AC-3](test.md#ac-3) | `E2E-0015-AC3`                    | E2E                                            | output command dan assertion                                                                                       | Lulus lokal                                                                                                        |
| [AC-4](test.md#ac-4) | `E2E-0015-AC4`, `VIS-0015-AC4`    | E2E, Visual dan accessibility                  | output command dan assertion; screenshot dengan viewport dan state terkunci                                        | E2E dan local visual lulus; formal accessibility/cross-browser review tetap terbuka                                |
| [AC-5](test.md#ac-5) | `IT-0015-AC5`, `E2E-0015-AC5`     | Integration, E2E                               | output command dan assertion                                                                                       | Lulus lokal pada konfigurasi lazy route dan browser: seluruh 18 protected V1 route dimuat dengan landmark `<main>` |
| [AC-6](test.md#ac-6) | `IT-0015-AC6`                     | Integration                                    | output command dan assertion                                                                                       | Lulus lokal; SDK error aman, correlation ID, dismiss, fallback render error, dan fallback copy lulus               |
| [AC-7](test.md#ac-7) | `E2E-0015-AC7`, `VIS-0015-AC7`    | E2E, Visual dan accessibility                  | output command dan assertion; screenshot dengan viewport dan state terkunci                                        | E2E dan local visual lulus; formal accessibility/cross-browser review tetap terbuka                                |
| [AC-8](test.md#ac-8) | `VIS-0015-AC8`                    | Visual dan accessibility                       | output command dan assertion; screenshot dengan viewport dan state terkunci                                        | Local viewport proof lulus pada boundary 1024/1023px; formal responsive/accessibility review tetap terbuka         |

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
| E2E                      | Script root yang didaftarkan pada satu `package.json` | Semua `E2E-0015-*` lulus dan memiliki assertion yang menutup AC.        |
| Visual dan accessibility | Script root yang didaftarkan pada satu `package.json` | Screenshot, viewport, mode warna, dan state yang disyaratkan tersimpan. |

## Pemeriksaan manual, staged, environment, atau external

| ID                  | AC                   | Langkah atau dependency                                                        | Expected result                                                                     | Evidence                                                                                                          |
| ------------------- | -------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `EVIDENCE-0015-AC1` | [AC-1](test.md#ac-1) | Review outcome AC secara langsung dan catat alasan bila tidak dapat diotomasi. | Seluruh kewajiban AC terbukti tanpa mengganti external proof dengan simulasi lokal. | Screenshot shell 1280px dan review lokal Codex selesai; formal accessibility/cross-browser sign-off tidak diklaim |

## Catatan eksekusi

| 2026-08-30 | working tree | Playwright local web server | Shell browser wave **9 passed dalam 14,3 detik**; resize/fold, tabs, context menu, protected routes, keyboard flow, responsive breakpoint, theme, dan monitoring smoke lulus. | [Shell accessibility smoke evidence](../evidence/2026-08-30-shell-accessibility-smoke.md) |

| Waktu      | Commit       | Environment                                         | Hasil                                                                                                                                                            | Evidence                                                                                                                                                                               |
| ---------- | ------------ | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-30 | Working tree | Bun 1.4.0, macOS arm64, Playwright local web server | **6 E2E lulus dalam 12,0 detik**; 0 gagal; context-menu dan keyboard-dialog screenshot tersedia dan diinspeksi; formal visual/accessibility review tetap terbuka | `PLAYWRIGHT_HTML_OPEN=never bun run test:e2e -- tests/e2e/web/z-shell-navigation.spec.ts`; `test-results/visual-0015-context-menu.png`, `test-results/visual-0015-keyboard-dialog.png` |
| 2026-08-29 | Working tree | route acceptance test                               | Lazy route invariant lulus; **1 test, 60 assertions**                                                                                                            | `bun test tests/quality/app-shell-routing.test.ts`                                                                                                                                     |
| 2026-08-29 | Working tree | Bun 1.4.0, Angular BrowserTestingModule             | **2 pass, 7 assertions**; presenter mempertahankan error aman, correlation ID, dismiss, dan fallback toast                                                       | `bun test apps/web/test/error-presenter.test.ts`                                                                                                                                       |

## Gap dan blocker

| AC         | Gap                                                                                              | Dampak                            | Tindak lanjut                        |
| ---------- | ------------------------------------------------------------------------------------------------ | --------------------------------- | ------------------------------------ |
| AC-4, AC-7 | Formal accessibility/cross-browser review belum lengkap; smoke lokal belum merupakan audit WCAG. | Verdict tetap belum diverifikasi. | Lengkapi review formal yang tersisa. |

## Verdict akhir

Belum diverifikasi. Status ini hanya boleh berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau.
