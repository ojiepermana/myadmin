# Test dan acceptance criteria 0044. Manajemen view (CRUD GUI)

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Belum dijalankan
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0044.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

dari explorer, view punya aksi: buka data (jalur data browser read only, spec 0037 AC-7), edit definisi, drop; folder Views punya aksi create view.

### AC-2

halaman editor view: nama (dan schema/database konteks), definisi SELECT di editor CodeMirror dengan dialek engine dan autocomplete metadata, tombol validasi (dry run provider bila engine mendukung, minimal parse di sisi server target lewat EXPLAIN atas SELECT nya), pratinjau DDL lengkap (CREATE [OR REPLACE] VIEW ... AS ...) sebelum terapkan.

### AC-3

`POST /views` membuat view; `PUT /views/:ref` memperbarui definisi: provider memilih strategi per engine (MySQL ALTER VIEW; PostgreSQL CREATE OR REPLACE bila kompatibel, dan bila tidak, menawarkan drop dan create sebagai change set dengan peringatan dampak dependensi yang eksplisit dan konfirmasi destructive); `DELETE /views/:ref` drop dengan confirmName.

### AC-4

fitur digerbangi `capabilities.viewEditor`; server menolak operasi saat capability false meski UI dimanipulasi (FR-PROV-04).

### AC-5

create, replace, drop diaudit (`view.created`, `view.replaced`, `view.dropped`) sebelum response sukses; drop dan jalur drop create memakai komponen konfirmasi destructive dengan dampak (perujuk dari metadata dependensi).

### AC-6

definisi yang gagal (SELECT tidak valid, kolom bentrok) tiba sebagai `DbError` berkategori dengan posisi bila tersedia, ditampilkan di editor seperti error query.

### AC-7

setelah operasi, cache metadata di invalidate; tab data view yang definisinya berubah diberi tanda muat ulang.

### AC-8

e2e kedua engine: create view dari SELECT fixture, buka datanya, ubah definisi (termasuk kasus PostgreSQL yang butuh drop create dengan konfirmasi), drop; audit tercatat.

## Matriks cakupan

