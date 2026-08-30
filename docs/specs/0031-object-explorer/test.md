# Test dan acceptance criteria 0031. Object explorer

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Parsial lokal — metadata route/contract, provider authorization, lazy tree/search/retry browser flow lulus; manual review, formal performance, dan accessibility belum lengkap.
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0031.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

endpoint metadata terdefinisi di kontrak dan diimplementasikan: `GET /connections/:id/databases`, `GET /connections/:id/databases/:db/children` (schema atau object sesuai capability), `GET .../schemas/:schema/objects?type=&page=`, `GET .../objects/describe?ref=`; semua paginated sesuai kontrak provider dan hanya untuk koneksi tersambung milik user (409 `NOT_CONNECTED` bila belum connect).

### AC-2

pohon dirender dari data: koneksi (per group, dengan indikator status), database, node schema hanya muncul bila `capabilities.schemas` true, folder object per tipe (Tables, Views, Routines, Triggers bila provider memaparkan); tidak ada percabangan nama engine di kode UI (FR-PROV-04, dibuktikan review dan tidak adanya string engine di feature explorer).

### AC-3

ekspansi node memuat hanya anak node itu (satu halaman pertama); folder besar menampilkan item "Muat lebih banyak" untuk halaman berikutnya; tanpa prefetch rekursif (FR-EXP-01, NFR-01).

### AC-4

node menampilkan ikon per tipe, nama, dan detail ringkas (misal jumlah perkiraan baris pada table bila sudah dimuat); loading dan error per node (error node tidak merobohkan pohon, bisa retry).

### AC-5

context menu per jenis node berisi aksi yang capability dan spec nya tersedia, dinonaktifkan dengan penjelasan bila tidak (prinsip scope butir 4): koneksi (connect, disconnect, edit, test), database (browse properti, create/drop [spec 0039]), table (browse data [0037], design [0041], drop/rename/truncate [0043]), view (open definition, edit [0044]), routine/trigger (lihat definisi di query editor, FR-TBL-04); aksi yang spec nya belum terbangun tidak muncul sampai fiturnya ada.

### AC-6

refresh manual per node menginvalidasi cache metadata node itu (spec 0023/0025) dan memuat ulang.

### AC-7

pohon virtualized (ribuan node tetap mulus), navigasi keyboard penuh (panah, Enter ekspansi, menu kunci konteks), memakai komponen tree foundation.

### AC-8

e2e pada kedua engine: telusuri sampai kolom table, verifikasi MySQL tanpa lapisan schema dan PostgreSQL dengan schema, context menu muncul sesuai capability.

## Matriks cakupan

