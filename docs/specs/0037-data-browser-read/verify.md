# Verify 0037. Data browser: jalur baca

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

| AC                   | Test atau proof ID                           | Metode                        | Bukti wajib                                                                                                       | Result                                                                                                                                                                        |
| -------------------- | -------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [AC-1](test.md#ac-1) | `IT-0037-AC1`, `CT-0037-AC1`                 | Integration, Contract         | output command dan assertion                                                                                      | Parsial lokal; contract dan real-browser read flow lulus, integration matrix penuh belum dipisahkan                                                                           |
| [AC-2](test.md#ac-2) | `UT-0037-AC2`, `IT-0037-AC2`, `SEC-0037-AC2` | Unit, Integration, Security   | output command dan assertion; log tersanitasi tanpa secret                                                        | Parsial lokal; typed pagination/filter proof lulus, security matrix penuh belum                                                                                               |
| [AC-3](test.md#ac-3) | `UT-0037-AC3`, `SEC-0037-AC3`                | Unit, Security                | output command dan assertion; log tersanitasi tanpa secret                                                        | Data-browser E2E membuktikan search/filter state dikirim sebagai bounded request; dedicated security matrix masih belum                                                       |
| [AC-4](test.md#ac-4) | `UT-0037-AC4`, `IT-0037-AC4`                 | Unit, Integration             | output command dan assertion                                                                                      | Parsial lokal; real-browser data read proof lulus, seluruh unit/integration evidence belum dipisahkan                                                                         |
| [AC-5](test.md#ac-5) | `IT-0037-AC5`, `E2E-0037-AC5`                | Integration, E2E              | output command dan assertion                                                                                      | Browser E2E membuktikan total exact ditampilkan sebagai `1 row` dan `exact total`, serta sort/filter memicu request state yang sesuai; full integration matrix masih belum    |
| [AC-6](test.md#ac-6) | `E2E-0037-AC6`, `VIS-0037-AC6`               | E2E, Visual dan accessibility | output command dan assertion; screenshot dengan viewport dan state terkunci                                       | Parsial lokal; bounded read, filter/sort state, column picker, dan pagination Page 2 payload lulus; view/read-only, visual, dan accessibility penuh belum                     |
| [AC-7](test.md#ac-7) | `E2E-0037-AC7`                               | E2E                           | output command dan assertion                                                                                      | Local mock browser E2E membuktikan view read-only label dan tidak adanya Add row; real view flow masih belum                                                                  |
| [AC-8](test.md#ac-8) | `PERF-0037-AC8`, `SEC-0037-AC8`              | Performance, Security         | output command dan assertion; dataset, baseline, ambang, pengulangan, dan toleransi; log tersanitasi tanpa secret | Performance NFR-01 lulus pada fixture PostgreSQL 1 juta baris dengan halaman 100 baris dalam 38,99 ms; security matrix penuh belum                                            |
| [AC-9](test.md#ac-9) | `E2E-0037-AC9`                               | E2E                           | output command dan assertion                                                                                      | Parsial lokal; browser fixture membuktikan filter, sort, pemilih kolom, dan pagination pada context PostgreSQL serta MySQL; pembukaan langsung dari explorer belum dibuktikan |

## Urutan verifikasi

1. Catat commit, versi Bun, sistem operasi, dan environment yang benar benar dipakai.
2. Dari akar repo, jalankan pemeriksaan satu manifest, lint, typecheck, serta command test yang tersedia pada `package.json` akar.
3. Jalankan seluruh test ID pada matriks sesuai jenisnya. Jangan mengganti integration atau operational proof dengan mock.
4. Kumpulkan manual, staged, environment, atau external proof yang ditetapkan. Jangan menandainya lulus bila dependency belum tersedia.
5. Simpan evidence yang tersanitasi, lalu isi result per AC dan verdict akhir.

## Pemeriksaan otomatis

| Area                     | Command source                                        | Expected result                                                         |
| ------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------- |
| Unit                     | Script root yang didaftarkan pada satu `package.json` | Semua `UT-0037-*` lulus dan memiliki assertion yang menutup AC.         |
| Integration              | Script root yang didaftarkan pada satu `package.json` | Resource nyata disposable dipakai dan cleanup lulus.                    |
| Contract                 | Script root yang didaftarkan pada satu `package.json` | Semua `CT-0037-*` lulus dan memiliki assertion yang menutup AC.         |
| E2E                      | Script root yang didaftarkan pada satu `package.json` | Semua `E2E-0037-*` lulus dan memiliki assertion yang menutup AC.        |
| Security                 | Script root yang didaftarkan pada satu `package.json` | Semua `SEC-0037-*` lulus dan memiliki assertion yang menutup AC.        |
| Performance              | Script root yang didaftarkan pada satu `package.json` | Dataset dan threshold terukur tercatat serta terpenuhi.                 |
| Visual dan accessibility | Script root yang didaftarkan pada satu `package.json` | Screenshot, viewport, mode warna, dan state yang disyaratkan tersimpan. |

## Pemeriksaan manual, staged, environment, atau external

Tidak ada manual atau external proof khusus yang diidentifikasi. Pemeriksaan reviewer tetap wajib untuk evidence otomatis.

## Catatan eksekusi

| Waktu      | Commit       | Environment                                              | Hasil                                                                                                                                                                                                               | Evidence                                                       |
| ---------- | ------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 2026-08-29 | Working tree | Bun 1.4.0, server route integration dengan fake provider | Data-browser route integration lulus pada read/serialization, bounded paging/sort/search/total, dan closed operator validation; view/mutation cases pada file yang sama juga lulus; **6 pass, 50 assertions** total | `bun test tests/integration/data-browser/data-browser.test.ts` |

| Waktu      | Commit       | Environment                                             | Hasil                                                                                                                                                                                                        | Evidence                                                                                                  |
| ---------- | ------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| 2026-08-30 | Working tree | Bun lokal, web server Playwright, fixture contract mock | Data Browser E2E **2 pass**; bounded read, exact-total label, search, column filter, sort, column picker, pagination Page 2 payload, row identity, mutations, export payload, dan dua-engine read flow lulus | `bunx playwright test tests/e2e/web/zz-data-browser.spec.ts`; `docs/specs/evidence/2026-08-29-browser.md` |
| 2026-08-29 | Working tree | PostgreSQL/MySQL disposable                             | `bun test tests/integration tests/performance`: 156 passed, 0 skipped; provider read/filter/sort/pagination dan performance tercatat                                                                         | `docs/specs/evidence/2026-08-29-database.md`; `docs/specs/evidence/2026-08-29-browser.md`                 |
| 2026-08-29 | Working tree | PostgreSQL/MySQL disposable                             | `MYADMIN_REAL_DATABASE_E2E=1 bunx playwright test tests/e2e/web/zz-real-query-editor.spec.ts tests/e2e/web/zz-real-security.spec.ts`: 4 passed, 0 skipped; real-engine Data Browser flow ikut lulus          | `tests/e2e/web/zz-real-query-editor.spec.ts`; `docs/specs/evidence/2026-08-29-e2e.md`                     |
| 2026-08-30 | Working tree | PostgreSQL disposable, fixture 1.000.000 baris          | **1 pass, 0 fail, 4 assertions** dalam 1,41 detik proses test; halaman pertama 100 baris, `hasMore=true`, total 1.000.000, dan threshold halaman `< 3.000 ms` terpenuhi (pengukuran assertion 38,99 ms)      | `MYADMIN_POSTGRES_INTEGRATION=1 bun test --isolate tests/performance/data-browser.test.ts`                |

## Gap dan blocker

| AC         | Gap                                                                                                                                                                                                         | Dampak                                        | Tindak lanjut                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------- |
| AC-1, AC-4 | Bukti provider disposable dan sebagian browser tersedia, tetapi matriks test ID formal belum seluruhnya ditutup pada Verify ini.                                                                            | Acceptance tetap belum diverifikasi penuh.    | Cocokkan seluruh `IT/CT/E2E` ID dan simpan output per AC.                          |
| AC-6, AC-7 | Filter/search/sort UI, export state, real two-engine browser flow, dan direct explorer-to-data-browser navigation sudah terbukti; visual/accessibility serta seluruh matrix acceptance masih belum lengkap. | Acceptance UI tetap parsial.                  | Lengkapi review visual/accessibility dan proof AC yang tersisa.                    |
| AC-8, AC-9 | NFR-01 provider proof PostgreSQL dan real-engine read flow tersedia; security matrix, performance browser, dan pembukaan langsung dari explorer belum lengkap.                                              | NFR dan acceptance dua engine belum tertutup. | Lengkapi security matrix, browser performance, dan explorer-to-data-browser proof. |

## Verdict akhir

Belum diverifikasi. Status ini hanya boleh berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau.
