# Test dan acceptance criteria 0053. Hardening keamanan lintas fitur

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Parsial lokal — `bun run test:security` lulus 40 test/968 assertions, termasuk observability redaction dan secret scanner; hosted `security.yml`, clean environment, dan operational proof belum tersedia.
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0053.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

standar redaction terdokumentasi dan ditegakkan: semua saluran keluar (log, ApiError, audit details, event WS, output doctor, stderr subprocess yang diteruskan) melewati modul redaction spec 0011; test lintas menyuntik secret penanda ke setiap saluran dan memastikan tidak lolos.

### AC-2

sweep fixture dan test data: `tests/fixtures/` dan seluruh test bebas credential nyata (pemindai pola secret berjalan di CI atas fixture dan source test); pelanggaran menggagalkan CI.

### AC-3

header keamanan HTTP terpasang di server: Content-Security-Policy yang cocok untuk SPA yang di embed (default-src 'self', larangan inline script kecuali yang build Angular butuhkan dengan hash), X-Content-Type-Options nosniff, Referrer-Policy, X-Frame-Options DENY, dan Cache-Control no-store untuk response API; dibuktikan test header.

### AC-4

standar rate limiting terdefinisi di satu modul dan terpasang minimal pada: setup, login, test connection, upload; nilai terdokumentasi; test membuktikan 429 bekerja dan pulih.

### AC-5

matriks e2e otorisasi dijalankan: untuk setiap kelompok endpoint, tiga aktor (anonim, user, admin) diuji terhadap harapan (401/403/200) dari tabel yang digenerate dari kontrak (operasi plus anotasi auth nya); endpoint baru tanpa baris matriks menggagalkan test (kelengkapan dipaksa).

### AC-6

verifikasi enkripsi at rest menyeluruh: test yang membuat data lengkap (user, koneksi dengan credential, history) lalu memindai byte file SQLite untuk penanda secret; lolos berarti Definition of Done butir 5 terbukti.

### AC-7

audit destructive lengkap: test menyisir taksonomi audit terhadap daftar operasi destructive dari seluruh spec (drop, truncate, delete, restore, revoke, reset credential, import destructive) dan memastikan setiap alurnya menghasilkan event (Definition of Done butir 8).

### AC-8

workflow CI `security.yml` menjalankan seluruh suite keamanan dan pemindai; menjadi gerbang wajib rilis (spec 0054 bergantung padanya).

## Matriks cakupan

