# Test dan acceptance criteria 0047. Export

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Parsial lokal — export unit/contract/integration, real-engine roundtrip, dan browser export flow lulus; performance skala besar, security matrix, visual/manual, dan acceptance penuh belum lengkap.
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0047.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

`POST /export` membuat job export dengan sumber: table (ref plus filter/sort/kolom aktif opsional dari data browser), query (SQL plus konteks), selection (identitas baris terpilih), atau database (per table, PostgreSQL per schema juga); format: `sql` (INSERT statements plus opsi struktur), `csv` (delimiter, header, quoting, encoding UTF-8), `json` (array objek, streaming); response berisi jobId seketika.

### AC-2

opsi SQL export: structure only, data only, atau keduanya (sejalan opsi backup feature.md); struktur dihasilkan dari DDL provider (CREATE TABLE dari metadata); INSERT dalam batch dengan quoting nilai milik provider.

### AC-3

eksekusi streaming: provider membaca baris lewat cursor/stream (tanpa memuat seluruh hasil ke memori), penulis format menulis bertahap ke file di `<data-dir>/temp/exports/<jobId>.<ext>`; memori proses tetap datar pada table jutaan baris (dibuktikan test dengan pemantauan memori kasar).

### AC-4

progress dilaporkan (baris ditulis; total bila diketahui dari perkiraan) lewat job events; cancel menghormati AbortSignal, menghentikan cursor, dan menghapus file parsial.

### AC-5

`GET /export/:jobId/download` mengunduh hasil (pemilik saja) dengan nama file yang bermakna (objek, waktu); file kadaluarsa dan dihapus setelah 1 jam atau saat diunduh plus grace (kebijakan: hapus 10 menit setelah unduhan pertama selesai, maksimum 1 jam); doctor tidak diperlukan, pembersih temp berkala menjaga folder.

### AC-6

UI: dialog export dari context menu table, tombol export data browser (membawa filter aktif), tombol export result grid (jalur penuh kini aktif), dan halaman import-export berisi panel jobs (daftar job milik user dengan progress, cancel, unduh); panel jobs generik ini dipakai juga backup/restore.

### AC-7

export selesai tercatat audit (`export.completed`: sumber, format, jumlah baris; tanpa isi data); export tidak memuat credential dalam bentuk apa pun.

### AC-8

e2e kedua engine: export CSV table 100 ribu baris dengan progress dan unduhan benar (jumlah baris cocok), cancel di tengah menghapus file parsial, export SQL structure plus data bisa diimpor balik (roundtrip dengan spec 0048 kelak).

## Matriks cakupan