| AC            | Unit | Integration   | Contract      | E2E            | Security       | Performance     | Visual         | Smoke | Manual atau external |
| ------------- | ---- | ------------- | ------------- | -------------- | -------------- | --------------- | -------------- | ----- | -------------------- |
| [AC-1](#ac-1) | n/a  | `IT-0031-AC1` | `CT-0031-AC1` | n/a            | `SEC-0031-AC1` | n/a             | n/a            | n/a   | n/a                  |
| [AC-2](#ac-2) | n/a  | n/a           | n/a           | `E2E-0031-AC2` | n/a            | n/a             | n/a            | n/a   | `MANUAL-0031-AC2`    |
| [AC-3](#ac-3) | n/a  | n/a           | n/a           | `E2E-0031-AC3` | n/a            | n/a             | n/a            | n/a   | n/a                  |
| [AC-4](#ac-4) | n/a  | n/a           | n/a           | `E2E-0031-AC4` | n/a            | n/a             | `VIS-0031-AC4` | n/a   | n/a                  |
| [AC-5](#ac-5) | n/a  | n/a           | n/a           | `E2E-0031-AC5` | n/a            | n/a             | n/a            | n/a   | n/a                  |
| [AC-6](#ac-6) | n/a  | n/a           | n/a           | `E2E-0031-AC6` | n/a            | n/a             | n/a            | n/a   | n/a                  |
| [AC-7](#ac-7) | n/a  | n/a           | n/a           | `E2E-0031-AC7` | n/a            | `PERF-0031-AC7` | `VIS-0031-AC7` | n/a   | n/a                  |
| [AC-8](#ac-8) | n/a  | n/a           | n/a           | `E2E-0031-AC8` | n/a            | n/a             | n/a            | n/a   | n/a                  |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

Tidak ada unit yang diwajibkan oleh acceptance criteria saat ini.

## Integration test

| ID            | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                         | Expected result                                      |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `IT-0031-AC1` | [AC-1](#ac-1) | endpoint metadata terdefinisi di kontrak dan diimplementasikan: GET /connections/:id/databases, GET /connections/:id/databases/:db/children (schema atau obje... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |

## Test tambahan

### Contract test

| ID            | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                          | Expected result                                      |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `CT-0031-AC1` | [AC-1](#ac-1) | endpoint metadata terdefinisi di kontrak dan diimplementasikan: GET /connections/:id/databases, GET /connections/:id/databases/:db/children (schema atau obje... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |

### E2E

| ID             | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                       | Expected result                                      |
| -------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------- |
| `E2E-0031-AC2` | [AC-2](#ac-2) | pohon dirender dari data: koneksi (per group, dengan indikator status), database, node schema hanya muncul bila capabilities.schemas true, folder object per...  | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `E2E-0031-AC3` | [AC-3](#ac-3) | ekspansi node memuat hanya anak node itu (satu halaman pertama); folder besar menampilkan item "Muat lebih banyak" untuk halaman berikutnya; tanpa prefetch r... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `E2E-0031-AC4` | [AC-4](#ac-4) | node menampilkan ikon per tipe, nama, dan detail ringkas (misal jumlah perkiraan baris pada table bila sudah dimuat); loading dan error per node (error node...  | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `E2E-0031-AC5` | [AC-5](#ac-5) | context menu per jenis node berisi aksi yang capability dan spec nya tersedia, dinonaktifkan dengan penjelasan bila tidak (prinsip scope butir 4): koneksi (c... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `E2E-0031-AC6` | [AC-6](#ac-6) | refresh manual per node menginvalidasi cache metadata node itu (spec 0023/0025) dan memuat ulang.                                                                | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `E2E-0031-AC7` | [AC-7](#ac-7) | pohon virtualized (ribuan node tetap mulus), navigasi keyboard penuh (panah, Enter ekspansi, menu kunci konteks), memakai komponen tree foundation.              | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |
| `E2E-0031-AC8` | [AC-8](#ac-8) | e2e pada kedua engine: telusuri sampai kolom table, verifikasi MySQL tanpa lapisan schema dan PostgreSQL dengan schema, context menu muncul sesuai capability.   | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

### Security

| ID             | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                               | Expected result                                      |
| -------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `SEC-0031-AC1` | [AC-1](#ac-1) | endpoint metadata terdefinisi di kontrak dan diimplementasikan: GET /connections/:id/databases, GET /connections/:id/databases/:db/children (schema atau obje... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |

### Performance

| ID              | AC            | Fokus                                                                                                                                               | Scenario terencana                                                               | Expected result                                      |
| --------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `PERF-0031-AC7` | [AC-7](#ac-7) | pohon virtualized (ribuan node tetap mulus), navigasi keyboard penuh (panah, Enter ekspansi, menu kunci konteks), memakai komponen tree foundation. | Tetapkan dataset, baseline, ambang, pengulangan, dan toleransi sebelum eksekusi. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

### Visual dan accessibility

| ID             | AC            | Fokus                                                                                                                                                           | Scenario terencana                                                                    | Expected result                                      |
| -------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `VIS-0031-AC4` | [AC-4](#ac-4) | node menampilkan ikon per tipe, nama, dan detail ringkas (misal jumlah perkiraan baris pada table bila sudah dimuat); loading dan error per node (error node... | Kunci viewport, mode warna, state komponen, interaksi keyboard, dan bukti screenshot. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `VIS-0031-AC7` | [AC-7](#ac-7) | pohon virtualized (ribuan node tetap mulus), navigasi keyboard penuh (panah, Enter ekspansi, menu kunci konteks), memakai komponen tree foundation.             | Kunci viewport, mode warna, state komponen, interaksi keyboard, dan bukti screenshot. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

### Smoke dan operational acceptance

Tidak ada smoke dan operational yang diwajibkan oleh acceptance criteria saat ini.

### Manual atau external proof

| ID                | AC            | Fokus                                                                                                                                                           | Scenario terencana                                                                               | Expected result                                      |
| ----------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `MANUAL-0031-AC2` | [AC-2](#ac-2) | pohon dirender dari data: koneksi (per group, dengan indikator status), database, node schema hanya muncul bila capabilities.schemas true, folder object per... | Lakukan review manusia atau kumpulkan bukti eksternal yang tidak dapat digantikan test otomatis. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |

## Critical test scenarios

- Lazy: ekspansi memicu tepat satu request halaman pertama, verifikasi **AC-3**.
- Capability: koneksi MySQL tidak menampilkan lapisan schema; menu schema management tidak ada, verifikasi **AC-2**, **AC-5**.
- Ketahanan: node database gagal (koneksi putus) → error lokal plus retry, pohon lain utuh, verifikasi **AC-4**.

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
