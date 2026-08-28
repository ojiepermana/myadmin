# Test dan acceptance criteria 0017. Login, logout, dan session

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Dijalankan 2026-08-29 melalui `bun run test` dan suite auth/session terarah; 555 pass, 8 skip karena fixture database, 0 fail pada checkout setelah perubahan audit.
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0017.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

`POST /auth/login` memverifikasi kredensial; sukses membuat baris session dan menyetel cookie `myadmin_session` HttpOnly, SameSite=Lax, Path=/, Secure bila `security.secureCookies` aktif; nilai cookie adalah token acak 256 bit yang hanya disimpan sebagai hash (SHA-256) di kolom `token_hash`.

### AC-2

kegagalan login menjawab 401 `AUTH_INVALID_CREDENTIALS` dengan pesan tunggal yang tidak membedakan username salah dari password salah, dan berjalan dalam waktu yang tidak membedakan keduanya (verifikasi hash dummy saat user tidak ada).

### AC-3

login di rate limit per IP dan per username (5 kegagalan per menit lalu jeda bertahap); user nonaktif ditolak dengan pesan yang sama dengan kredensial salah.

### AC-4

middleware sesi menegakkan di setiap request non publik: token valid, belum `revoked_at`, belum lewat idle timeout (`last_seen_at` plus `session.idleTimeoutMinutes`) dan belum lewat absolut (`created_at` plus `session.absoluteTimeoutHours`); pelanggaran menjawab 401 `SESSION_EXPIRED` dan menghapus cookie; `last_seen_at` diperbarui hemat (paling sering sekali per menit).

### AC-5

upgrade WebSocket memakai cookie sesi yang sama; sesi yang kadaluarsa atau dicabut memutus koneksi WS aktif pada pemeriksaan berikutnya (paling lambat 60 detik) dengan kode tutup yang jelas (FR-AUTH-05 mencakup WS).

### AC-6

`POST /auth/logout` mencabut sesi aktif (`revoked_at`), menghapus cookie, dan mencatat audit; `GET /auth/me` mengembalikan user dan role untuk sesi valid.

### AC-7

perlindungan CSRF: semua request mutasi non publik wajib membawa header `X-Myadmin-Csrf: 1` (dipasang otomatis SDK); server menolak mutasi tanpa header itu, dan memvalidasi `Origin`/`Sec-Fetch-Site` bila ada; kombinasi dengan SameSite=Lax menutup form cross site.

### AC-8

di web: route guard mengalihkan pengunjung tanpa sesi ke `/login`, event `sessionExpired` dari SDK (spec 0005) membersihkan state klien dan mengalihkan ke login tanpa menyisakan data sesi; halaman login memakai form foundation dan bisa diselesaikan keyboard.

### AC-9

login sukses, login gagal (dengan alasan tersamar di klien namun kategori tercatat), dan logout menghasilkan audit event tanpa password; sesi kadaluarsa yang dibersihkan tidak membanjiri audit (pembersihan bukan event per baris).

### AC-10

pembersihan sesi kadaluarsa berjalan berkala di server (interval per jam) lewat `SessionRepository.deleteExpired`.

## Matriks cakupan

