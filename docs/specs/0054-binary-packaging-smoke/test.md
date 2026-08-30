# Test dan acceptance criteria 0054. Packaging binary dan smoke test

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Parsial lokal — packaging/release invariant suite lulus 17 test/85 assertions; lima target binary berhasil dikompilasi, checksum/size report lulus, dan macOS ARM64 smoke tanpa database lulus; hosted release workflow, clean environment, serta database smoke seluruh target belum tersedia.
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0054.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

`scripts/build/build-web.ts` menghasilkan build production Angular ke `dist/web/`; `embed-web-assets.ts` menghasilkan modul manifest aset (path, konten, tipe MIME, hash untuk caching header) yang ikut terkompilasi; server menyajikan dari manifest ini pada mode release (spec 0006 AC-5).

### AC-2

`compile-binary.ts` menjalankan Bun Compile dengan entrypoint `apps/cli/src/main.ts` untuk kelima target lintas platform (cross compile dari runner CI), menghasilkan `dist/binaries/<target>/myadmin[.exe]`; versi dan commit hash di inject saat build (dipakai `version`, spec 0006 AC-6).

### AC-3

`checksums.ts` menghasilkan SHA-256 per artefak dalam satu file checksum; hasil build deterministik sejauh toolchain memungkinkan (input build dipin: versi Bun, lockfile).

### AC-4

harness smoke test (`scripts/verify/smoke-binary.ts`) menjalankan binary nyata pada data directory sementara dan membuktikan lewat HTTP: proses start dan health 200; `GET /` menyajikan SPA (bukti embed); setup admin; login dan `GET /auth/me`; tambah koneksi ke database test dan connect sukses; SIGTERM shutdown rapi exit 0; `doctor` exit 0 pada instalasi sehat (Definition of Done butir 4).

### AC-5

workflow CI `release.yml`: berjalan pada tag; prasyarat hijau: ci, contract, integration, security; lalu build web, kompilasi lima target, checksum, smoke test per target yang bisa dijalankan runner yang tersedia (linux-x64 dan macos di runner masing masing; target yang tidak bisa diuji runner ditandai jelas di ringkasan rilis, NFR-05 "per target yang tersedia"); artefak diunggah sebagai output workflow.

### AC-6

ukuran dan isi dipantau: laporan ukuran binary per target di ringkasan; kegagalan embed (aset hilang) terdeteksi smoke test (halaman SPA gagal berarti gagal).

### AC-7

dokumentasi singkat cara menjalankan tiap platform (file README rilis) dihasilkan bersama artefak (FR-RUN-02 "dokumentasi cara menjalankan").

## Matriks cakupan

