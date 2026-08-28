# Test dan acceptance criteria 0025. Provider MySQL: metadata dan introspeksi

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Belum dijalankan
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0025.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

`listDatabases` mengembalikan database non sistem (sys, mysql, information_schema, performance_schema disaring kecuali diminta), dengan charset, collation, dan ukuran (malas); `listSchemas` mengembalikan kosong dan bukan error (capability `schemas` false).

### AC-2

`listObjects(database, type[], page)` mengembalikan table, view, routine (function dan procedure), dan trigger paginated (pageSize maksimum 500), dengan `ObjectRef.schema` bernilai null.

### AC-3

`describeTable(ref)` selengkap versi PostgreSQL untuk hal yang berlaku: kolom (tipe, nullability, default, auto_increment sebagai identity, generated, komentar), primary key, foreign key dengan aturan ON, unique, check (bila versi mendukung), index (komposit, unik, tipe), engine penyimpanan dan collation table sebagai properti tambahan, perkiraan jumlah baris; cukup untuk table designer.

### AC-4

`getViewDefinition(ref)` mengembalikan definisi view; `listRoutines` dan daftar trigger untuk tampilan explorer.

### AC-5

`searchObjects(scope, q, type[], page)` server side paginated pada information_schema; tanpa unduhan katalog penuh.

### AC-6

quoting identifier MySQL (backtick) lewat satu fungsi teruji; nilai pencarian sebagai parameter.

### AC-7

test kontrak metadata generik (spec 0021) lulus pada MySQL nyata; bentuk hasil identik lintas provider (dibuktikan test bentuk yang membandingkan skema objek hasil PostgreSQL dan MySQL).

### AC-8

performa: database sintetis 2000 table, per halaman tetap responsif dan ekspansi node hanya memicu query node itu.

## Matriks cakupan

| AC | Unit | Integration | Contract | E2E | Security | Performance | Visual | Smoke | Manual atau external |
|---|---|---|---|---|---|---|---|---|---|
| [AC-1](#ac-1) | n/a | `IT-0025-AC1` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-2](#ac-2) | n/a | `IT-0025-AC2` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-3](#ac-3) | n/a | `IT-0025-AC3` | `CT-0025-AC3` | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-4](#ac-4) | n/a | `IT-0025-AC4` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-5](#ac-5) | n/a | `IT-0025-AC5` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-6](#ac-6) | `UT-0025-AC6` | n/a | n/a | n/a | `SEC-0025-AC6` | n/a | n/a | n/a | n/a |
| [AC-7](#ac-7) | n/a | `IT-0025-AC7` | `CT-0025-AC7` | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-8](#ac-8) | n/a | n/a | n/a | n/a | n/a | `PERF-0025-AC8` | n/a | n/a | n/a |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `UT-0025-AC6` | [AC-6](#ac-6) | quoting identifier MySQL (backtick) lewat satu fungsi teruji; nilai pencarian sebagai parameter. | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

## Integration test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `IT-0025-AC1` | [AC-1](#ac-1) | listDatabases mengembalikan database non sistem (sys, mysql, information_schema, performance_schema disaring kecuali diminta), dengan charset, collation, dan... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `IT-0025-AC2` | [AC-2](#ac-2) | listObjects(database, type[], page) mengembalikan table, view, routine (function dan procedure), dan trigger paginated (pageSize maksimum 500), dengan Object... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `IT-0025-AC3` | [AC-3](#ac-3) | describeTable(ref) selengkap versi PostgreSQL untuk hal yang berlaku: kolom (tipe, nullability, default, auto_increment sebagai identity, generated, komentar... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `IT-0025-AC4` | [AC-4](#ac-4) | getViewDefinition(ref) mengembalikan definisi view; listRoutines dan daftar trigger untuk tampilan explorer. | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `IT-0025-AC5` | [AC-5](#ac-5) | searchObjects(scope, q, type[], page) server side paginated pada information_schema; tanpa unduhan katalog penuh. | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `IT-0025-AC7` | [AC-7](#ac-7) | test kontrak metadata generik (spec 0021) lulus pada MySQL nyata; bentuk hasil identik lintas provider (dibuktikan test bentuk yang membandingkan skema objek... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

## Test tambahan

### Contract test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `CT-0025-AC3` | [AC-3](#ac-3) | describeTable(ref) selengkap versi PostgreSQL untuk hal yang berlaku: kolom (tipe, nullability, default, auto_increment sebagai identity, generated, komentar... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `CT-0025-AC7` | [AC-7](#ac-7) | test kontrak metadata generik (spec 0021) lulus pada MySQL nyata; bentuk hasil identik lintas provider (dibuktikan test bentuk yang membandingkan skema objek... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

### E2E

Tidak ada e2e yang diwajibkan oleh acceptance criteria saat ini.

### Security

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `SEC-0025-AC6` | [AC-6](#ac-6) | quoting identifier MySQL (backtick) lewat satu fungsi teruji; nilai pencarian sebagai parameter. | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

### Performance

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `PERF-0025-AC8` | [AC-8](#ac-8) | performa: database sintetis 2000 table, per halaman tetap responsif dan ekspansi node hanya memicu query node itu. | Tetapkan dataset, baseline, ambang, pengulangan, dan toleransi sebelum eksekusi. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

### Visual dan accessibility

Tidak ada visual dan accessibility yang diwajibkan oleh acceptance criteria saat ini.

### Smoke dan operational acceptance

Tidak ada smoke dan operational yang diwajibkan oleh acceptance criteria saat ini.

### Manual atau external proof

Tidak ada manual atau external yang diwajibkan oleh acceptance criteria saat ini.

## Critical test scenarios

- Bentuk: hasil describeTable MySQL dan PostgreSQL memvalidasi terhadap schema model umum yang sama, verifikasi **AC-3**, **AC-7**.
- Lazy dan performa pada 2000 table, verifikasi **AC-8**.
- Injeksi pada pencarian, verifikasi **AC-6**.

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
