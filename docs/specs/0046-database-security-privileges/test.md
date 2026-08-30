# Test dan acceptance criteria 0046. Security database target: privilege (grant dan revoke)

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Parsial lokal — integration actor kedua engine, real-browser grant/revoke UI PostgreSQL/MySQL, dan E2E V1-boundary catalog lulus; contract/security sign-off penuh belum lengkap.
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0046.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

`GET /security/principals/:name/grants` mengembalikan grant efektif principal pada level database dan table, dari introspeksi provider (PostgreSQL: pg catalog ACL; MySQL: SHOW GRANTS di parse atau information_schema), berbentuk engine netral: scope (database atau table plus ref), privilege, grantable.

### AC-2

`GET /security/privileges/catalog` mendeklarasikan privilege yang tersedia per level untuk engine koneksi (PostgreSQL database: CONNECT, CREATE, TEMP; table: SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER; MySQL sesuai daftarnya per level), dari modul provider; UI tidak menghardcode daftar privilege.

### AC-3

UI matriks grant: pilih principal, pilih scope (database dari daftar; table lewat pencari object), centang privilege; perubahan dikumpulkan sebagai change set → pratinjau statement GRANT/REVOKE → terapkan; revoke di dalam change set memakai konfirmasi destructive yang menyebut principal, scope, dan privilege yang dicabut (FR-SAFE-01; revoke termasuk destructive per definisi bagian 2).

### AC-4

`POST /security/grants/apply` menjalankan change set; kegagalan hak dari engine tiba sebagai `permission_denied` dengan pesan yang menyebut operasi mana yang gagal; sebagian sukses dilaporkan per statement (tanpa transaksi lintas statement di MySQL; PostgreSQL dalam transaksi).

### AC-5

seluruh perubahan privilege diaudit (`security.privilege_granted`, `security.privilege_revoked` dengan principal, scope, privilege) sebelum response sukses (FR-SAFE-02).

### AC-6

fitur digerbangi `capabilities.grants`; opsi WITH GRANT OPTION tidak ditawarkan di V1 (dicatat sebagai batas); column privileges dan object lain tidak muncul (V2 sesuai keputusan dan feature.md).

### AC-7

e2e kedua engine: beri SELECT pada table ke principal test, buktikan efeknya (login sebagai principal itu bisa SELECT dan tidak bisa INSERT), cabut kembali, audit tercatat.

## Matriks cakupan

