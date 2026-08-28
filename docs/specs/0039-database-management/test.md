# Test dan acceptance criteria 0039. Manajemen database

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Belum dijalankan
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0039.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

halaman properti database (dari context menu explorer): nama, owner (PostgreSQL), encoding/charset, collation, ukuran (dimuat malas), jumlah object ringkas; hanya properti yang provider paparkan (tanpa nilai kosong palsu).

### AC-2

`POST /databases` membuat database: PostgreSQL (nama, owner opsional, encoding, template opsional), MySQL (nama, charset, collation); formulir UI menampilkan opsi per capability/metadata engine (daftar charset/collation diambil dari server target, bukan hardcode); validasi nama oleh provider; sukses memunculkan node baru di explorer.

### AC-3

`DELETE /databases/:name` drop database: konfirmasi UI mewajibkan mengetik ulang nama database persis dan menampilkan label koneksi plus engine; server menolak drop database yang sedang dipakai sesi tab aktif user itu dengan pesan jelas (tutup tab dulu), dan meneruskan error provider bila ada koneksi lain (misal PostgreSQL "database is being accessed").

### AC-4

drop dan create diaudit (`database.created`, `database.dropped`) dengan target dan koneksi, sebelum response sukses (FR-AUD-01); drop memuat konfirmasi eksplisit di jalur API juga (field `confirmName` yang harus sama, pertahanan kedua di server, FR-SAFE-01).

### AC-5

kegagalan (hak kurang, nama dipakai, charset tidak valid) tiba sebagai `DbError` berkategori dengan pesan aman dan ditampilkan di formulir.

### AC-6

e2e kedua engine: create dengan opsi engine yang benar, properti tampil, drop dengan ketik nama, audit tercatat; drop dengan nama konfirmasi salah ditolak server.

## Matriks cakupan