| AC            | Unit          | Integration   | Contract      | E2E            | Security       | Performance     | Visual | Smoke | Manual atau external |
| ------------- | ------------- | ------------- | ------------- | -------------- | -------------- | --------------- | ------ | ----- | -------------------- |
| [AC-1](#ac-1) | `UT-0047-AC1` | `IT-0047-AC1` | `CT-0047-AC1` | n/a            | n/a            | n/a             | n/a    | n/a   | n/a                  |
| [AC-2](#ac-2) | `UT-0047-AC2` | `IT-0047-AC2` | n/a           | n/a            | `SEC-0047-AC2` | n/a             | n/a    | n/a   | n/a                  |
| [AC-3](#ac-3) | n/a           | `IT-0047-AC3` | n/a           | n/a            | n/a            | `PERF-0047-AC3` | n/a    | n/a   | n/a                  |
| [AC-4](#ac-4) | `UT-0047-AC4` | `IT-0047-AC4` | `CT-0047-AC4` | `E2E-0047-AC4` | n/a            | n/a             | n/a    | n/a   | n/a                  |
| [AC-5](#ac-5) | `UT-0047-AC5` | `IT-0047-AC5` | `CT-0047-AC5` | n/a            | `SEC-0047-AC5` | n/a             | n/a    | n/a   | n/a                  |
| [AC-6](#ac-6) | n/a           | n/a           | n/a           | `E2E-0047-AC6` | n/a            | n/a             | n/a    | n/a   | n/a                  |
| [AC-7](#ac-7) | n/a           | `IT-0047-AC7` | n/a           | n/a            | `SEC-0047-AC7` | n/a             | n/a    | n/a   | n/a                  |
| [AC-8](#ac-8) | n/a           | `IT-0047-AC8` | n/a           | `E2E-0047-AC8` | n/a            | `PERF-0047-AC8` | n/a    | n/a   | n/a                  |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

| ID            | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                                       | Expected result                                      |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `UT-0047-AC1` | [AC-1](#ac-1) | POST /export membuat job export dengan sumber: table (ref plus filter/sort/kolom aktif opsional dari data browser), query (SQL plus konteks), selection (iden... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `UT-0047-AC2` | [AC-2](#ac-2) | opsi SQL export: structure only, data only, atau keduanya (sejalan opsi backup feature.md); struktur dihasilkan dari DDL provider (CREATE TABLE dari metadata... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `UT-0047-AC4` | [AC-4](#ac-4) | progress dilaporkan (baris ditulis; total bila diketahui dari perkiraan) lewat job events; cancel menghormati AbortSignal, menghentikan cursor, dan menghapus... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `UT-0047-AC5` | [AC-5](#ac-5) | GET /export/:jobId/download mengunduh hasil (pemilik saja) dengan nama file yang bermakna (objek, waktu); file kadaluarsa dan dihapus setelah 1 jam atau saat... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |

## Integration test

| ID            | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                         | Expected result                                      |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `IT-0047-AC1` | [AC-1](#ac-1) | POST /export membuat job export dengan sumber: table (ref plus filter/sort/kolom aktif opsional dari data browser), query (SQL plus konteks), selection (iden... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `IT-0047-AC2` | [AC-2](#ac-2) | opsi SQL export: structure only, data only, atau keduanya (sejalan opsi backup feature.md); struktur dihasilkan dari DDL provider (CREATE TABLE dari metadata... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `IT-0047-AC3` | [AC-3](#ac-3) | eksekusi streaming: provider membaca baris lewat cursor/stream (tanpa memuat seluruh hasil ke memori), penulis format menulis bertahap ke file di <data-dir>/... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `IT-0047-AC4` | [AC-4](#ac-4) | progress dilaporkan (baris ditulis; total bila diketahui dari perkiraan) lewat job events; cancel menghormati AbortSignal, menghentikan cursor, dan menghapus... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `IT-0047-AC5` | [AC-5](#ac-5) | GET /export/:jobId/download mengunduh hasil (pemilik saja) dengan nama file yang bermakna (objek, waktu); file kadaluarsa dan dihapus setelah 1 jam atau saat... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `IT-0047-AC7` | [AC-7](#ac-7) | export selesai tercatat audit (export.completed: sumber, format, jumlah baris; tanpa isi data); export tidak memuat credential dalam bentuk apa pun.             | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |
| `IT-0047-AC8` | [AC-8](#ac-8) | e2e kedua engine: export CSV table 100 ribu baris dengan progress dan unduhan benar (jumlah baris cocok), cancel di tengah menghapus file parsial, export SQL... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

## Test tambahan

### Contract test

| ID            | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                          | Expected result                                      |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `CT-0047-AC1` | [AC-1](#ac-1) | POST /export membuat job export dengan sumber: table (ref plus filter/sort/kolom aktif opsional dari data browser), query (SQL plus konteks), selection (iden... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `CT-0047-AC4` | [AC-4](#ac-4) | progress dilaporkan (baris ditulis; total bila diketahui dari perkiraan) lewat job events; cancel menghormati AbortSignal, menghentikan cursor, dan menghapus... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `CT-0047-AC5` | [AC-5](#ac-5) | GET /export/:jobId/download mengunduh hasil (pemilik saja) dengan nama file yang bermakna (objek, waktu); file kadaluarsa dan dihapus setelah 1 jam atau saat... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |

### E2E

| ID             | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                       | Expected result                                      |
| -------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------- |
| `E2E-0047-AC4` | [AC-4](#ac-4) | progress dilaporkan (baris ditulis; total bila diketahui dari perkiraan) lewat job events; cancel menghormati AbortSignal, menghentikan cursor, dan menghapus... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `E2E-0047-AC6` | [AC-6](#ac-6) | UI: dialog export dari context menu table, tombol export data browser (membawa filter aktif), tombol export result grid (jalur penuh kini aktif), dan halaman... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `E2E-0047-AC8` | [AC-8](#ac-8) | e2e kedua engine: export CSV table 100 ribu baris dengan progress dan unduhan benar (jumlah baris cocok), cancel di tengah menghapus file parsial, export SQL... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

### Security

| ID             | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                               | Expected result                                      |
| -------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `SEC-0047-AC2` | [AC-2](#ac-2) | opsi SQL export: structure only, data only, atau keduanya (sejalan opsi backup feature.md); struktur dihasilkan dari DDL provider (CREATE TABLE dari metadata... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `SEC-0047-AC5` | [AC-5](#ac-5) | GET /export/:jobId/download mengunduh hasil (pemilik saja) dengan nama file yang bermakna (objek, waktu); file kadaluarsa dan dihapus setelah 1 jam atau saat... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `SEC-0047-AC7` | [AC-7](#ac-7) | export selesai tercatat audit (export.completed: sumber, format, jumlah baris; tanpa isi data); export tidak memuat credential dalam bentuk apa pun.             | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

### Performance

| ID              | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                               | Expected result                                      |
| --------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `PERF-0047-AC3` | [AC-3](#ac-3) | eksekusi streaming: provider membaca baris lewat cursor/stream (tanpa memuat seluruh hasil ke memori), penulis format menulis bertahap ke file di <data-dir>/... | Tetapkan dataset, baseline, ambang, pengulangan, dan toleransi sebelum eksekusi. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `PERF-0047-AC8` | [AC-8](#ac-8) | e2e kedua engine: export CSV table 100 ribu baris dengan progress dan unduhan benar (jumlah baris cocok), cancel di tengah menghapus file parsial, export SQL... | Tetapkan dataset, baseline, ambang, pengulangan, dan toleransi sebelum eksekusi. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

### Visual dan accessibility

Tidak ada visual dan accessibility yang diwajibkan oleh acceptance criteria saat ini.

### Smoke dan operational acceptance

Tidak ada smoke dan operational yang diwajibkan oleh acceptance criteria saat ini.

### Manual atau external proof

Tidak ada manual atau external yang diwajibkan oleh acceptance criteria saat ini.

## Critical test scenarios

- Memori datar pada 1 juta baris CSV, verifikasi **AC-3**.
- Cancel menghapus file parsial dan status cancelled, verifikasi **AC-4**.
- Kepemilikan: user lain mengunduh → 404, verifikasi **AC-5**.

## Staged, environment, dan external proof

| AC            | Jenis bukti | Kewajiban                                                    |
| ------------- | ----------- | ------------------------------------------------------------ |
| [AC-8](#ac-8) | `staged`    | Roundtrip SQL baru dapat ditutup setelah spec 0048 tersedia. |

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
