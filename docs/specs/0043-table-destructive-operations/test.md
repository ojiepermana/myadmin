# Test dan acceptance criteria 0043. Operasi destructive table

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Belum dijalankan
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0043.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

rename table: dialog menampilkan nama kini dan input nama baru, peringatan dampak (view, FK, dan query tersimpan yang mereferensikan nama lama bisa rusak; FK yang mengikuti rename ditangani engine masing masing dan dinyatakan provider); `POST /tables/:ref/rename` dengan validasi nama; setelah sukses, node explorer, tab data, dan tab designer yang menunjuk table itu diperbarui atau diberi tanda basi.

### AC-2

truncate table: dialog menampilkan perkiraan jumlah baris yang akan hilang (dari metadata, berlabel perkiraan), opsi engine yang relevan (PostgreSQL: RESTART IDENTITY dan CASCADE dinyatakan; V1 mengunci CASCADE nonaktif dan restart identity sebagai checkbox), ketik nama table untuk konfirmasi; `POST /tables/:ref/truncate` dengan confirmName.

### AC-3

drop table: dialog menampilkan dependensi yang diketahui (view yang mereferensikan, FK masuk dari table lain, dari metadata provider), ketik nama, tanpa opsi cascade di GUI (pola spec 0040); `DELETE /tables/:ref` dengan confirmName; drop table yang direferensikan FK ditolak engine dan pesan provider diteruskan jelas.

### AC-4

ketiganya diaudit (`table.renamed`, `table.truncated` dengan perkiraan baris, `table.dropped`) sebelum response sukses; ketiganya memerlukan confirmName yang diverifikasi server (rename memakai nama lama sebagai confirm).

### AC-5

ketiga aksi terdaftar di context menu explorer dan menu tab designer; nonaktif dengan alasan bila koneksi tidak tersambung.

### AC-6

e2e kedua engine: rename memperbarui explorer; truncate mengosongkan dengan identitas di restart sesuai pilihan; drop menghapus dan menutup tab terkait dengan pemberitahuan; konfirmasi salah selalu ditolak server; audit tercatat.

## Matriks cakupan