| AC            | Unit          | Integration   | Contract      | E2E            | Security       | Performance | Visual | Smoke | Manual atau external |
| ------------- | ------------- | ------------- | ------------- | -------------- | -------------- | ----------- | ------ | ----- | -------------------- |
| [AC-1](#ac-1) | `UT-0046-AC1` | `IT-0046-AC1` | `CT-0046-AC1` | n/a            | n/a            | n/a         | n/a    | n/a   | n/a                  |
| [AC-2](#ac-2) | `UT-0046-AC2` | `IT-0046-AC2` | `CT-0046-AC2` | `E2E-0046-AC2` | n/a            | n/a         | n/a    | n/a   | n/a                  |
| [AC-3](#ac-3) | `UT-0046-AC3` | `IT-0046-AC3` | `CT-0046-AC3` | `E2E-0046-AC3` | `SEC-0046-AC3` | n/a         | n/a    | n/a   | n/a                  |
| [AC-4](#ac-4) | n/a           | `IT-0046-AC4` | `CT-0046-AC4` | n/a            | n/a            | n/a         | n/a    | n/a   | n/a                  |
| [AC-5](#ac-5) | n/a           | `IT-0046-AC5` | n/a           | n/a            | `SEC-0046-AC5` | n/a         | n/a    | n/a   | n/a                  |
| [AC-6](#ac-6) | `UT-0046-AC6` | `IT-0046-AC6` | `CT-0046-AC6` | `E2E-0046-AC6` | n/a            | n/a         | n/a    | n/a   | n/a                  |
| [AC-7](#ac-7) | n/a           | `IT-0046-AC7` | n/a           | `E2E-0046-AC7` | `SEC-0046-AC7` | n/a         | n/a    | n/a   | n/a                  |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

| ID            | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                                       | Expected result                                      |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `UT-0046-AC1` | [AC-1](#ac-1) | GET /security/principals/:name/grants mengembalikan grant efektif principal pada level database dan table, dari introspeksi provider (PostgreSQL: pg catalog...  | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `UT-0046-AC2` | [AC-2](#ac-2) | GET /security/privileges/catalog mendeklarasikan privilege yang tersedia per level untuk engine koneksi (PostgreSQL database: CONNECT, CREATE, TEMP; table: S... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `UT-0046-AC3` | [AC-3](#ac-3) | UI matriks grant: pilih principal, pilih scope (database dari daftar; table lewat pencari object), centang privilege; perubahan dikumpulkan sebagai change se... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `UT-0046-AC6` | [AC-6](#ac-6) | fitur digerbangi capabilities.grants; opsi WITH GRANT OPTION tidak ditawarkan di V1 (dicatat sebagai batas); column privileges dan object lain tidak muncul (... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

## Integration test

| ID            | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                         | Expected result                                      |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `IT-0046-AC1` | [AC-1](#ac-1) | GET /security/principals/:name/grants mengembalikan grant efektif principal pada level database dan table, dari introspeksi provider (PostgreSQL: pg catalog...  | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `IT-0046-AC2` | [AC-2](#ac-2) | GET /security/privileges/catalog mendeklarasikan privilege yang tersedia per level untuk engine koneksi (PostgreSQL database: CONNECT, CREATE, TEMP; table: S... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `IT-0046-AC3` | [AC-3](#ac-3) | UI matriks grant: pilih principal, pilih scope (database dari daftar; table lewat pencari object), centang privilege; perubahan dikumpulkan sebagai change se... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `IT-0046-AC4` | [AC-4](#ac-4) | POST /security/grants/apply menjalankan change set; kegagalan hak dari engine tiba sebagai permission_denied dengan pesan yang menyebut operasi mana yang gag... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `IT-0046-AC5` | [AC-5](#ac-5) | seluruh perubahan privilege diaudit (security.privilege_granted, security.privilege_revoked dengan principal, scope, privilege) sebelum response sukses (FR-S... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `IT-0046-AC6` | [AC-6](#ac-6) | fitur digerbangi capabilities.grants; opsi WITH GRANT OPTION tidak ditawarkan di V1 (dicatat sebagai batas); column privileges dan object lain tidak muncul (... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `IT-0046-AC7` | [AC-7](#ac-7) | e2e kedua engine: beri SELECT pada table ke principal test, buktikan efeknya (login sebagai principal itu bisa SELECT dan tidak bisa INSERT), cabut kembali,...  | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

## Test tambahan

### Contract test

| ID            | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                          | Expected result                                      |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `CT-0046-AC1` | [AC-1](#ac-1) | GET /security/principals/:name/grants mengembalikan grant efektif principal pada level database dan table, dari introspeksi provider (PostgreSQL: pg catalog...  | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `CT-0046-AC2` | [AC-2](#ac-2) | GET /security/privileges/catalog mendeklarasikan privilege yang tersedia per level untuk engine koneksi (PostgreSQL database: CONNECT, CREATE, TEMP; table: S... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `CT-0046-AC3` | [AC-3](#ac-3) | UI matriks grant: pilih principal, pilih scope (database dari daftar; table lewat pencari object), centang privilege; perubahan dikumpulkan sebagai change se... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `CT-0046-AC4` | [AC-4](#ac-4) | POST /security/grants/apply menjalankan change set; kegagalan hak dari engine tiba sebagai permission_denied dengan pesan yang menyebut operasi mana yang gag... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `CT-0046-AC6` | [AC-6](#ac-6) | fitur digerbangi capabilities.grants; opsi WITH GRANT OPTION tidak ditawarkan di V1 (dicatat sebagai batas); column privileges dan object lain tidak muncul (... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

### E2E

| ID             | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                       | Expected result                                      |
| -------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------- |
| `E2E-0046-AC2` | [AC-2](#ac-2) | GET /security/privileges/catalog mendeklarasikan privilege yang tersedia per level untuk engine koneksi (PostgreSQL database: CONNECT, CREATE, TEMP; table: S... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `E2E-0046-AC3` | [AC-3](#ac-3) | UI matriks grant: pilih principal, pilih scope (database dari daftar; table lewat pencari object), centang privilege; perubahan dikumpulkan sebagai change se... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `E2E-0046-AC6` | [AC-6](#ac-6) | fitur digerbangi capabilities.grants; opsi WITH GRANT OPTION tidak ditawarkan di V1 (dicatat sebagai batas); column privileges dan object lain tidak muncul (... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `E2E-0046-AC7` | [AC-7](#ac-7) | e2e kedua engine: beri SELECT pada table ke principal test, buktikan efeknya (login sebagai principal itu bisa SELECT dan tidak bisa INSERT), cabut kembali,...  | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

### Security

| ID             | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                               | Expected result                                      |
| -------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `SEC-0046-AC3` | [AC-3](#ac-3) | UI matriks grant: pilih principal, pilih scope (database dari daftar; table lewat pencari object), centang privilege; perubahan dikumpulkan sebagai change se... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `SEC-0046-AC5` | [AC-5](#ac-5) | seluruh perubahan privilege diaudit (security.privilege_granted, security.privilege_revoked dengan principal, scope, privilege) sebelum response sukses (FR-S... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `SEC-0046-AC7` | [AC-7](#ac-7) | e2e kedua engine: beri SELECT pada table ke principal test, buktikan efeknya (login sebagai principal itu bisa SELECT dan tidak bisa INSERT), cabut kembali,...  | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

### Performance

Tidak ada performance yang diwajibkan oleh acceptance criteria saat ini.

### Visual dan accessibility

Tidak ada visual dan accessibility yang diwajibkan oleh acceptance criteria saat ini.

### Smoke dan operational acceptance

Tidak ada smoke dan operational yang diwajibkan oleh acceptance criteria saat ini.

### Manual atau external proof

Tidak ada manual atau external yang diwajibkan oleh acceptance criteria saat ini.

## Critical test scenarios

- Efek nyata: grant SELECT → principal bisa SELECT, tidak bisa INSERT; revoke → tidak bisa lagi, verifikasi **AC-7**.
- Hak kurang: koneksi tanpa hak grant mencoba → permission_denied menyebut statement, verifikasi **AC-4**.
- Konfirmasi: apply berisi revoke tanpa confirm → 409, verifikasi **AC-3**.

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
