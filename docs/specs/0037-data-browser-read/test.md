# Test dan acceptance criteria 0037. Data browser: jalur baca

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Belum dijalankan
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0037.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

`POST /data/read` menerima { connectionId, ref (ObjectRef table/view), page { limit, offset }, sort[] (kolom plus arah), filters[], search?, columns? } dan mengembalikan baris (bentuk sel berlabel tipe, spec 0033 AC-8), total atau estimate berlabel jenisnya, dan metadata kolom; limit maksimum 500, default 100.

### AC-2

filter terstruktur per kolom dengan operator sesuai tipe dari daftar tertutup: `= != > >= < <=` untuk angka dan tanggal, `contains startsWith endsWith` untuk teks, `is null / is not null` semua tipe, `in` daftar nilai; provider menerjemahkan ke SQL berparameter dengan quoting identifier terpusat; operator di luar daftar ditolak 422 (FR-DATA-02).

### AC-3

pencarian teks bebas diterapkan sebagai OR `contains` atas kolom teks yang dipilih (default semua kolom teks yang terlihat), tetap berparameter.

### AC-4

sort multi kolom stabil: sort pengguna selalu ditambah tie breaker primary key (bila ada) supaya pagination konsisten antar halaman.

### AC-5

total baris: COUNT tepat dijalankan hanya bila murah (di bawah ambang provider) atau diminta eksplisit; selain itu estimate katalog berlabel "perkiraan"; UI menampilkan jenisnya jujur.

### AC-6

tab data memakai ResultGrid mode data browser: header filter per kolom, panel filter aktif (chip yang bisa dihapus), pemilih kolom, navigasi halaman (nomor, ukuran halaman), indikator loading tanpa mengunci UI; konteks tab (koneksi, ref) eksplisit dan ikut workspace persistence.

### AC-7

view dibuka jalur yang sama secara read only (penyuntingan tidak ditawarkan untuk view di V1).

### AC-8

test NFR-01: membuka table fixture 1 juta baris hanya menghasilkan query berhalaman (dibuktikan log statement server test) dan waktu muat halaman pertama wajar; test injeksi: nilai filter berbahaya tidak mengubah bentuk query.

### AC-9

e2e kedua engine: buka dari explorer, filter, sort, pilih kolom, pindah halaman.

## Matriks cakupan

