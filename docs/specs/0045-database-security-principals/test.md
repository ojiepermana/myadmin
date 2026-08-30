# Test dan acceptance criteria 0045. Security database target: principal

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Parsial lokal — integration kedua engine, contract, application security regression, capability-gated UI structure/runtime E2E, dan real-browser principal lifecycle PostgreSQL/MySQL lulus; security matrix penuh belum lengkap.
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0045.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

`GET /security/principals` (per koneksi) mengembalikan daftar principal paginated berbentuk engine netral: name (PostgreSQL: nama role; MySQL: `user@host` dengan komponen terpisah), atribut sebagai daftar kunci nilai yang provider deklarasikan (canLogin, superuser, createDb, createRole, connectionLimit, validUntil untuk PostgreSQL; host, authPlugin, accountLocked, passwordExpired untuk MySQL), dan tanda member of (PostgreSQL role membership; ditampilkan read only di V1).

### AC-2

create principal: form dinamis dari deklarasi atribut provider (`SecurityPort.describePrincipalForm`): nama (plus host untuk MySQL), password opsional sesuai engine, atribut boolean/nilai; provider memvalidasi dan mengkompilasi DDL (CREATE ROLE / CREATE USER) dengan pratinjau (pola spec 0041).

### AC-3

edit principal: ubah atribut yang provider izinkan lewat change set dengan pratinjau; rename principal tidak ada di V1 (drop dan create adalah keputusan sadar pengguna lewat SQL).

### AC-4

reset password: dialog khusus, password baru tidak pernah ditampilkan kembali, tidak masuk log/audit/history; kompilasi ALTER ROLE/ALTER USER di provider; diaudit sebagai `security.credential_reset` tanpa material rahasia (FR-SEC-02).

### AC-5

drop principal: konfirmasi ketik nama; kegagalan karena kepemilikan object atau grant tersisa diteruskan jelas dari engine (tanpa cascade otomatis); diaudit `security.principal_dropped`.

### AC-6

seluruh fitur digerbangi `capabilities.principals`; server menolak saat false; UI menonaktifkan dengan alasan; kegagalan hak (credential koneksi kurang privilege) tampil sebagai `permission_denied` yang jelas (FR-SEC-03 semangat).

### AC-7

semua mutasi principal diaudit sebelum sukses; browse tidak diaudit.

### AC-8

e2e kedua engine terhadap server test: list, create dengan atribut, edit atribut, reset password (dibuktikan bisa login dengan password baru), drop; test bahwa response tidak pernah memuat hash atau password.

## Matriks cakupan

