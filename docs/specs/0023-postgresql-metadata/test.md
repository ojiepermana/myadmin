# Test dan acceptance criteria 0023. Provider PostgreSQL: metadata dan introspeksi

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Belum dijalankan
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0023.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

`MetadataPort.listDatabases` mengembalikan nama, owner, encoding, collation, dan ukuran (ukuran boleh dihitung malas terpisah karena mahal); tanpa memuat object di dalamnya.

### AC-2

`listSchemas(database)` mengembalikan schema non sistem plus flag schema sistem bila diminta eksplisit; `listObjects(database, schema, type[], page)` mengembalikan table, view, sequence, function/procedure secara paginated (pageSize maksimum 500) dan tidak pernah menarik semua tipe sekaligus tanpa diminta.

### AC-3

`describeTable(ref)` mengembalikan kolom (nama, tipe tampil, nullability, default, identity, generated, komentar), primary key, foreign key (dengan referensi dan aturan ON), unique, check, index (termasuk komposit, unik, metode), dan perkiraan jumlah baris; cukup lengkap untuk table designer (spec 0041, 0042) tanpa query tambahan.

### AC-4

`getViewDefinition(ref)` mengembalikan definisi view; `listRoutines` mengembalikan nama dan signature untuk ditampilkan explorer (tanpa editor GUI, FR-TBL-04).

### AC-5

`searchObjects(scope, q, type[], page)` mencari nama object (awalan dan substring) pada lingkup koneksi atau database di sisi server dengan pagination; tidak ada jalur yang mengunduh katalog penuh ke klien (FR-EXP-03, NFR-01).

### AC-6

semua identifier yang disisipkan ke query katalog di quote benar (fungsi quoting tunggal teruji); input pencarian dipakai sebagai parameter, bukan disambung ke SQL.

### AC-7

hasil sesuai model umum spec 0021 sehingga MySQL (spec 0025) menghasilkan bentuk yang sama; test kontrak metadata generik dijalankan pada server nyata.

### AC-8

performa: pada database sintetis 2000 table, `listObjects` per halaman tetap di bawah ambang wajar dan explorer tidak pernah meminta lebih dari satu halaman per ekspansi (test performa di `tests/performance/`).

## Matriks cakupan

| AC | Unit | Integration | Contract | E2E | Security | Performance | Visual | Smoke | Manual atau external |
|---|---|---|---|---|---|---|---|---|---|
| [AC-1](#ac-1) | n/a | `IT-0023-AC1` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-2](#ac-2) | n/a | `IT-0023-AC2` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-3](#ac-3) | n/a | `IT-0023-AC3` | `CT-0023-AC3` | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-4](#ac-4) | n/a | `IT-0023-AC4` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-5](#ac-5) | n/a | `IT-0023-AC5` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-6](#ac-6) | `UT-0023-AC6` | n/a | n/a | n/a | `SEC-0023-AC6` | n/a | n/a | n/a | n/a |
| [AC-7](#ac-7) | n/a | `IT-0023-AC7` | `CT-0023-AC7` | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-8](#ac-8) | n/a | n/a | n/a | n/a | n/a | `PERF-0023-AC8` | n/a | n/a | n/a |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `UT-0023-AC6` | [AC-6](#ac-6) | semua identifier yang disisipkan ke query katalog di quote benar (fungsi quoting tunggal teruji); input pencarian dipakai sebagai parameter, bukan disambung... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

## Integration test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `IT-0023-AC1` | [AC-1](#ac-1) | MetadataPort.listDatabases mengembalikan nama, owner, encoding, collation, dan ukuran (ukuran boleh dihitung malas terpisah karena mahal); tanpa memuat objec... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `IT-0023-AC2` | [AC-2](#ac-2) | listSchemas(database) mengembalikan schema non sistem plus flag schema sistem bila diminta eksplisit; listObjects(database, schema, type[], page) mengembalik... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `IT-0023-AC3` | [AC-3](#ac-3) | describeTable(ref) mengembalikan kolom (nama, tipe tampil, nullability, default, identity, generated, komentar), primary key, foreign key (dengan referensi d... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `IT-0023-AC4` | [AC-4](#ac-4) | getViewDefinition(ref) mengembalikan definisi view; listRoutines mengembalikan nama dan signature untuk ditampilkan explorer (tanpa editor GUI, FR-TBL-04). | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `IT-0023-AC5` | [AC-5](#ac-5) | searchObjects(scope, q, type[], page) mencari nama object (awalan dan substring) pada lingkup koneksi atau database di sisi server dengan pagination; tidak a... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `IT-0023-AC7` | [AC-7](#ac-7) | hasil sesuai model umum spec 0021 sehingga MySQL (spec 0025) menghasilkan bentuk yang sama; test kontrak metadata generik dijalankan pada server nyata. | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

## Test tambahan

### Contract test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `CT-0023-AC3` | [AC-3](#ac-3) | describeTable(ref) mengembalikan kolom (nama, tipe tampil, nullability, default, identity, generated, komentar), primary key, foreign key (dengan referensi d... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `CT-0023-AC7` | [AC-7](#ac-7) | hasil sesuai model umum spec 0021 sehingga MySQL (spec 0025) menghasilkan bentuk yang sama; test kontrak metadata generik dijalankan pada server nyata. | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

### E2E

Tidak ada e2e yang diwajibkan oleh acceptance criteria saat ini.

### Security

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `SEC-0023-AC6` | [AC-6](#ac-6) | semua identifier yang disisipkan ke query katalog di quote benar (fungsi quoting tunggal teruji); input pencarian dipakai sebagai parameter, bukan disambung... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

### Performance

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `PERF-0023-AC8` | [AC-8](#ac-8) | performa: pada database sintetis 2000 table, listObjects per halaman tetap di bawah ambang wajar dan explorer tidak pernah meminta lebih dari satu halaman pe... | Tetapkan dataset, baseline, ambang, pengulangan, dan toleransi sebelum eksekusi. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

### Visual dan accessibility

Tidak ada visual dan accessibility yang diwajibkan oleh acceptance criteria saat ini.

### Smoke dan operational acceptance

Tidak ada smoke dan operational yang diwajibkan oleh acceptance criteria saat ini.

### Manual atau external proof

Tidak ada manual atau external yang diwajibkan oleh acceptance criteria saat ini.

## Critical test scenarios

- Lazy: ekspansi node hanya memicu query untuk node itu (dihitung lewat statement log server test), verifikasi **AC-2**, **AC-8**.
- Kelengkapan: describeTable pada table fixture dengan semua jenis constraint menghasilkan model lengkap, verifikasi **AC-3**.
- Injeksi: pencarian dengan string berbahaya (`'; drop table`) aman dan mengembalikan hasil kosong yang benar, verifikasi **AC-6**.

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