| AC            | Unit          | Integration   | Contract | E2E            | Security       | Performance     | Visual | Smoke            | Manual atau external |
| ------------- | ------------- | ------------- | -------- | -------------- | -------------- | --------------- | ------ | ---------------- | -------------------- |
| [AC-1](#ac-1) | `UT-0054-AC1` | `IT-0054-AC1` | n/a      | n/a            | n/a            | n/a             | n/a    | `SMOKE-0054-AC1` | n/a                  |
| [AC-2](#ac-2) | n/a           | `IT-0054-AC2` | n/a      | n/a            | n/a            | n/a             | n/a    | `SMOKE-0054-AC2` | n/a                  |
| [AC-3](#ac-3) | `UT-0054-AC3` | `IT-0054-AC3` | n/a      | n/a            | `SEC-0054-AC3` | n/a             | n/a    | `SMOKE-0054-AC3` | n/a                  |
| [AC-4](#ac-4) | n/a           | `IT-0054-AC4` | n/a      | `E2E-0054-AC4` | `SEC-0054-AC4` | n/a             | n/a    | `SMOKE-0054-AC4` | n/a                  |
| [AC-5](#ac-5) | n/a           | `IT-0054-AC5` | n/a      | n/a            | n/a            | n/a             | n/a    | `SMOKE-0054-AC5` | `MANUAL-0054-AC5`    |
| [AC-6](#ac-6) | n/a           | `IT-0054-AC6` | n/a      | n/a            | n/a            | `PERF-0054-AC6` | n/a    | `SMOKE-0054-AC6` | n/a                  |
| [AC-7](#ac-7) | n/a           | `IT-0054-AC7` | n/a      | n/a            | n/a            | n/a             | n/a    | `SMOKE-0054-AC7` | `MANUAL-0054-AC7`    |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

| ID            | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                                       | Expected result                                      |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `UT-0054-AC1` | [AC-1](#ac-1) | scripts/build/build-web.ts menghasilkan build production Angular ke dist/web/; embed-web-assets.ts menghasilkan modul manifest aset (path, konten, tipe MIME,... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `UT-0054-AC3` | [AC-3](#ac-3) | checksums.ts menghasilkan SHA-256 per artefak dalam satu file checksum; hasil build deterministik sejauh toolchain memungkinkan (input build dipin: versi Bun... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |

## Integration test

| ID            | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                         | Expected result                                      |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `IT-0054-AC1` | [AC-1](#ac-1) | scripts/build/build-web.ts menghasilkan build production Angular ke dist/web/; embed-web-assets.ts menghasilkan modul manifest aset (path, konten, tipe MIME,... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `IT-0054-AC2` | [AC-2](#ac-2) | compile-binary.ts menjalankan Bun Compile dengan entrypoint apps/cli/src/main.ts untuk kelima target lintas platform (cross compile dari runner CI), menghasi... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `IT-0054-AC3` | [AC-3](#ac-3) | checksums.ts menghasilkan SHA-256 per artefak dalam satu file checksum; hasil build deterministik sejauh toolchain memungkinkan (input build dipin: versi Bun... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `IT-0054-AC4` | [AC-4](#ac-4) | harness smoke test (scripts/verify/smoke-binary.ts) menjalankan binary nyata pada data directory sementara dan membuktikan lewat HTTP: proses start dan healt... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `IT-0054-AC5` | [AC-5](#ac-5) | workflow CI release.yml: berjalan pada tag; prasyarat hijau: ci, contract, integration, security; lalu build web, kompilasi lima target, checksum, smoke test... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `IT-0054-AC6` | [AC-6](#ac-6) | ukuran dan isi dipantau: laporan ukuran binary per target di ringkasan; kegagalan embed (aset hilang) terdeteksi smoke test (halaman SPA gagal berarti gagal).   | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `IT-0054-AC7` | [AC-7](#ac-7) | dokumentasi singkat cara menjalankan tiap platform (file README rilis) dihasilkan bersama artefak (FR-RUN-02 "dokumentasi cara menjalankan").                    | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

## Test tambahan

### Contract test

Tidak ada contract yang diwajibkan oleh acceptance criteria saat ini.

### E2E

| ID             | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                       | Expected result                                      |
| -------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------- |
| `E2E-0054-AC4` | [AC-4](#ac-4) | harness smoke test (scripts/verify/smoke-binary.ts) menjalankan binary nyata pada data directory sementara dan membuktikan lewat HTTP: proses start dan healt... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |

### Security

| ID             | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                               | Expected result                                      |
| -------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `SEC-0054-AC3` | [AC-3](#ac-3) | checksums.ts menghasilkan SHA-256 per artefak dalam satu file checksum; hasil build deterministik sejauh toolchain memungkinkan (input build dipin: versi Bun... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `SEC-0054-AC4` | [AC-4](#ac-4) | harness smoke test (scripts/verify/smoke-binary.ts) menjalankan binary nyata pada data directory sementara dan membuktikan lewat HTTP: proses start dan healt... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |

### Performance

| ID              | AC            | Fokus                                                                                                                                                          | Scenario terencana                                                               | Expected result                                      |
| --------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `PERF-0054-AC6` | [AC-6](#ac-6) | ukuran dan isi dipantau: laporan ukuran binary per target di ringkasan; kegagalan embed (aset hilang) terdeteksi smoke test (halaman SPA gagal berarti gagal). | Tetapkan dataset, baseline, ambang, pengulangan, dan toleransi sebelum eksekusi. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

### Visual dan accessibility

Tidak ada visual dan accessibility yang diwajibkan oleh acceptance criteria saat ini.

### Smoke dan operational acceptance

| ID               | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                   | Expected result                                      |
| ---------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `SMOKE-0054-AC1` | [AC-1](#ac-1) | scripts/build/build-web.ts menghasilkan build production Angular ke dist/web/; embed-web-assets.ts menghasilkan modul manifest aset (path, konten, tipe MIME,... | Jalankan artefak atau workflow pada environment bersih dan simpan bukti operasional. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `SMOKE-0054-AC2` | [AC-2](#ac-2) | compile-binary.ts menjalankan Bun Compile dengan entrypoint apps/cli/src/main.ts untuk kelima target lintas platform (cross compile dari runner CI), menghasi... | Jalankan artefak atau workflow pada environment bersih dan simpan bukti operasional. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `SMOKE-0054-AC3` | [AC-3](#ac-3) | checksums.ts menghasilkan SHA-256 per artefak dalam satu file checksum; hasil build deterministik sejauh toolchain memungkinkan (input build dipin: versi Bun... | Jalankan artefak atau workflow pada environment bersih dan simpan bukti operasional. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `SMOKE-0054-AC4` | [AC-4](#ac-4) | harness smoke test (scripts/verify/smoke-binary.ts) menjalankan binary nyata pada data directory sementara dan membuktikan lewat HTTP: proses start dan healt... | Jalankan artefak atau workflow pada environment bersih dan simpan bukti operasional. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `SMOKE-0054-AC5` | [AC-5](#ac-5) | workflow CI release.yml: berjalan pada tag; prasyarat hijau: ci, contract, integration, security; lalu build web, kompilasi lima target, checksum, smoke test... | Jalankan artefak atau workflow pada environment bersih dan simpan bukti operasional. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `SMOKE-0054-AC6` | [AC-6](#ac-6) | ukuran dan isi dipantau: laporan ukuran binary per target di ringkasan; kegagalan embed (aset hilang) terdeteksi smoke test (halaman SPA gagal berarti gagal).   | Jalankan artefak atau workflow pada environment bersih dan simpan bukti operasional. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `SMOKE-0054-AC7` | [AC-7](#ac-7) | dokumentasi singkat cara menjalankan tiap platform (file README rilis) dihasilkan bersama artefak (FR-RUN-02 "dokumentasi cara menjalankan").                    | Jalankan artefak atau workflow pada environment bersih dan simpan bukti operasional. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

### Manual atau external proof

| ID                | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                               | Expected result                                      |
| ----------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `MANUAL-0054-AC5` | [AC-5](#ac-5) | workflow CI release.yml: berjalan pada tag; prasyarat hijau: ci, contract, integration, security; lalu build web, kompilasi lima target, checksum, smoke test... | Tag workflow, runner platform, dan upload artefak harus dibuktikan pada CI nyata.                | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `MANUAL-0054-AC7` | [AC-7](#ac-7) | dokumentasi singkat cara menjalankan tiap platform (file README rilis) dihasilkan bersama artefak (FR-RUN-02 "dokumentasi cara menjalankan").                    | Lakukan review manusia atau kumpulkan bukti eksternal yang tidak dapat digantikan test otomatis. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

## Critical test scenarios

- Smoke penuh pada linux-x64 dan macos-arm64 (runner tersedia), verifikasi **AC-4**, **AC-5**.
- Embed: menghapus satu aset dari manifest membuat smoke gagal (uji harness), verifikasi **AC-6**.
- Determinisme dasar: dua build beruntun dari commit sama menghasilkan checksum yang sama pada target yang sama, verifikasi **AC-3**.

## Staged, environment, dan external proof

| AC            | Jenis bukti | Kewajiban                                                                         |
| ------------- | ----------- | --------------------------------------------------------------------------------- |
| [AC-5](#ac-5) | `external`  | Tag workflow, runner platform, dan upload artefak harus dibuktikan pada CI nyata. |

## Fixture dan environment

| Area         | Aturan                                                                                                         |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| Data         | Gunakan data sintetis atau tersanitasi. Jangan memakai credential, token, atau data produksi nyata.            |
| Resource     | Database, file, port, process, dan container harus disposable serta memiliki cleanup deterministik.            |
| Version      | Pin versi environment yang dibuktikan. Jangan memakai label dinamis seperti `latest` sebagai bukti acceptance. |
| Root command | Instalasi dan command test selalu dimulai dari akar repo dan satu `package.json`.                              |

## Exit criteria test

- Setiap AC memiliki test ID atau jalur proof yang eksplisit pada [verify.md](verify.md).
- Unit dan integration test yang relevan diimplementasikan, lulus, dan dapat diulang dari checkout bersih.
- Test yang tidak relevan ditandai `n/a` dengan alasan yang tetap benar setelah implementasi.
- External proof tidak boleh diganti local smoke test. Staged proof tidak boleh ditutup sebelum dependency yang disebut tersedia.
- Tidak ada test yang dianggap lulus hanya karena file atau placeholder tersedia.