| AC            | Unit          | Integration   | Contract      | E2E            | Security       | Performance | Visual | Smoke            | Manual atau external |
| ------------- | ------------- | ------------- | ------------- | -------------- | -------------- | ----------- | ------ | ---------------- | -------------------- |
| [AC-1](#ac-1) | `UT-0053-AC1` | `IT-0053-AC1` | n/a           | `E2E-0053-AC1` | `SEC-0053-AC1` | n/a         | n/a    | n/a              | n/a                  |
| [AC-2](#ac-2) | n/a           | n/a           | n/a           | n/a            | `SEC-0053-AC2` | n/a         | n/a    | `SMOKE-0053-AC2` | n/a                  |
| [AC-3](#ac-3) | n/a           | `IT-0053-AC3` | n/a           | `E2E-0053-AC3` | `SEC-0053-AC3` | n/a         | n/a    | n/a              | n/a                  |
| [AC-4](#ac-4) | `UT-0053-AC4` | `IT-0053-AC4` | n/a           | n/a            | `SEC-0053-AC4` | n/a         | n/a    | n/a              | n/a                  |
| [AC-5](#ac-5) | n/a           | n/a           | `CT-0053-AC5` | `E2E-0053-AC5` | `SEC-0053-AC5` | n/a         | n/a    | n/a              | n/a                  |
| [AC-6](#ac-6) | n/a           | `IT-0053-AC6` | n/a           | n/a            | `SEC-0053-AC6` | n/a         | n/a    | n/a              | n/a                  |
| [AC-7](#ac-7) | n/a           | `IT-0053-AC7` | n/a           | `E2E-0053-AC7` | `SEC-0053-AC7` | n/a         | n/a    | n/a              | n/a                  |
| [AC-8](#ac-8) | n/a           | `IT-0053-AC8` | n/a           | n/a            | n/a            | n/a         | n/a    | `SMOKE-0053-AC8` | `MANUAL-0053-AC8`    |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

| ID            | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                                       | Expected result                                      |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `UT-0053-AC1` | [AC-1](#ac-1) | standar redaction terdokumentasi dan ditegakkan: semua saluran keluar (log, ApiError, audit details, event WS, output doctor, stderr subprocess yang diterusk... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `UT-0053-AC4` | [AC-4](#ac-4) | standar rate limiting terdefinisi di satu modul dan terpasang minimal pada: setup, login, test connection, upload; nilai terdokumentasi; test membuktikan 429... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |

## Integration test

| ID            | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                         | Expected result                                      |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `IT-0053-AC1` | [AC-1](#ac-1) | standar redaction terdokumentasi dan ditegakkan: semua saluran keluar (log, ApiError, audit details, event WS, output doctor, stderr subprocess yang diterusk... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `IT-0053-AC3` | [AC-3](#ac-3) | header keamanan HTTP terpasang di server: Content-Security-Policy yang cocok untuk SPA yang di embed (default-src 'self', larangan inline script kecuali yang... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `IT-0053-AC4` | [AC-4](#ac-4) | standar rate limiting terdefinisi di satu modul dan terpasang minimal pada: setup, login, test connection, upload; nilai terdokumentasi; test membuktikan 429... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `IT-0053-AC6` | [AC-6](#ac-6) | verifikasi enkripsi at rest menyeluruh: test yang membuat data lengkap (user, koneksi dengan credential, history) lalu memindai byte file SQLite untuk penand... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `IT-0053-AC7` | [AC-7](#ac-7) | audit destructive lengkap: test menyisir taksonomi audit terhadap daftar operasi destructive dari seluruh spec (drop, truncate, delete, restore, revoke, rese... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |
| `IT-0053-AC8` | [AC-8](#ac-8) | workflow CI security.yml menjalankan seluruh suite keamanan dan pemindai; menjadi gerbang wajib rilis (spec 0054 bergantung padanya).                            | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

## Test tambahan

### Contract test

| ID            | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                          | Expected result                                      |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `CT-0053-AC5` | [AC-5](#ac-5) | matriks e2e otorisasi dijalankan: untuk setiap kelompok endpoint, tiga aktor (anonim, user, admin) diuji terhadap harapan (401/403/200) dari tabel yang digen... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |

### E2E

| ID             | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                       | Expected result                                      |
| -------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------- |
| `E2E-0053-AC1` | [AC-1](#ac-1) | standar redaction terdokumentasi dan ditegakkan: semua saluran keluar (log, ApiError, audit details, event WS, output doctor, stderr subprocess yang diterusk... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `E2E-0053-AC3` | [AC-3](#ac-3) | header keamanan HTTP terpasang di server: Content-Security-Policy yang cocok untuk SPA yang di embed (default-src 'self', larangan inline script kecuali yang... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `E2E-0053-AC5` | [AC-5](#ac-5) | matriks e2e otorisasi dijalankan: untuk setiap kelompok endpoint, tiga aktor (anonim, user, admin) diuji terhadap harapan (401/403/200) dari tabel yang digen... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `E2E-0053-AC7` | [AC-7](#ac-7) | audit destructive lengkap: test menyisir taksonomi audit terhadap daftar operasi destructive dari seluruh spec (drop, truncate, delete, restore, revoke, rese... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

### Security

| ID             | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                               | Expected result                                      |
| -------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `SEC-0053-AC1` | [AC-1](#ac-1) | standar redaction terdokumentasi dan ditegakkan: semua saluran keluar (log, ApiError, audit details, event WS, output doctor, stderr subprocess yang diterusk... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `SEC-0053-AC2` | [AC-2](#ac-2) | sweep fixture dan test data: tests/fixtures/ dan seluruh test bebas credential nyata (pemindai pola secret berjalan di CI atas fixture dan source test); pela... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `SEC-0053-AC3` | [AC-3](#ac-3) | header keamanan HTTP terpasang di server: Content-Security-Policy yang cocok untuk SPA yang di embed (default-src 'self', larangan inline script kecuali yang... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `SEC-0053-AC4` | [AC-4](#ac-4) | standar rate limiting terdefinisi di satu modul dan terpasang minimal pada: setup, login, test connection, upload; nilai terdokumentasi; test membuktikan 429... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `SEC-0053-AC5` | [AC-5](#ac-5) | matriks e2e otorisasi dijalankan: untuk setiap kelompok endpoint, tiga aktor (anonim, user, admin) diuji terhadap harapan (401/403/200) dari tabel yang digen... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `SEC-0053-AC6` | [AC-6](#ac-6) | verifikasi enkripsi at rest menyeluruh: test yang membuat data lengkap (user, koneksi dengan credential, history) lalu memindai byte file SQLite untuk penand... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `SEC-0053-AC7` | [AC-7](#ac-7) | audit destructive lengkap: test menyisir taksonomi audit terhadap daftar operasi destructive dari seluruh spec (drop, truncate, delete, restore, revoke, rese... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

### Performance

Tidak ada performance yang diwajibkan oleh acceptance criteria saat ini.

### Visual dan accessibility

Tidak ada visual dan accessibility yang diwajibkan oleh acceptance criteria saat ini.

### Smoke dan operational acceptance

| ID               | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                   | Expected result                                      |
| ---------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `SMOKE-0053-AC2` | [AC-2](#ac-2) | sweep fixture dan test data: tests/fixtures/ dan seluruh test bebas credential nyata (pemindai pola secret berjalan di CI atas fixture dan source test); pela... | Jalankan artefak atau workflow pada environment bersih dan simpan bukti operasional. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `SMOKE-0053-AC8` | [AC-8](#ac-8) | workflow CI security.yml menjalankan seluruh suite keamanan dan pemindai; menjadi gerbang wajib rilis (spec 0054 bergantung padanya).                            | Jalankan artefak atau workflow pada environment bersih dan simpan bukti operasional. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

### Manual atau external proof

| ID                | AC            | Fokus                                                                                                                                 | Scenario terencana                                       | Expected result                                      |
| ----------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------- |
| `MANUAL-0053-AC8` | [AC-8](#ac-8) | workflow CI security.yml menjalankan seluruh suite keamanan dan pemindai; menjadi gerbang wajib rilis (spec 0054 bergantung padanya). | Workflow `security.yml` harus dibuktikan pada hosted CI. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

## Critical test scenarios

- Suntik: password penanda dilempar lewat error provider → tidak muncul di log, ApiError, audit, WS, verifikasi **AC-1**.
- Kelengkapan: operasi kontrak baru tanpa baris matriks → test gagal, verifikasi **AC-5**.
- At rest: file db bebas penanda secret, verifikasi **AC-6**.

## Staged, environment, dan external proof

| AC            | Jenis bukti | Kewajiban                                                |
| ------------- | ----------- | -------------------------------------------------------- |
| [AC-8](#ac-8) | `external`  | Workflow `security.yml` harus dibuktikan pada hosted CI. |

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