| AC | Unit | Integration | Contract | E2E | Security | Performance | Visual | Smoke | Manual atau external |
|---|---|---|---|---|---|---|---|---|---|
| [AC-1](#ac-1) | n/a | `IT-0039-AC1` | n/a | `E2E-0039-AC1` | n/a | n/a | n/a | n/a | n/a |
| [AC-2](#ac-2) | `UT-0039-AC2` | `IT-0039-AC2` | `CT-0039-AC2` | `E2E-0039-AC2` | n/a | n/a | n/a | n/a | n/a |
| [AC-3](#ac-3) | n/a | `IT-0039-AC3` | `CT-0039-AC3` | `E2E-0039-AC3` | `SEC-0039-AC3` | n/a | n/a | n/a | n/a |
| [AC-4](#ac-4) | n/a | `IT-0039-AC4` | `CT-0039-AC4` | n/a | `SEC-0039-AC4` | n/a | n/a | n/a | n/a |
| [AC-5](#ac-5) | `UT-0039-AC5` | `IT-0039-AC5` | n/a | `E2E-0039-AC5` | `SEC-0039-AC5` | n/a | n/a | n/a | n/a |
| [AC-6](#ac-6) | n/a | `IT-0039-AC6` | n/a | `E2E-0039-AC6` | `SEC-0039-AC6` | n/a | n/a | n/a | n/a |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `UT-0039-AC2` | [AC-2](#ac-2) | POST /databases membuat database: PostgreSQL (nama, owner opsional, encoding, template opsional), MySQL (nama, charset, collation); formulir UI menampilkan o... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `UT-0039-AC5` | [AC-5](#ac-5) | kegagalan (hak kurang, nama dipakai, charset tidak valid) tiba sebagai DbError berkategori dengan pesan aman dan ditampilkan di formulir. | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |

## Integration test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `IT-0039-AC1` | [AC-1](#ac-1) | halaman properti database (dari context menu explorer): nama, owner (PostgreSQL), encoding/charset, collation, ukuran (dimuat malas), jumlah object ringkas;... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `IT-0039-AC2` | [AC-2](#ac-2) | POST /databases membuat database: PostgreSQL (nama, owner opsional, encoding, template opsional), MySQL (nama, charset, collation); formulir UI menampilkan o... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `IT-0039-AC3` | [AC-3](#ac-3) | DELETE /databases/:name drop database: konfirmasi UI mewajibkan mengetik ulang nama database persis dan menampilkan label koneksi plus engine; server menolak... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `IT-0039-AC4` | [AC-4](#ac-4) | drop dan create diaudit (database.created, database.dropped) dengan target dan koneksi, sebelum response sukses (FR-AUD-01); drop memuat konfirmasi eksplisit... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `IT-0039-AC5` | [AC-5](#ac-5) | kegagalan (hak kurang, nama dipakai, charset tidak valid) tiba sebagai DbError berkategori dengan pesan aman dan ditampilkan di formulir. | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `IT-0039-AC6` | [AC-6](#ac-6) | e2e kedua engine: create dengan opsi engine yang benar, properti tampil, drop dengan ketik nama, audit tercatat; drop dengan nama konfirmasi salah ditolak se... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

## Test tambahan

### Contract test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `CT-0039-AC2` | [AC-2](#ac-2) | POST /databases membuat database: PostgreSQL (nama, owner opsional, encoding, template opsional), MySQL (nama, charset, collation); formulir UI menampilkan o... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `CT-0039-AC3` | [AC-3](#ac-3) | DELETE /databases/:name drop database: konfirmasi UI mewajibkan mengetik ulang nama database persis dan menampilkan label koneksi plus engine; server menolak... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `CT-0039-AC4` | [AC-4](#ac-4) | drop dan create diaudit (database.created, database.dropped) dengan target dan koneksi, sebelum response sukses (FR-AUD-01); drop memuat konfirmasi eksplisit... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |

### E2E

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `E2E-0039-AC1` | [AC-1](#ac-1) | halaman properti database (dari context menu explorer): nama, owner (PostgreSQL), encoding/charset, collation, ukuran (dimuat malas), jumlah object ringkas;... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `E2E-0039-AC2` | [AC-2](#ac-2) | POST /databases membuat database: PostgreSQL (nama, owner opsional, encoding, template opsional), MySQL (nama, charset, collation); formulir UI menampilkan o... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `E2E-0039-AC3` | [AC-3](#ac-3) | DELETE /databases/:name drop database: konfirmasi UI mewajibkan mengetik ulang nama database persis dan menampilkan label koneksi plus engine; server menolak... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `E2E-0039-AC5` | [AC-5](#ac-5) | kegagalan (hak kurang, nama dipakai, charset tidak valid) tiba sebagai DbError berkategori dengan pesan aman dan ditampilkan di formulir. | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `E2E-0039-AC6` | [AC-6](#ac-6) | e2e kedua engine: create dengan opsi engine yang benar, properti tampil, drop dengan ketik nama, audit tercatat; drop dengan nama konfirmasi salah ditolak se... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

### Security

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `SEC-0039-AC3` | [AC-3](#ac-3) | DELETE /databases/:name drop database: konfirmasi UI mewajibkan mengetik ulang nama database persis dan menampilkan label koneksi plus engine; server menolak... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `SEC-0039-AC4` | [AC-4](#ac-4) | drop dan create diaudit (database.created, database.dropped) dengan target dan koneksi, sebelum response sukses (FR-AUD-01); drop memuat konfirmasi eksplisit... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `SEC-0039-AC5` | [AC-5](#ac-5) | kegagalan (hak kurang, nama dipakai, charset tidak valid) tiba sebagai DbError berkategori dengan pesan aman dan ditampilkan di formulir. | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `SEC-0039-AC6` | [AC-6](#ac-6) | e2e kedua engine: create dengan opsi engine yang benar, properti tampil, drop dengan ketik nama, audit tercatat; drop dengan nama konfirmasi salah ditolak se... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

### Performance

Tidak ada performance yang diwajibkan oleh acceptance criteria saat ini.

### Visual dan accessibility

Tidak ada visual dan accessibility yang diwajibkan oleh acceptance criteria saat ini.

### Smoke dan operational acceptance

Tidak ada smoke dan operational yang diwajibkan oleh acceptance criteria saat ini.

### Manual atau external proof

Tidak ada manual atau external yang diwajibkan oleh acceptance criteria saat ini.

## Critical test scenarios

- Pengaman: DELETE dengan confirmName beda → 409, tanpa drop, verifikasi **AC-3**, **AC-4**.
- Opsi engine: form MySQL menampilkan charset dari server, PostgreSQL menampilkan encoding/template, tanpa cabang engine di komponen (data driven), verifikasi **AC-2**.
- Audit: drop menghasilkan event sebelum sukses, verifikasi **AC-4**.

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