| AC | Unit | Integration | Contract | E2E | Security | Performance | Visual | Smoke | Manual atau external |
|---|---|---|---|---|---|---|---|---|---|
| [AC-1](#ac-1) | n/a | n/a | n/a | `E2E-0044-AC1` | n/a | n/a | n/a | n/a | n/a |
| [AC-2](#ac-2) | `UT-0044-AC2` | `IT-0044-AC2` | `CT-0044-AC2` | `E2E-0044-AC2` | n/a | n/a | n/a | n/a | n/a |
| [AC-3](#ac-3) | `UT-0044-AC3` | `IT-0044-AC3` | `CT-0044-AC3` | `E2E-0044-AC3` | `SEC-0044-AC3` | n/a | n/a | n/a | n/a |
| [AC-4](#ac-4) | `UT-0044-AC4` | `IT-0044-AC4` | `CT-0044-AC4` | `E2E-0044-AC4` | n/a | n/a | n/a | n/a | n/a |
| [AC-5](#ac-5) | n/a | `IT-0044-AC5` | n/a | `E2E-0044-AC5` | `SEC-0044-AC5` | n/a | n/a | n/a | n/a |
| [AC-6](#ac-6) | `UT-0044-AC6` | `IT-0044-AC6` | `CT-0044-AC6` | `E2E-0044-AC6` | n/a | n/a | n/a | n/a | n/a |
| [AC-7](#ac-7) | `UT-0044-AC7` | `IT-0044-AC7` | n/a | `E2E-0044-AC7` | n/a | n/a | n/a | n/a | n/a |
| [AC-8](#ac-8) | n/a | `IT-0044-AC8` | n/a | `E2E-0044-AC8` | `SEC-0044-AC8` | n/a | n/a | n/a | n/a |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `UT-0044-AC2` | [AC-2](#ac-2) | halaman editor view: nama (dan schema/database konteks), definisi SELECT di editor CodeMirror dengan dialek engine dan autocomplete metadata, tombol validasi... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `UT-0044-AC3` | [AC-3](#ac-3) | POST /views membuat view; PUT /views/:ref memperbarui definisi: provider memilih strategi per engine (MySQL ALTER VIEW; PostgreSQL CREATE OR REPLACE bila kom... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `UT-0044-AC4` | [AC-4](#ac-4) | fitur digerbangi capabilities.viewEditor; server menolak operasi saat capability false meski UI dimanipulasi (FR-PROV-04). | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `UT-0044-AC6` | [AC-6](#ac-6) | definisi yang gagal (SELECT tidak valid, kolom bentrok) tiba sebagai DbError berkategori dengan posisi bila tersedia, ditampilkan di editor seperti error query. | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `UT-0044-AC7` | [AC-7](#ac-7) | setelah operasi, cache metadata di invalidate; tab data view yang definisinya berubah diberi tanda muat ulang. | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

## Integration test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `IT-0044-AC2` | [AC-2](#ac-2) | halaman editor view: nama (dan schema/database konteks), definisi SELECT di editor CodeMirror dengan dialek engine dan autocomplete metadata, tombol validasi... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `IT-0044-AC3` | [AC-3](#ac-3) | POST /views membuat view; PUT /views/:ref memperbarui definisi: provider memilih strategi per engine (MySQL ALTER VIEW; PostgreSQL CREATE OR REPLACE bila kom... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `IT-0044-AC4` | [AC-4](#ac-4) | fitur digerbangi capabilities.viewEditor; server menolak operasi saat capability false meski UI dimanipulasi (FR-PROV-04). | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `IT-0044-AC5` | [AC-5](#ac-5) | create, replace, drop diaudit (view.created, view.replaced, view.dropped) sebelum response sukses; drop dan jalur drop create memakai komponen konfirmasi des... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `IT-0044-AC6` | [AC-6](#ac-6) | definisi yang gagal (SELECT tidak valid, kolom bentrok) tiba sebagai DbError berkategori dengan posisi bila tersedia, ditampilkan di editor seperti error query. | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `IT-0044-AC7` | [AC-7](#ac-7) | setelah operasi, cache metadata di invalidate; tab data view yang definisinya berubah diberi tanda muat ulang. | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |
| `IT-0044-AC8` | [AC-8](#ac-8) | e2e kedua engine: create view dari SELECT fixture, buka datanya, ubah definisi (termasuk kasus PostgreSQL yang butuh drop create dengan konfirmasi), drop; au... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

## Test tambahan

### Contract test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `CT-0044-AC2` | [AC-2](#ac-2) | halaman editor view: nama (dan schema/database konteks), definisi SELECT di editor CodeMirror dengan dialek engine dan autocomplete metadata, tombol validasi... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `CT-0044-AC3` | [AC-3](#ac-3) | POST /views membuat view; PUT /views/:ref memperbarui definisi: provider memilih strategi per engine (MySQL ALTER VIEW; PostgreSQL CREATE OR REPLACE bila kom... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `CT-0044-AC4` | [AC-4](#ac-4) | fitur digerbangi capabilities.viewEditor; server menolak operasi saat capability false meski UI dimanipulasi (FR-PROV-04). | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `CT-0044-AC6` | [AC-6](#ac-6) | definisi yang gagal (SELECT tidak valid, kolom bentrok) tiba sebagai DbError berkategori dengan posisi bila tersedia, ditampilkan di editor seperti error query. | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

### E2E

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `E2E-0044-AC1` | [AC-1](#ac-1) | dari explorer, view punya aksi: buka data (jalur data browser read only, spec 0037 AC-7), edit definisi, drop; folder Views punya aksi create view. | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `E2E-0044-AC2` | [AC-2](#ac-2) | halaman editor view: nama (dan schema/database konteks), definisi SELECT di editor CodeMirror dengan dialek engine dan autocomplete metadata, tombol validasi... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `E2E-0044-AC3` | [AC-3](#ac-3) | POST /views membuat view; PUT /views/:ref memperbarui definisi: provider memilih strategi per engine (MySQL ALTER VIEW; PostgreSQL CREATE OR REPLACE bila kom... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `E2E-0044-AC4` | [AC-4](#ac-4) | fitur digerbangi capabilities.viewEditor; server menolak operasi saat capability false meski UI dimanipulasi (FR-PROV-04). | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `E2E-0044-AC5` | [AC-5](#ac-5) | create, replace, drop diaudit (view.created, view.replaced, view.dropped) sebelum response sukses; drop dan jalur drop create memakai komponen konfirmasi des... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `E2E-0044-AC6` | [AC-6](#ac-6) | definisi yang gagal (SELECT tidak valid, kolom bentrok) tiba sebagai DbError berkategori dengan posisi bila tersedia, ditampilkan di editor seperti error query. | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `E2E-0044-AC7` | [AC-7](#ac-7) | setelah operasi, cache metadata di invalidate; tab data view yang definisinya berubah diberi tanda muat ulang. | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |
| `E2E-0044-AC8` | [AC-8](#ac-8) | e2e kedua engine: create view dari SELECT fixture, buka datanya, ubah definisi (termasuk kasus PostgreSQL yang butuh drop create dengan konfirmasi), drop; au... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

### Security

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `SEC-0044-AC3` | [AC-3](#ac-3) | POST /views membuat view; PUT /views/:ref memperbarui definisi: provider memilih strategi per engine (MySQL ALTER VIEW; PostgreSQL CREATE OR REPLACE bila kom... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `SEC-0044-AC5` | [AC-5](#ac-5) | create, replace, drop diaudit (view.created, view.replaced, view.dropped) sebelum response sukses; drop dan jalur drop create memakai komponen konfirmasi des... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `SEC-0044-AC8` | [AC-8](#ac-8) | e2e kedua engine: create view dari SELECT fixture, buka datanya, ubah definisi (termasuk kasus PostgreSQL yang butuh drop create dengan konfirmasi), drop; au... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

### Performance

Tidak ada performance yang diwajibkan oleh acceptance criteria saat ini.

### Visual dan accessibility

Tidak ada visual dan accessibility yang diwajibkan oleh acceptance criteria saat ini.

### Smoke dan operational acceptance

Tidak ada smoke dan operational yang diwajibkan oleh acceptance criteria saat ini.

### Manual atau external proof

Tidak ada manual atau external yang diwajibkan oleh acceptance criteria saat ini.

## Critical test scenarios

- PostgreSQL ubah definisi mengurangi kolom → server menjawab butuh drop create → UI konfirmasi → sukses dengan dua statement di pratinjau, verifikasi **AC-3**.
- Gerbang: capability viewEditor false (disimulasikan) → endpoint unsupported, verifikasi **AC-4**.
- Error posisi: SELECT salah → error menunjuk posisi di editor, verifikasi **AC-6**.

## Staged, environment, dan external proof

Tidak ada staged, environment, atau external proof khusus yang sudah diidentifikasi.

## Fixture dan environment

| Area | Aturan |
|---|---|
| Data | Gunakan data sintetis atau tersanitasi. Jangan memakai credential, token, atau data produksi nyata. |
| Resource | Database, file, port, process, dan container harus disposable serta memiliki cleanup deterministik. |
| Version | Pin versi environment yang dibuktikan. Jangan memakai label dinamis seperti `latest` sebagai bukti acceptance. |
| Root command | Instalasi dan command test selalu dimulai dari akar repo dan satu `package.json`. |

## Exit criteria test

- Setiap AC memiliki test ID atau jalur proof yang eksplisit pada [verify.md](verify.md).
- Unit dan integration test yang relevan diimplementasikan, lulus, dan dapat diulang dari checkout bersih.
- Test yang tidak relevan ditandai `n/a` dengan alasan yang tetap benar setelah implementasi.
- External proof tidak boleh diganti local smoke test. Staged proof tidak boleh ditutup sebelum dependency yang disebut tersedia.
- Tidak ada test yang dianggap lulus hanya karena file atau placeholder tersedia.