| AC            | Unit          | Integration   | Contract      | E2E            | Security       | Performance | Visual | Smoke | Manual atau external |
| ------------- | ------------- | ------------- | ------------- | -------------- | -------------- | ----------- | ------ | ----- | -------------------- |
| [AC-1](#ac-1) | `UT-0045-AC1` | `IT-0045-AC1` | `CT-0045-AC1` | n/a            | n/a            | n/a         | n/a    | n/a   | n/a                  |
| [AC-2](#ac-2) | `UT-0045-AC2` | `IT-0045-AC2` | `CT-0045-AC2` | `E2E-0045-AC2` | n/a            | n/a         | n/a    | n/a   | n/a                  |
| [AC-3](#ac-3) | `UT-0045-AC3` | `IT-0045-AC3` | `CT-0045-AC3` | `E2E-0045-AC3` | n/a            | n/a         | n/a    | n/a   | n/a                  |
| [AC-4](#ac-4) | n/a           | `IT-0045-AC4` | `CT-0045-AC4` | `E2E-0045-AC4` | `SEC-0045-AC4` | n/a         | n/a    | n/a   | n/a                  |
| [AC-5](#ac-5) | n/a           | `IT-0045-AC5` | `CT-0045-AC5` | `E2E-0045-AC5` | `SEC-0045-AC5` | n/a         | n/a    | n/a   | n/a                  |
| [AC-6](#ac-6) | `UT-0045-AC6` | `IT-0045-AC6` | `CT-0045-AC6` | `E2E-0045-AC6` | `SEC-0045-AC6` | n/a         | n/a    | n/a   | n/a                  |
| [AC-7](#ac-7) | n/a           | `IT-0045-AC7` | n/a           | n/a            | `SEC-0045-AC7` | n/a         | n/a    | n/a   | n/a                  |
| [AC-8](#ac-8) | n/a           | `IT-0045-AC8` | n/a           | `E2E-0045-AC8` | `SEC-0045-AC8` | n/a         | n/a    | n/a   | n/a                  |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

| ID            | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                                       | Expected result                                      |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `UT-0045-AC1` | [AC-1](#ac-1) | GET /security/principals (per koneksi) mengembalikan daftar principal paginated berbentuk engine netral: name (PostgreSQL: nama role; MySQL: user@host dengan... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `UT-0045-AC2` | [AC-2](#ac-2) | create principal: form dinamis dari deklarasi atribut provider (SecurityPort.describePrincipalForm): nama (plus host untuk MySQL), password opsional sesuai e... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `UT-0045-AC3` | [AC-3](#ac-3) | edit principal: ubah atribut yang provider izinkan lewat change set dengan pratinjau; rename principal tidak ada di V1 (drop dan create adalah keputusan sada... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `UT-0045-AC6` | [AC-6](#ac-6) | seluruh fitur digerbangi capabilities.principals; server menolak saat false; UI menonaktifkan dengan alasan; kegagalan hak (credential koneksi kurang privile... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

## Integration test

| ID            | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                         | Expected result                                      |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `IT-0045-AC1` | [AC-1](#ac-1) | GET /security/principals (per koneksi) mengembalikan daftar principal paginated berbentuk engine netral: name (PostgreSQL: nama role; MySQL: user@host dengan... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `IT-0045-AC2` | [AC-2](#ac-2) | create principal: form dinamis dari deklarasi atribut provider (SecurityPort.describePrincipalForm): nama (plus host untuk MySQL), password opsional sesuai e... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `IT-0045-AC3` | [AC-3](#ac-3) | edit principal: ubah atribut yang provider izinkan lewat change set dengan pratinjau; rename principal tidak ada di V1 (drop dan create adalah keputusan sada... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `IT-0045-AC4` | [AC-4](#ac-4) | reset password: dialog khusus, password baru tidak pernah ditampilkan kembali, tidak masuk log/audit/history; kompilasi ALTER ROLE/ALTER USER di provider; di... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `IT-0045-AC5` | [AC-5](#ac-5) | drop principal: konfirmasi ketik nama; kegagalan karena kepemilikan object atau grant tersisa diteruskan jelas dari engine (tanpa cascade otomatis); diaudit...  | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `IT-0045-AC6` | [AC-6](#ac-6) | seluruh fitur digerbangi capabilities.principals; server menolak saat false; UI menonaktifkan dengan alasan; kegagalan hak (credential koneksi kurang privile... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `IT-0045-AC7` | [AC-7](#ac-7) | semua mutasi principal diaudit sebelum sukses; browse tidak diaudit.                                                                                             | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |
| `IT-0045-AC8` | [AC-8](#ac-8) | e2e kedua engine terhadap server test: list, create dengan atribut, edit atribut, reset password (dibuktikan bisa login dengan password baru), drop; test bah... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

## Test tambahan

### Contract test

| ID            | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                          | Expected result                                      |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `CT-0045-AC1` | [AC-1](#ac-1) | GET /security/principals (per koneksi) mengembalikan daftar principal paginated berbentuk engine netral: name (PostgreSQL: nama role; MySQL: user@host dengan... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `CT-0045-AC2` | [AC-2](#ac-2) | create principal: form dinamis dari deklarasi atribut provider (SecurityPort.describePrincipalForm): nama (plus host untuk MySQL), password opsional sesuai e... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `CT-0045-AC3` | [AC-3](#ac-3) | edit principal: ubah atribut yang provider izinkan lewat change set dengan pratinjau; rename principal tidak ada di V1 (drop dan create adalah keputusan sada... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `CT-0045-AC4` | [AC-4](#ac-4) | reset password: dialog khusus, password baru tidak pernah ditampilkan kembali, tidak masuk log/audit/history; kompilasi ALTER ROLE/ALTER USER di provider; di... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `CT-0045-AC5` | [AC-5](#ac-5) | drop principal: konfirmasi ketik nama; kegagalan karena kepemilikan object atau grant tersisa diteruskan jelas dari engine (tanpa cascade otomatis); diaudit...  | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `CT-0045-AC6` | [AC-6](#ac-6) | seluruh fitur digerbangi capabilities.principals; server menolak saat false; UI menonaktifkan dengan alasan; kegagalan hak (credential koneksi kurang privile... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

### E2E

| ID             | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                       | Expected result                                      |
| -------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------- |
| `E2E-0045-AC2` | [AC-2](#ac-2) | create principal: form dinamis dari deklarasi atribut provider (SecurityPort.describePrincipalForm): nama (plus host untuk MySQL), password opsional sesuai e... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `E2E-0045-AC3` | [AC-3](#ac-3) | edit principal: ubah atribut yang provider izinkan lewat change set dengan pratinjau; rename principal tidak ada di V1 (drop dan create adalah keputusan sada... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `E2E-0045-AC4` | [AC-4](#ac-4) | reset password: dialog khusus, password baru tidak pernah ditampilkan kembali, tidak masuk log/audit/history; kompilasi ALTER ROLE/ALTER USER di provider; di... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `E2E-0045-AC5` | [AC-5](#ac-5) | drop principal: konfirmasi ketik nama; kegagalan karena kepemilikan object atau grant tersisa diteruskan jelas dari engine (tanpa cascade otomatis); diaudit...  | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `E2E-0045-AC6` | [AC-6](#ac-6) | seluruh fitur digerbangi capabilities.principals; server menolak saat false; UI menonaktifkan dengan alasan; kegagalan hak (credential koneksi kurang privile... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `E2E-0045-AC8` | [AC-8](#ac-8) | e2e kedua engine terhadap server test: list, create dengan atribut, edit atribut, reset password (dibuktikan bisa login dengan password baru), drop; test bah... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

### Security

| ID             | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                               | Expected result                                      |
| -------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `SEC-0045-AC4` | [AC-4](#ac-4) | reset password: dialog khusus, password baru tidak pernah ditampilkan kembali, tidak masuk log/audit/history; kompilasi ALTER ROLE/ALTER USER di provider; di... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `SEC-0045-AC5` | [AC-5](#ac-5) | drop principal: konfirmasi ketik nama; kegagalan karena kepemilikan object atau grant tersisa diteruskan jelas dari engine (tanpa cascade otomatis); diaudit...  | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `SEC-0045-AC6` | [AC-6](#ac-6) | seluruh fitur digerbangi capabilities.principals; server menolak saat false; UI menonaktifkan dengan alasan; kegagalan hak (credential koneksi kurang privile... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `SEC-0045-AC7` | [AC-7](#ac-7) | semua mutasi principal diaudit sebelum sukses; browse tidak diaudit.                                                                                             | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |
| `SEC-0045-AC8` | [AC-8](#ac-8) | e2e kedua engine terhadap server test: list, create dengan atribut, edit atribut, reset password (dibuktikan bisa login dengan password baru), drop; test bah... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

### Performance

Tidak ada performance yang diwajibkan oleh acceptance criteria saat ini.

### Visual dan accessibility

Tidak ada visual dan accessibility yang diwajibkan oleh acceptance criteria saat ini.

### Smoke dan operational acceptance

Tidak ada smoke dan operational yang diwajibkan oleh acceptance criteria saat ini.

### Manual atau external proof

Tidak ada manual atau external yang diwajibkan oleh acceptance criteria saat ini.

## Critical test scenarios

- Bersih: seluruh response principal bebas material rahasia (pemeriksaan bentuk otomatis), verifikasi **AC-1**, **AC-8**.
- Reset: password baru bekerja untuk login; tidak ada jejak di log/audit, verifikasi **AC-4**.
- Hak kurang: koneksi ber user biasa mencoba create → `permission_denied` yang jelas, verifikasi **AC-6**.

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