| AC              | Unit | Integration    | Contract | E2E            | Security       | Performance     | Visual         | Smoke | Manual atau external |
| --------------- | ---- | -------------- | -------- | -------------- | -------------- | --------------- | -------------- | ----- | -------------------- |
| [AC-1](#ac-1)   | n/a  | `IT-0017-AC1`  | n/a      | n/a            | `SEC-0017-AC1` | n/a             | n/a            | n/a   | n/a                  |
| [AC-2](#ac-2)   | n/a  | n/a            | n/a      | n/a            | `SEC-0017-AC2` | `PERF-0017-AC2` | n/a            | n/a   | n/a                  |
| [AC-3](#ac-3)   | n/a  | n/a            | n/a      | n/a            | `SEC-0017-AC3` | n/a             | n/a            | n/a   | n/a                  |
| [AC-4](#ac-4)   | n/a  | `IT-0017-AC4`  | n/a      | n/a            | `SEC-0017-AC4` | n/a             | n/a            | n/a   | n/a                  |
| [AC-5](#ac-5)   | n/a  | `IT-0017-AC5`  | n/a      | n/a            | `SEC-0017-AC5` | `PERF-0017-AC5` | n/a            | n/a   | n/a                  |
| [AC-6](#ac-6)   | n/a  | `IT-0017-AC6`  | n/a      | n/a            | n/a            | n/a             | n/a            | n/a   | n/a                  |
| [AC-7](#ac-7)   | n/a  | n/a            | n/a      | n/a            | `SEC-0017-AC7` | n/a             | n/a            | n/a   | n/a                  |
| [AC-8](#ac-8)   | n/a  | n/a            | n/a      | `E2E-0017-AC8` | n/a            | n/a             | `VIS-0017-AC8` | n/a   | n/a                  |
| [AC-9](#ac-9)   | n/a  | `IT-0017-AC9`  | n/a      | n/a            | `SEC-0017-AC9` | n/a             | n/a            | n/a   | n/a                  |
| [AC-10](#ac-10) | n/a  | `IT-0017-AC10` | n/a      | n/a            | n/a            | n/a             | n/a            | n/a   | n/a                  |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

Tidak ada unit yang diwajibkan oleh acceptance criteria saat ini.

## Integration test

| ID             | AC              | Fokus                                                                                                                                                            | Scenario terencana                                                                         | Expected result                                       |
| -------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| `IT-0017-AC1`  | [AC-1](#ac-1)   | POST /auth/login memverifikasi kredensial; sukses membuat baris session dan menyetel cookie myadmin_session HttpOnly, SameSite=Lax, Path=/, Secure bila secur... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-1 terpenuhi.  |
| `IT-0017-AC4`  | [AC-4](#ac-4)   | middleware sesi menegakkan di setiap request non publik: token valid, belum revoked_at, belum lewat idle timeout (last_seen_at plus session.idleTimeoutMinute... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-4 terpenuhi.  |
| `IT-0017-AC5`  | [AC-5](#ac-5)   | upgrade WebSocket memakai cookie sesi yang sama; sesi yang kadaluarsa atau dicabut memutus koneksi WS aktif pada pemeriksaan berikutnya (paling lambat 60 det... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-5 terpenuhi.  |
| `IT-0017-AC6`  | [AC-6](#ac-6)   | POST /auth/logout mencabut sesi aktif (revoked_at), menghapus cookie, dan mencatat audit; GET /auth/me mengembalikan user dan role untuk sesi valid.             | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-6 terpenuhi.  |
| `IT-0017-AC9`  | [AC-9](#ac-9)   | login sukses, login gagal (dengan alasan tersamar di klien namun kategori tercatat), dan logout menghasilkan audit event tanpa password; sesi kadaluarsa yang... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-9 terpenuhi.  |
| `IT-0017-AC10` | [AC-10](#ac-10) | pembersihan sesi kadaluarsa berjalan berkala di server (interval per jam) lewat SessionRepository.deleteExpired.                                                 | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-10 terpenuhi. |

## Test tambahan

### Contract test

Tidak ada contract yang diwajibkan oleh acceptance criteria saat ini.

### E2E

| ID             | AC            | Fokus                                                                                                                                                           | Scenario terencana                                                       | Expected result                                      |
| -------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------- |
| `E2E-0017-AC8` | [AC-8](#ac-8) | di web: route guard mengalihkan pengunjung tanpa sesi ke /login, event sessionExpired dari SDK (spec 0005) membersihkan state klien dan mengalihkan ke login... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

### Security

| ID             | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                               | Expected result                                      |
| -------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `SEC-0017-AC1` | [AC-1](#ac-1) | POST /auth/login memverifikasi kredensial; sukses membuat baris session dan menyetel cookie myadmin_session HttpOnly, SameSite=Lax, Path=/, Secure bila secur... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `SEC-0017-AC2` | [AC-2](#ac-2) | kegagalan login menjawab 401 AUTH_INVALID_CREDENTIALS dengan pesan tunggal yang tidak membedakan username salah dari password salah, dan berjalan dalam waktu... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `SEC-0017-AC3` | [AC-3](#ac-3) | login di rate limit per IP dan per username (5 kegagalan per menit lalu jeda bertahap); user nonaktif ditolak dengan pesan yang sama dengan kredensial salah.    | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `SEC-0017-AC4` | [AC-4](#ac-4) | middleware sesi menegakkan di setiap request non publik: token valid, belum revoked_at, belum lewat idle timeout (last_seen_at plus session.idleTimeoutMinute... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `SEC-0017-AC5` | [AC-5](#ac-5) | upgrade WebSocket memakai cookie sesi yang sama; sesi yang kadaluarsa atau dicabut memutus koneksi WS aktif pada pemeriksaan berikutnya (paling lambat 60 det... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `SEC-0017-AC7` | [AC-7](#ac-7) | perlindungan CSRF: semua request mutasi non publik wajib membawa header X-Myadmin-Csrf: 1 (dipasang otomatis SDK); server menolak mutasi tanpa header itu, da... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |
| `SEC-0017-AC9` | [AC-9](#ac-9) | login sukses, login gagal (dengan alasan tersamar di klien namun kategori tercatat), dan logout menghasilkan audit event tanpa password; sesi kadaluarsa yang... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-9 terpenuhi. |

### Performance

| ID              | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                               | Expected result                                      |
| --------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `PERF-0017-AC2` | [AC-2](#ac-2) | kegagalan login menjawab 401 AUTH_INVALID_CREDENTIALS dengan pesan tunggal yang tidak membedakan username salah dari password salah, dan berjalan dalam waktu... | Tetapkan dataset, baseline, ambang, pengulangan, dan toleransi sebelum eksekusi. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `PERF-0017-AC5` | [AC-5](#ac-5) | upgrade WebSocket memakai cookie sesi yang sama; sesi yang kadaluarsa atau dicabut memutus koneksi WS aktif pada pemeriksaan berikutnya (paling lambat 60 det... | Tetapkan dataset, baseline, ambang, pengulangan, dan toleransi sebelum eksekusi. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |

### Visual dan accessibility

| ID             | AC            | Fokus                                                                                                                                                           | Scenario terencana                                                                    | Expected result                                      |
| -------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `VIS-0017-AC8` | [AC-8](#ac-8) | di web: route guard mengalihkan pengunjung tanpa sesi ke /login, event sessionExpired dari SDK (spec 0005) membersihkan state klien dan mengalihkan ke login... | Kunci viewport, mode warna, state komponen, interaksi keyboard, dan bukti screenshot. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

### Smoke dan operational acceptance

Tidak ada smoke dan operational yang diwajibkan oleh acceptance criteria saat ini.

### Manual atau external proof

Tidak ada manual atau external yang diwajibkan oleh acceptance criteria saat ini.

## Critical test scenarios

- Happy path: login → me → logout → me 401, verifikasi **AC-1**, **AC-6**.
- Expiry: sesi melewati idle timeout → request berikutnya 401 SESSION_EXPIRED dan UI kembali ke login tanpa state tersisa, verifikasi **AC-4**, **AC-8**.
- CSRF: mutasi tanpa header custom ditolak, verifikasi **AC-7**.
- Keamanan: file db tidak memuat token plaintext; login gagal seragam untuk user tak dikenal vs password salah, verifikasi **AC-1**, **AC-2**.

## Staged, environment, dan external proof

Tidak ada staged, environment, atau external proof khusus yang sudah diidentifikasi.

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
