# Test dan acceptance criteria 0040. Manajemen schema

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Parsial lokal — server/provider/contract **7 test, 20 assertions**, PostgreSQL schema integration, dan browser schema CRUD lulus; MySQL/schema security matrix penuh dan seluruh acceptance evidence belum lengkap.
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0040.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

operasi `SchemaPort` diimplementasikan provider PostgreSQL: list (sudah lewat metadata), properties (owner, jumlah object ringkas), create (nama, owner opsional), rename, drop (dengan mode restrict default; drop berisi object ditolak dengan pesan menjelaskan isi, tanpa opsi cascade di V1).

### AC-2

endpoint sesuai kontrak: `POST /schemas`, `PATCH /schemas/:name` (rename), `DELETE /schemas/:name` (confirmName wajib); semua menyertakan connectionId dan database konteks.

### AC-3

seluruh fitur digerbangi `capabilities.schemas`: menu, halaman, dan endpoint (server menjawab `unsupported` untuk engine tanpa capability meski request dipaksa, FR-PROV-04).

### AC-4

rename memperingatkan dampak (object yang mereferensikan schema lewat nama terkualifikasi bisa rusak) sebelum konfirmasi; drop memakai komponen konfirmasi ketik nama.

### AC-5

create, rename, drop diaudit (`schema.created`, `schema.renamed`, `schema.dropped`) sebelum response sukses.

### AC-6

e2e PostgreSQL: create, rename, drop kosong sukses; drop schema berisi ditolak dengan pesan; e2e MySQL: tidak ada menu schema dan endpoint menjawab unsupported.

## Matriks cakupan

| AC            | Unit          | Integration   | Contract      | E2E            | Security       | Performance | Visual | Smoke | Manual atau external |
| ------------- | ------------- | ------------- | ------------- | -------------- | -------------- | ----------- | ------ | ----- | -------------------- |
| [AC-1](#ac-1) | `UT-0040-AC1` | `IT-0040-AC1` | n/a           | n/a            | n/a            | n/a         | n/a    | n/a   | n/a                  |
| [AC-2](#ac-2) | n/a           | `IT-0040-AC2` | `CT-0040-AC2` | n/a            | n/a            | n/a         | n/a    | n/a   | n/a                  |
| [AC-3](#ac-3) | `UT-0040-AC3` | `IT-0040-AC3` | `CT-0040-AC3` | `E2E-0040-AC3` | n/a            | n/a         | n/a    | n/a   | n/a                  |
| [AC-4](#ac-4) | n/a           | n/a           | n/a           | `E2E-0040-AC4` | `SEC-0040-AC4` | n/a         | n/a    | n/a   | n/a                  |
| [AC-5](#ac-5) | n/a           | `IT-0040-AC5` | n/a           | n/a            | `SEC-0040-AC5` | n/a         | n/a    | n/a   | n/a                  |
| [AC-6](#ac-6) | n/a           | `IT-0040-AC6` | n/a           | `E2E-0040-AC6` | n/a            | n/a         | n/a    | n/a   | n/a                  |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

| ID            | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                                       | Expected result                                      |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `UT-0040-AC1` | [AC-1](#ac-1) | operasi SchemaPort diimplementasikan provider PostgreSQL: list (sudah lewat metadata), properties (owner, jumlah object ringkas), create (nama, owner opsiona... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `UT-0040-AC3` | [AC-3](#ac-3) | seluruh fitur digerbangi capabilities.schemas: menu, halaman, dan endpoint (server menjawab unsupported untuk engine tanpa capability meski request dipaksa,...  | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |

## Integration test

| ID            | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                         | Expected result                                      |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `IT-0040-AC1` | [AC-1](#ac-1) | operasi SchemaPort diimplementasikan provider PostgreSQL: list (sudah lewat metadata), properties (owner, jumlah object ringkas), create (nama, owner opsiona... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `IT-0040-AC2` | [AC-2](#ac-2) | endpoint sesuai kontrak: POST /schemas, PATCH /schemas/:name (rename), DELETE /schemas/:name (confirmName wajib); semua menyertakan connectionId dan database... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `IT-0040-AC3` | [AC-3](#ac-3) | seluruh fitur digerbangi capabilities.schemas: menu, halaman, dan endpoint (server menjawab unsupported untuk engine tanpa capability meski request dipaksa,...  | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `IT-0040-AC5` | [AC-5](#ac-5) | create, rename, drop diaudit (schema.created, schema.renamed, schema.dropped) sebelum response sukses.                                                           | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `IT-0040-AC6` | [AC-6](#ac-6) | e2e PostgreSQL: create, rename, drop kosong sukses; drop schema berisi ditolak dengan pesan; e2e MySQL: tidak ada menu schema dan endpoint menjawab unsupported. | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

## Test tambahan

### Contract test

| ID            | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                          | Expected result                                      |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `CT-0040-AC2` | [AC-2](#ac-2) | endpoint sesuai kontrak: POST /schemas, PATCH /schemas/:name (rename), DELETE /schemas/:name (confirmName wajib); semua menyertakan connectionId dan database... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `CT-0040-AC3` | [AC-3](#ac-3) | seluruh fitur digerbangi capabilities.schemas: menu, halaman, dan endpoint (server menjawab unsupported untuk engine tanpa capability meski request dipaksa,...  | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |

### E2E

| ID             | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                       | Expected result                                      |
| -------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------- |
| `E2E-0040-AC3` | [AC-3](#ac-3) | seluruh fitur digerbangi capabilities.schemas: menu, halaman, dan endpoint (server menjawab unsupported untuk engine tanpa capability meski request dipaksa,...  | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `E2E-0040-AC4` | [AC-4](#ac-4) | rename memperingatkan dampak (object yang mereferensikan schema lewat nama terkualifikasi bisa rusak) sebelum konfirmasi; drop memakai komponen konfirmasi ke... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `E2E-0040-AC6` | [AC-6](#ac-6) | e2e PostgreSQL: create, rename, drop kosong sukses; drop schema berisi ditolak dengan pesan; e2e MySQL: tidak ada menu schema dan endpoint menjawab unsupported. | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

### Security

| ID             | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                               | Expected result                                      |
| -------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `SEC-0040-AC4` | [AC-4](#ac-4) | rename memperingatkan dampak (object yang mereferensikan schema lewat nama terkualifikasi bisa rusak) sebelum konfirmasi; drop memakai komponen konfirmasi ke... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `SEC-0040-AC5` | [AC-5](#ac-5) | create, rename, drop diaudit (schema.created, schema.renamed, schema.dropped) sebelum response sukses.                                                           | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |

### Performance

Tidak ada performance yang diwajibkan oleh acceptance criteria saat ini.

### Visual dan accessibility

Tidak ada visual dan accessibility yang diwajibkan oleh acceptance criteria saat ini.

### Smoke dan operational acceptance

Tidak ada smoke dan operational yang diwajibkan oleh acceptance criteria saat ini.

### Manual atau external proof

Tidak ada manual atau external yang diwajibkan oleh acceptance criteria saat ini.

## Critical test scenarios

- Gerbang dua arah: MySQL dipaksa POST schema → unsupported; PostgreSQL normal, verifikasi **AC-3**, **AC-6**.
- Restrict: drop schema berisi → 409 dengan pesan isi, verifikasi **AC-1**.
- Rename: object di schema tetap ada pasca rename, verifikasi **AC-4** (dampak dijelaskan, operasi benar).

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
