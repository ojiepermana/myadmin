# Test dan acceptance criteria 0038. Data browser: jalur tulis

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Parsial lokal — route integration lulus 6 test/52 assertions, mutation builder/contract suite lulus 15 test/36 assertions, dan real-engine typed JSON/NULL/stale-conflict E2E lulus pada PostgreSQL/MySQL; security matrix serta full acceptance roundtrip belum lengkap.
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0038.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

kelayakan edit ditentukan server per table: `rowIdentity` = primary key, atau unique index semua kolomnya NOT NULL; tanpa itu, response read (spec 0037) menandai read only dengan alasan, dan UI menonaktifkan penyuntingan dengan penjelasan (FR-DATA-03).

### AC-2

`POST /data/rows` insert satu baris: nilai per kolom bertipe (bentuk sel berlabel tipe), kolom default/identity bisa dibiarkan; sukses mengembalikan baris hasil (nilai default terisi) dan grid menampilkannya.

### AC-3

`PATCH /data/rows` update: identitas baris (nilai kolom identity saat dibaca) plus perubahan kolom; provider membangun UPDATE berparameter dengan WHERE identitas penuh; affected rows wajib tepat 1, selain itu operasi dibatalkan (0 berarti baris berubah/hilang: konflik 409 dengan saran muat ulang; lebih dari 1 mustahil oleh identitas dan menjadi error internal yang membatalkan).

### AC-4

`POST /data/rows/delete` menerima daftar identitas baris; UI meminta konfirmasi menyebut jumlah dan target (table, koneksi); response memuat affected rows; bulk delete dari seleksi grid memakai jalur yang sama (FR-DATA-03, FR-SAFE-01).

### AC-5

editor sel bertipe: teks multiline, angka dengan validasi, boolean, tanggal/waktu dengan input terstruktur, enum dari tipe bila diketahui, JSON lewat editor JSON dengan validasi sintaks, set NULL eksplisit (berbeda dari string kosong); nilai biner tidak bisa diedit di V1 (ditampilkan read only, sesuai BLOB viewer V2).

### AC-6

konversi tipe dan binary safety milik provider: nilai dikirim bertipe dan di bind sebagai parameter; kegagalan konversi menghasilkan 422 dengan pesan kolom spesifik.

### AC-7

delete dan bulk delete diaudit (`data.rows_deleted`: table, jumlah, tanpa isi baris); insert dan update tidak diaudit default (bukan destructive; bagian 4.4 butir 6), namun tercatat di history? tidak, history khusus query editor; keputusan: insert/update tidak diaudit V1, konsisten definisi destructive bagian 2.

### AC-8

seluruh mutasi berjalan pada sesi khusus singkat (bukan sesi tab query) dalam transaksi per operasi; bulk delete satu transaksi (semua atau tidak sama sekali) dengan laporan jumlah.

### AC-9

e2e kedua engine: insert, edit sel (termasuk set NULL dan JSON), delete satu baris, bulk delete dengan konfirmasi; table tanpa PK terbukti read only dengan penjelasan; test konflik update baris yang sudah berubah.

## Matriks cakupan