| AC | Unit | Integration | Contract | E2E | Security | Performance | Visual | Smoke | Manual atau external |
|---|---|---|---|---|---|---|---|---|---|
| [AC-1](#ac-1) | `UT-0043-AC1` | `IT-0043-AC1` | `CT-0043-AC1` | `E2E-0043-AC1` | n/a | n/a | n/a | n/a | n/a |
| [AC-2](#ac-2) | `UT-0043-AC2` | `IT-0043-AC2` | `CT-0043-AC2` | `E2E-0043-AC2` | `SEC-0043-AC2` | n/a | n/a | n/a | n/a |
| [AC-3](#ac-3) | n/a | `IT-0043-AC3` | `CT-0043-AC3` | `E2E-0043-AC3` | `SEC-0043-AC3` | n/a | n/a | n/a | n/a |
| [AC-4](#ac-4) | n/a | `IT-0043-AC4` | `CT-0043-AC4` | n/a | `SEC-0043-AC4` | n/a | n/a | n/a | n/a |
| [AC-5](#ac-5) | `UT-0043-AC5` | n/a | n/a | `E2E-0043-AC5` | n/a | n/a | n/a | n/a | n/a |
| [AC-6](#ac-6) | n/a | `IT-0043-AC6` | n/a | `E2E-0043-AC6` | `SEC-0043-AC6` | n/a | n/a | n/a | n/a |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `UT-0043-AC1` | [AC-1](#ac-1) | rename table: dialog menampilkan nama kini dan input nama baru, peringatan dampak (view, FK, dan query tersimpan yang mereferensikan nama lama bisa rusak; FK... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `UT-0043-AC2` | [AC-2](#ac-2) | truncate table: dialog menampilkan perkiraan jumlah baris yang akan hilang (dari metadata, berlabel perkiraan), opsi engine yang relevan (PostgreSQL: RESTART... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `UT-0043-AC5` | [AC-5](#ac-5) | ketiga aksi terdaftar di context menu explorer dan menu tab designer; nonaktif dengan alasan bila koneksi tidak tersambung. | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |

## Integration test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `IT-0043-AC1` | [AC-1](#ac-1) | rename table: dialog menampilkan nama kini dan input nama baru, peringatan dampak (view, FK, dan query tersimpan yang mereferensikan nama lama bisa rusak; FK... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `IT-0043-AC2` | [AC-2](#ac-2) | truncate table: dialog menampilkan perkiraan jumlah baris yang akan hilang (dari metadata, berlabel perkiraan), opsi engine yang relevan (PostgreSQL: RESTART... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `IT-0043-AC3` | [AC-3](#ac-3) | drop table: dialog menampilkan dependensi yang diketahui (view yang mereferensikan, FK masuk dari table lain, dari metadata provider), ketik nama, tanpa opsi... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `IT-0043-AC4` | [AC-4](#ac-4) | ketiganya diaudit (table.renamed, table.truncated dengan perkiraan baris, table.dropped) sebelum response sukses; ketiganya memerlukan confirmName yang diver... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `IT-0043-AC6` | [AC-6](#ac-6) | e2e kedua engine: rename memperbarui explorer; truncate mengosongkan dengan identitas di restart sesuai pilihan; drop menghapus dan menutup tab terkait denga... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

## Test tambahan

### Contract test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `CT-0043-AC1` | [AC-1](#ac-1) | rename table: dialog menampilkan nama kini dan input nama baru, peringatan dampak (view, FK, dan query tersimpan yang mereferensikan nama lama bisa rusak; FK... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `CT-0043-AC2` | [AC-2](#ac-2) | truncate table: dialog menampilkan perkiraan jumlah baris yang akan hilang (dari metadata, berlabel perkiraan), opsi engine yang relevan (PostgreSQL: RESTART... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `CT-0043-AC3` | [AC-3](#ac-3) | drop table: dialog menampilkan dependensi yang diketahui (view yang mereferensikan, FK masuk dari table lain, dari metadata provider), ketik nama, tanpa opsi... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `CT-0043-AC4` | [AC-4](#ac-4) | ketiganya diaudit (table.renamed, table.truncated dengan perkiraan baris, table.dropped) sebelum response sukses; ketiganya memerlukan confirmName yang diver... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |

### E2E

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `E2E-0043-AC1` | [AC-1](#ac-1) | rename table: dialog menampilkan nama kini dan input nama baru, peringatan dampak (view, FK, dan query tersimpan yang mereferensikan nama lama bisa rusak; FK... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `E2E-0043-AC2` | [AC-2](#ac-2) | truncate table: dialog menampilkan perkiraan jumlah baris yang akan hilang (dari metadata, berlabel perkiraan), opsi engine yang relevan (PostgreSQL: RESTART... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `E2E-0043-AC3` | [AC-3](#ac-3) | drop table: dialog menampilkan dependensi yang diketahui (view yang mereferensikan, FK masuk dari table lain, dari metadata provider), ketik nama, tanpa opsi... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `E2E-0043-AC5` | [AC-5](#ac-5) | ketiga aksi terdaftar di context menu explorer dan menu tab designer; nonaktif dengan alasan bila koneksi tidak tersambung. | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `E2E-0043-AC6` | [AC-6](#ac-6) | e2e kedua engine: rename memperbarui explorer; truncate mengosongkan dengan identitas di restart sesuai pilihan; drop menghapus dan menutup tab terkait denga... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

### Security

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `SEC-0043-AC2` | [AC-2](#ac-2) | truncate table: dialog menampilkan perkiraan jumlah baris yang akan hilang (dari metadata, berlabel perkiraan), opsi engine yang relevan (PostgreSQL: RESTART... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `SEC-0043-AC3` | [AC-3](#ac-3) | drop table: dialog menampilkan dependensi yang diketahui (view yang mereferensikan, FK masuk dari table lain, dari metadata provider), ketik nama, tanpa opsi... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `SEC-0043-AC4` | [AC-4](#ac-4) | ketiganya diaudit (table.renamed, table.truncated dengan perkiraan baris, table.dropped) sebelum response sukses; ketiganya memerlukan confirmName yang diver... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `SEC-0043-AC6` | [AC-6](#ac-6) | e2e kedua engine: rename memperbarui explorer; truncate mengosongkan dengan identitas di restart sesuai pilihan; drop menghapus dan menutup tab terkait denga... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

### Performance

Tidak ada performance yang diwajibkan oleh acceptance criteria saat ini.

### Visual dan accessibility

Tidak ada visual dan accessibility yang diwajibkan oleh acceptance criteria saat ini.

### Smoke dan operational acceptance

Tidak ada smoke dan operational yang diwajibkan oleh acceptance criteria saat ini.

### Manual atau external proof

Tidak ada manual atau external yang diwajibkan oleh acceptance criteria saat ini.

## Critical test scenarios

- Drop table dengan FK masuk → ditolak engine, pesan jelas menyebut perujuk, verifikasi **AC-3**.
- Truncate dengan restart identity → nilai identity mulai ulang; tanpa restart → berlanjut, verifikasi **AC-2**.
- Konsistensi UI: drop menutup tab data table itu dengan pemberitahuan, verifikasi **AC-1**, **AC-6**.

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
