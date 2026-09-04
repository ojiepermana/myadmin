# Verify 0038. Data browser: jalur tulis

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

| AC                   | Test atau proof ID                                           | Metode                                | Bukti wajib                                                | Result                                                                                                                                                                                                                            |
| -------------------- | ------------------------------------------------------------ | ------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [AC-1](test.md#ac-1) | `UT-0038-AC1`, `IT-0038-AC1`, `CT-0038-AC1`, `E2E-0038-AC1`  | Unit, Integration, Contract, E2E      | output command dan assertion                               | Lokal lulus: kedua provider menandai tabel tanpa identity sebagai read only, route meneruskan reason, dan browser menyembunyikan aksi edit/add row.                                                                               |
| [AC-2](test.md#ac-2) | `UT-0038-AC2`, `IT-0038-AC2`, `CT-0038-AC2`, `E2E-0038-AC2`  | Unit, Integration, Contract, E2E      | output command dan assertion                               | E2E lokal lulus pada `zz-data-browser.spec.ts`; integration/contract tetap mengikuti suite masing-masing                                                                                                                          |
| [AC-3](test.md#ac-3) | `UT-0038-AC3`, `IT-0038-AC3`, `CT-0038-AC3`, `E2E-0038-AC3`  | Unit, Integration, Contract, E2E      | output command dan assertion                               | Browser mock membuktikan conflict HTTP 409 ditampilkan setelah update stale; provider mutation tests lulus, seluruh evidence per layer belum dipisahkan                                                                           |
| [AC-4](test.md#ac-4) | `IT-0038-AC4`, `CT-0038-AC4`, `E2E-0038-AC4`, `SEC-0038-AC4` | Integration, Contract, E2E, Security  | output command dan assertion; log tersanitasi tanpa secret | E2E lokal update/delete lulus dengan identity dan exact confirmation; integration/contract/security tetap diperlukan                                                                                                              |
| [AC-5](test.md#ac-5) | `UT-0038-AC5`, `E2E-0038-AC5`                                | Unit, E2E                             | output command dan assertion                               | Parsial lokal; real browser PostgreSQL/MySQL membuktikan edit JSON melalui editor bertipe dan mempertahankan NULL eksplisit, tetapi seluruh typed-type matrix belum                                                               |
| [AC-6](test.md#ac-6) | `UT-0038-AC6`, `IT-0038-AC6`, `CT-0038-AC6`, `SEC-0038-AC6`  | Unit, Integration, Contract, Security | output command dan assertion; log tersanitasi tanpa secret | Parsial lokal; unit, contract, provider-builder security, dan provider integration kedua engine lulus untuk typed binding serta invalid number/binary safety, tetapi real application route security boundary masih belum lengkap |
| [AC-7](test.md#ac-7) | `IT-0038-AC7`, `SEC-0038-AC7`                                | Integration, Security                 | output command dan assertion; log tersanitasi tanpa secret | Integration membuktikan audited delete dan audit retrieval; security matrix khusus belum                                                                                                                                          |
| [AC-8](test.md#ac-8) | `IT-0038-AC8`                                                | Integration                           | output command dan assertion                               | Integration membuktikan typed insert/update/delete flow; full acceptance matrix dan real-engine roundtrip belum                                                                                                                   |
| [AC-9](test.md#ac-9) | `IT-0038-AC9`, `E2E-0038-AC9`                                | Integration, E2E                      | output command dan assertion                               | Lulus pada route fixture dua engine dan real-engine browser typed mutation/stale conflict; bulk-delete/read-only browser evidence tetap mengikuti test coverage yang tercatat terpisah                                            |

## Urutan verifikasi

1. Catat commit, versi Bun, sistem operasi, dan environment yang benar benar dipakai.
2. Dari akar repo, jalankan pemeriksaan satu manifest, lint, typecheck, serta command test yang tersedia pada `package.json` akar.
3. Jalankan seluruh test ID pada matriks sesuai jenisnya. Jangan mengganti integration atau operational proof dengan mock.
4. Kumpulkan manual, staged, environment, atau external proof yang ditetapkan. Jangan menandainya lulus bila dependency belum tersedia.
5. Simpan evidence yang tersanitasi, lalu isi result per AC dan verdict akhir.

## Pemeriksaan otomatis

| Area        | Command source                                        | Expected result                                                  |
| ----------- | ----------------------------------------------------- | ---------------------------------------------------------------- |
| Unit        | Script root yang didaftarkan pada satu `package.json` | Semua `UT-0038-*` lulus dan memiliki assertion yang menutup AC.  |
| Integration | Script root yang didaftarkan pada satu `package.json` | Resource nyata disposable dipakai dan cleanup lulus.             |
| Contract    | Script root yang didaftarkan pada satu `package.json` | Semua `CT-0038-*` lulus dan memiliki assertion yang menutup AC.  |
| E2E         | Script root yang didaftarkan pada satu `package.json` | Semua `E2E-0038-*` lulus dan memiliki assertion yang menutup AC. |
| Security    | Script root yang didaftarkan pada satu `package.json` | Semua `SEC-0038-*` lulus dan memiliki assertion yang menutup AC. |

## Pemeriksaan manual, staged, environment, atau external

Tidak ada manual atau external proof khusus yang diidentifikasi. Pemeriksaan reviewer tetap wajib untuk evidence otomatis.

## Catatan eksekusi

| 2026-08-30 | working tree | Playwright local web server dengan API fixture | Data Browser UI **2 passed dalam 7,9 detik**; insert/update/delete, conflict, dan typed editing workflow lulus. | [Data Browser UI evidence](../evidence/2026-08-30-data-browser-ui.md) |

| 2026-08-30 | working tree | Playwright dengan PostgreSQL/MySQL disposable | Real Data Browser E2E **1 passed dalam 8,0 detik**; edit JSON dan explicit `NULL` preservation lulus pada kedua engine. | [Real data browser typed evidence](../evidence/2026-08-30-real-data-browser-typed.md) |

| 2026-08-30 | working tree | Playwright dengan PostgreSQL dan MySQL disposable | Real workflow E2E **4 passed dalam 2,6 menit** mencakup write-related query and failure boundaries pada dua engine. | [Real query workflow evidence](../evidence/2026-08-30-real-query-workflows.md) |

| Waktu      | Commit       | Environment                                                                                   | Hasil                                                                                                                                                                                       | Evidence                                                                                                                                                                                                                                                                                                        |
| ---------- | ------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-29 | Working tree | Bun 1.4.0, server route integration dengan fake provider                                      | Data-browser write routes lulus typed insert/update/delete, audit, invalidation, dan conflict mapping HTTP 409; file yang sama juga menjalankan view cases; **6 pass, 52 assertions** total | `bun test tests/integration/data-browser/data-browser.test.ts`                                                                                                                                                                                                                                                  |
| 2026-08-29 | Working tree | Bun 1.4.0, contract dan service tests                                                         | Contract data-browser/mutation serta table-operation service checks **6 pass, 13 assertions**                                                                                               | `bun test apps/server/test/table-operations.test.ts tests/contract/data-browser.test.ts`                                                                                                                                                                                                                        |
| 2026-08-29 | Working tree | Bun 1.4.0, PostgreSQL/MySQL query builder dan data-browser contract                           | **15 pass, 36 assertions**; typed parameterization, invalid values, defaults, contract mutation schema, dan injection-safe quoting lulus                                                    | `bun test packages/database-postgresql/test/data.test.ts packages/database-mysql/test/data.test.ts tests/contract/data-browser.test.ts`                                                                                                                                                                         |
| 2026-08-30 | Working tree | Bun 1.4.0, Playwright local web server, PostgreSQL disposable 55433 dan MySQL disposable 3380 | **1 E2E pass, 0 fail** dalam 7,5 detik; UI mengedit JSON, mempertahankan NULL eksplisit, lalu menampilkan reload warning setelah stale PATCH mendapat HTTP 409 pada kedua engine            | `MYADMIN_REAL_DATABASE_E2E=1 MYADMIN_POSTGRES_CURRENT_PORT=55433 MYADMIN_POSTGRES_PORT=55433 MYADMIN_POSTGRES_DATABASE=myadmin_test MYADMIN_POSTGRES_USER=myadmin_test MYADMIN_POSTGRES_PASSWORD=myadmin_test_password MYSQL_8_0_URL=... bunx playwright test tests/e2e/web/zz-real-data-browser-typed.spec.ts` |

| Waktu      | Commit       | Environment                                                        | Hasil                                                                                                                                          | Evidence                                                                                                                                                                                                                                     |
| ---------- | ------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-30 | Working tree | Browser mock, local web server                                     | **1 E2E lulus dalam 6,7 detik**; update/delete payload, exact confirmation, HTTP 409 conflict, pesan reload, dan penutupan dialog teramati     | `bunx playwright test tests/e2e/web/zz-data-browser.spec.ts` dan `docs/specs/evidence/2026-08-29-browser.md`                                                                                                                                 |
| 2026-08-30 | Working tree | Bun 1.4.0, bundled OpenAPI contract                                | Contract suite **75 pass, 0 fail, 820 assertions**; `CT-0038-AC6` memvalidasi response 422 `DATA_INVALID` dengan column-specific details       | `bun run test:contract -- tests/contract/data-browser.test.ts`; `tests/contract/data-browser.test.ts`                                                                                                                                        |
| 2026-08-30 | Working tree | Bun 1.4.0, PostgreSQL/MySQL provider query builders                | **12 pass, 0 fail, 34 assertions**; invalid number dan binary value ditolak dengan pesan spesifik kolom sebelum SQL execution                  | `bun test --isolate packages/database-postgresql/test/data.test.ts packages/database-mysql/test/data.test.ts`                                                                                                                                |
| 2026-08-30 | Working tree | PostgreSQL disposable 55433, MySQL 8.0/latest disposable 3380/3384 | PostgreSQL **15 pass, 49 assertions**; MySQL **24 pass, 86 assertions**; typed insert dan invalid numeric conversion diuji pada database nyata | `MYADMIN_POSTGRES_INTEGRATION=1 bun test --isolate tests/integration/postgresql/provider.test.ts`; `MYADMIN_MYSQL_SECURITY_INTEGRATION=1 MYSQL_8_0_URL=... MYSQL_LATEST_URL=... bun test --isolate tests/integration/mysql/provider.test.ts` |
| 2026-08-29 | Working tree | PostgreSQL disposable 55433 dan MySQL disposable 3380, browser UI  | **4 real E2E pass dalam 2,4 menit**; mutation flow dua engine dan related schema/view/index flows lulus                                        | `MYADMIN_REAL_DATABASE_E2E=1 bun run test:e2e -- tests/e2e/web/zz-real-query-editor.spec.ts`                                                                                                                                                 |

## Gap dan blocker

| AC                     | Gap                                                                                                                                                         | Dampak                                                         | Tindak lanjut                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| AC-2, AC-4             | E2E mock insert/update/delete dan integration provider tersedia; contract/security ID tertentu belum terpetakan eksplisit.                                  | Acceptance tetap parsial.                                      | Tambahkan atau petakan contract/security proof untuk setiap mutation boundary. |
| AC-3, AC-5, AC-6, AC-7 | Conflict mapping route dan browser conflict proof tersedia; typed validation, audit, dan read-only/error boundary belum seluruhnya dibuktikan pada browser. | Failure/security acceptance belum tertutup penuh.              | Lengkapi typed-editor, read-only, dan security/audit proof.                    |
| AC-9                   | Route integration dua engine dan real-engine mutation browser flow kini lulus, termasuk stale-row conflict HTTP 409.                                        | Acceptance lokal untuk AC-9 tercatat lengkap sesuai test plan. | Pertahankan cleanup fixture dan reviewer sign-off.                             |

## Verdict akhir

Belum diverifikasi. Status ini hanya boleh berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau.

## Catatan audit 2026-09-04

Audit 2026-09-04 menemukan identitas baris dikonversi lewat `Number()`, sehingga kunci integer di atas 2^53 kehilangan presisi dan sebuah UPDATE atau DELETE dapat mengenai baris lain. Pada PostgreSQL nyata satu identitas bahkan cocok dengan dua baris. Klaim verifikasi jalur tulis pada file ini tidak valid untuk periode sebelum perbaikan. Perbaikan dan buktinya ada pada [spec 0057 AC-2](../0057-audit-remediation-wave-1/test.md#ac-2).