| AC | Unit | Integration | Contract | E2E | Security | Performance | Visual | Smoke | Manual atau external |
|---|---|---|---|---|---|---|---|---|---|
| [AC-1](#ac-1) | n/a | `IT-0037-AC1` | `CT-0037-AC1` | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-2](#ac-2) | `UT-0037-AC2` | `IT-0037-AC2` | n/a | n/a | `SEC-0037-AC2` | n/a | n/a | n/a | n/a |
| [AC-3](#ac-3) | `UT-0037-AC3` | n/a | n/a | n/a | `SEC-0037-AC3` | n/a | n/a | n/a | n/a |
| [AC-4](#ac-4) | `UT-0037-AC4` | `IT-0037-AC4` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-5](#ac-5) | n/a | `IT-0037-AC5` | n/a | `E2E-0037-AC5` | n/a | n/a | n/a | n/a | n/a |
| [AC-6](#ac-6) | n/a | n/a | n/a | `E2E-0037-AC6` | n/a | n/a | `VIS-0037-AC6` | n/a | n/a |
| [AC-7](#ac-7) | n/a | n/a | n/a | `E2E-0037-AC7` | n/a | n/a | n/a | n/a | n/a |
| [AC-8](#ac-8) | n/a | n/a | n/a | n/a | `SEC-0037-AC8` | `PERF-0037-AC8` | n/a | n/a | n/a |
| [AC-9](#ac-9) | n/a | n/a | n/a | `E2E-0037-AC9` | n/a | n/a | n/a | n/a | n/a |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `UT-0037-AC2` | [AC-2](#ac-2) | filter terstruktur per kolom dengan operator sesuai tipe dari daftar tertutup: = != > >= < <= untuk angka dan tanggal, contains startsWith endsWith untuk tek... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `UT-0037-AC3` | [AC-3](#ac-3) | pencarian teks bebas diterapkan sebagai OR contains atas kolom teks yang dipilih (default semua kolom teks yang terlihat), tetap berparameter. | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `UT-0037-AC4` | [AC-4](#ac-4) | sort multi kolom stabil: sort pengguna selalu ditambah tie breaker primary key (bila ada) supaya pagination konsisten antar halaman. | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |

## Integration test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `IT-0037-AC1` | [AC-1](#ac-1) | POST /data/read menerima { connectionId, ref (ObjectRef table/view), page { limit, offset }, sort[] (kolom plus arah), filters[], search?, columns? } dan men... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `IT-0037-AC2` | [AC-2](#ac-2) | filter terstruktur per kolom dengan operator sesuai tipe dari daftar tertutup: = != > >= < <= untuk angka dan tanggal, contains startsWith endsWith untuk tek... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `IT-0037-AC4` | [AC-4](#ac-4) | sort multi kolom stabil: sort pengguna selalu ditambah tie breaker primary key (bila ada) supaya pagination konsisten antar halaman. | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `IT-0037-AC5` | [AC-5](#ac-5) | total baris: COUNT tepat dijalankan hanya bila murah (di bawah ambang provider) atau diminta eksplisit; selain itu estimate katalog berlabel "perkiraan"; UI... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |

## Test tambahan

### Contract test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `CT-0037-AC1` | [AC-1](#ac-1) | POST /data/read menerima { connectionId, ref (ObjectRef table/view), page { limit, offset }, sort[] (kolom plus arah), filters[], search?, columns? } dan men... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |

### E2E

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `E2E-0037-AC5` | [AC-5](#ac-5) | total baris: COUNT tepat dijalankan hanya bila murah (di bawah ambang provider) atau diminta eksplisit; selain itu estimate katalog berlabel "perkiraan"; UI... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `E2E-0037-AC6` | [AC-6](#ac-6) | tab data memakai ResultGrid mode data browser: header filter per kolom, panel filter aktif (chip yang bisa dihapus), pemilih kolom, navigasi halaman (nomor,... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `E2E-0037-AC7` | [AC-7](#ac-7) | view dibuka jalur yang sama secara read only (penyuntingan tidak ditawarkan untuk view di V1). | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |
| `E2E-0037-AC9` | [AC-9](#ac-9) | e2e kedua engine: buka dari explorer, filter, sort, pilih kolom, pindah halaman. | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-9 terpenuhi. |

### Security

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `SEC-0037-AC2` | [AC-2](#ac-2) | filter terstruktur per kolom dengan operator sesuai tipe dari daftar tertutup: = != > >= < <= untuk angka dan tanggal, contains startsWith endsWith untuk tek... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `SEC-0037-AC3` | [AC-3](#ac-3) | pencarian teks bebas diterapkan sebagai OR contains atas kolom teks yang dipilih (default semua kolom teks yang terlihat), tetap berparameter. | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `SEC-0037-AC8` | [AC-8](#ac-8) | test NFR-01: membuka table fixture 1 juta baris hanya menghasilkan query berhalaman (dibuktikan log statement server test) dan waktu muat halaman pertama waj... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

### Performance

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `PERF-0037-AC8` | [AC-8](#ac-8) | test NFR-01: membuka table fixture 1 juta baris hanya menghasilkan query berhalaman (dibuktikan log statement server test) dan waktu muat halaman pertama waj... | Tetapkan dataset, baseline, ambang, pengulangan, dan toleransi sebelum eksekusi. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

### Visual dan accessibility

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `VIS-0037-AC6` | [AC-6](#ac-6) | tab data memakai ResultGrid mode data browser: header filter per kolom, panel filter aktif (chip yang bisa dihapus), pemilih kolom, navigasi halaman (nomor,... | Kunci viewport, mode warna, state komponen, interaksi keyboard, dan bukti screenshot. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

### Smoke dan operational acceptance

Tidak ada smoke dan operational yang diwajibkan oleh acceptance criteria saat ini.

### Manual atau external proof

Tidak ada manual atau external yang diwajibkan oleh acceptance criteria saat ini.

## Critical test scenarios

- Skala: tabel 1 juta baris, halaman pertama cepat, log server hanya query berhalaman, verifikasi **AC-8**.
- Injeksi: filter nilai `1; DROP TABLE x --` aman, verifikasi **AC-2**, **AC-8**.
- Konsistensi: sort kolom duplikat nilai, pindah halaman tanpa baris hilang/dobel (tie breaker), verifikasi **AC-4**.

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