| AC            | Unit          | Integration   | Contract      | E2E            | Security       | Performance | Visual | Smoke | Manual atau external |
| ------------- | ------------- | ------------- | ------------- | -------------- | -------------- | ----------- | ------ | ----- | -------------------- |
| [AC-1](#ac-1) | `UT-0038-AC1` | `IT-0038-AC1` | `CT-0038-AC1` | `E2E-0038-AC1` | n/a            | n/a         | n/a    | n/a   | n/a                  |
| [AC-2](#ac-2) | `UT-0038-AC2` | `IT-0038-AC2` | `CT-0038-AC2` | `E2E-0038-AC2` | n/a            | n/a         | n/a    | n/a   | n/a                  |
| [AC-3](#ac-3) | `UT-0038-AC3` | `IT-0038-AC3` | `CT-0038-AC3` | n/a            | n/a            | n/a         | n/a    | n/a   | n/a                  |
| [AC-4](#ac-4) | n/a           | `IT-0038-AC4` | `CT-0038-AC4` | `E2E-0038-AC4` | `SEC-0038-AC4` | n/a         | n/a    | n/a   | n/a                  |
| [AC-5](#ac-5) | `UT-0038-AC5` | n/a           | n/a           | `E2E-0038-AC5` | n/a            | n/a         | n/a    | n/a   | n/a                  |
| [AC-6](#ac-6) | `UT-0038-AC6` | `IT-0038-AC6` | `CT-0038-AC6` | n/a            | `SEC-0038-AC6` | n/a         | n/a    | n/a   | n/a                  |
| [AC-7](#ac-7) | n/a           | `IT-0038-AC7` | n/a           | n/a            | `SEC-0038-AC7` | n/a         | n/a    | n/a   | n/a                  |
| [AC-8](#ac-8) | n/a           | `IT-0038-AC8` | n/a           | n/a            | n/a            | n/a         | n/a    | n/a   | n/a                  |
| [AC-9](#ac-9) | n/a           | `IT-0038-AC9` | n/a           | `E2E-0038-AC9` | n/a            | n/a         | n/a    | n/a   | n/a                  |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

| ID            | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                                       | Expected result                                      |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `UT-0038-AC1` | [AC-1](#ac-1) | kelayakan edit ditentukan server per table: rowIdentity = primary key, atau unique index semua kolomnya NOT NULL; tanpa itu, response read (spec 0037) menand... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `UT-0038-AC2` | [AC-2](#ac-2) | POST /data/rows insert satu baris: nilai per kolom bertipe (bentuk sel berlabel tipe), kolom default/identity bisa dibiarkan; sukses mengembalikan baris hasi... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `UT-0038-AC3` | [AC-3](#ac-3) | PATCH /data/rows update: identitas baris (nilai kolom identity saat dibaca) plus perubahan kolom; provider membangun UPDATE berparameter dengan WHERE identit... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `UT-0038-AC5` | [AC-5](#ac-5) | editor sel bertipe: teks multiline, angka dengan validasi, boolean, tanggal/waktu dengan input terstruktur, enum dari tipe bila diketahui, JSON lewat editor...  | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `UT-0038-AC6` | [AC-6](#ac-6) | konversi tipe dan binary safety milik provider: nilai dikirim bertipe dan di bind sebagai parameter; kegagalan konversi menghasilkan 422 dengan pesan kolom s... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

## Integration test

| ID            | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                         | Expected result                                      |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `IT-0038-AC1` | [AC-1](#ac-1) | kelayakan edit ditentukan server per table: rowIdentity = primary key, atau unique index semua kolomnya NOT NULL; tanpa itu, response read (spec 0037) menand... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `IT-0038-AC2` | [AC-2](#ac-2) | POST /data/rows insert satu baris: nilai per kolom bertipe (bentuk sel berlabel tipe), kolom default/identity bisa dibiarkan; sukses mengembalikan baris hasi... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `IT-0038-AC3` | [AC-3](#ac-3) | PATCH /data/rows update: identitas baris (nilai kolom identity saat dibaca) plus perubahan kolom; provider membangun UPDATE berparameter dengan WHERE identit... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `IT-0038-AC4` | [AC-4](#ac-4) | POST /data/rows/delete menerima daftar identitas baris; UI meminta konfirmasi menyebut jumlah dan target (table, koneksi); response memuat affected rows; bul... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `IT-0038-AC6` | [AC-6](#ac-6) | konversi tipe dan binary safety milik provider: nilai dikirim bertipe dan di bind sebagai parameter; kegagalan konversi menghasilkan 422 dengan pesan kolom s... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `IT-0038-AC7` | [AC-7](#ac-7) | delete dan bulk delete diaudit (data.rows_deleted: table, jumlah, tanpa isi baris); insert dan update tidak diaudit default (bukan destructive; bagian 4.4 bu... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |
| `IT-0038-AC8` | [AC-8](#ac-8) | seluruh mutasi berjalan pada sesi khusus singkat (bukan sesi tab query) dalam transaksi per operasi; bulk delete satu transaksi (semua atau tidak sama sekali... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |
| `IT-0038-AC9` | [AC-9](#ac-9) | e2e kedua engine: insert, edit sel (termasuk set NULL dan JSON), delete satu baris, bulk delete dengan konfirmasi; table tanpa PK terbukti read only dengan p... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-9 terpenuhi. |

## Test tambahan

### Contract test

| ID            | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                          | Expected result                                      |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `CT-0038-AC1` | [AC-1](#ac-1) | kelayakan edit ditentukan server per table: rowIdentity = primary key, atau unique index semua kolomnya NOT NULL; tanpa itu, response read (spec 0037) menand... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `CT-0038-AC2` | [AC-2](#ac-2) | POST /data/rows insert satu baris: nilai per kolom bertipe (bentuk sel berlabel tipe), kolom default/identity bisa dibiarkan; sukses mengembalikan baris hasi... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `CT-0038-AC3` | [AC-3](#ac-3) | PATCH /data/rows update: identitas baris (nilai kolom identity saat dibaca) plus perubahan kolom; provider membangun UPDATE berparameter dengan WHERE identit... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `CT-0038-AC4` | [AC-4](#ac-4) | POST /data/rows/delete menerima daftar identitas baris; UI meminta konfirmasi menyebut jumlah dan target (table, koneksi); response memuat affected rows; bul... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `CT-0038-AC6` | [AC-6](#ac-6) | konversi tipe dan binary safety milik provider: nilai dikirim bertipe dan di bind sebagai parameter; kegagalan konversi menghasilkan 422 dengan pesan kolom s... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

### E2E

| ID             | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                       | Expected result                                      |
| -------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------- |
| `E2E-0038-AC1` | [AC-1](#ac-1) | kelayakan edit ditentukan server per table: rowIdentity = primary key, atau unique index semua kolomnya NOT NULL; tanpa itu, response read (spec 0037) menand... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `E2E-0038-AC2` | [AC-2](#ac-2) | POST /data/rows insert satu baris: nilai per kolom bertipe (bentuk sel berlabel tipe), kolom default/identity bisa dibiarkan; sukses mengembalikan baris hasi... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `E2E-0038-AC4` | [AC-4](#ac-4) | POST /data/rows/delete menerima daftar identitas baris; UI meminta konfirmasi menyebut jumlah dan target (table, koneksi); response memuat affected rows; bul... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `E2E-0038-AC5` | [AC-5](#ac-5) | editor sel bertipe: teks multiline, angka dengan validasi, boolean, tanggal/waktu dengan input terstruktur, enum dari tipe bila diketahui, JSON lewat editor...  | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `E2E-0038-AC9` | [AC-9](#ac-9) | e2e kedua engine: insert, edit sel (termasuk set NULL dan JSON), delete satu baris, bulk delete dengan konfirmasi; table tanpa PK terbukti read only dengan p... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-9 terpenuhi. |

### Security

| ID             | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                               | Expected result                                      |
| -------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `SEC-0038-AC4` | [AC-4](#ac-4) | POST /data/rows/delete menerima daftar identitas baris; UI meminta konfirmasi menyebut jumlah dan target (table, koneksi); response memuat affected rows; bul... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `SEC-0038-AC6` | [AC-6](#ac-6) | konversi tipe dan binary safety milik provider: nilai dikirim bertipe dan di bind sebagai parameter; kegagalan konversi menghasilkan 422 dengan pesan kolom s... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `SEC-0038-AC7` | [AC-7](#ac-7) | delete dan bulk delete diaudit (data.rows_deleted: table, jumlah, tanpa isi baris); insert dan update tidak diaudit default (bukan destructive; bagian 4.4 bu... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

### Performance

Tidak ada performance yang diwajibkan oleh acceptance criteria saat ini.

### Visual dan accessibility

Tidak ada visual dan accessibility yang diwajibkan oleh acceptance criteria saat ini.

### Smoke dan operational acceptance

Tidak ada smoke dan operational yang diwajibkan oleh acceptance criteria saat ini.

### Manual atau external proof

Tidak ada manual atau external yang diwajibkan oleh acceptance criteria saat ini.

## Critical test scenarios

- Konflik: baris diubah pihak lain → update affected 0 → 409 plus saran muat ulang, verifikasi **AC-3**.
- Atomik: bulk delete berisi satu identitas basi → seluruh transaksi batal, tidak ada baris terhapus, verifikasi **AC-4**, **AC-8**.
- Tipe: set NULL vs string kosong tersimpan berbeda; JSON tidak valid ditolak 422, verifikasi **AC-5**, **AC-6**.

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
