# Test dan acceptance criteria 0036. Query history dan saved queries

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Belum dijalankan
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0036.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

`GET /query/history` mengembalikan riwayat milik user, terbaru dulu, paginated, dengan filter: teks (substring pada SQL), connectionId, status, rentang waktu; entri memuat SQL, koneksi (label bila masih ada), database, status, durasi, jumlah baris, waktu.

### AC-2

aksi pada entri riwayat: buka ke tab query baru dengan konteks asalnya (koneksi terhapus → tab tetap terbuka tanpa koneksi dengan pemberitahuan untuk memilih ulang); salin SQL; hapus entri; `DELETE /query/history` menghapus seluruh riwayat milik user dengan konfirmasi.

### AC-3

retensi otomatis (spec 0009 AC-5) berjalan pada setiap penulisan; jumlah maksimum dari settings; UI menampilkan keterangan batas retensi.

### AC-4

saved queries CRUD: `GET/POST/PATCH/DELETE /query/saved`; nama wajib dan unik per user (409 bila bentrok), SQL wajib, tag opsional, konteks opsional (connectionId, database); membuka saved query membuat tab baru dengan konteksnya.

### AC-5

simpan cepat dari editor: aksi "Simpan query" pada tab mengisi dialog nama dengan konteks tab; menyimpan ulang ke nama sama menawarkan timpa (update) secara eksplisit.

### AC-6

kedua daftar privat per pemilik: user lain (termasuk Admin) tidak dapat membaca riwayat atau saved query orang lain lewat API apa pun (bagian 5 matriks: history dan saved query per user).

### AC-7

UI: halaman query-history dengan dua tab (Riwayat, Tersimpan), pencarian dan filter, virtual list; panel samping cepat di query editor untuk membuka riwayat dan tersimpan tanpa pindah halaman.

### AC-8

e2e: eksekusi menambah riwayat; simpan bernama; buka dari riwayat dengan konteks; hapus semua riwayat; isolasi antar user dibuktikan test otorisasi.

## Matriks cakupan

| AC            | Unit | Integration   | Contract | E2E            | Security       | Performance | Visual         | Smoke | Manual atau external |
| ------------- | ---- | ------------- | -------- | -------------- | -------------- | ----------- | -------------- | ----- | -------------------- |
| [AC-1](#ac-1) | n/a  | `IT-0036-AC1` | n/a      | n/a            | n/a            | n/a         | n/a            | n/a   | n/a                  |
| [AC-2](#ac-2) | n/a  | `IT-0036-AC2` | n/a      | `E2E-0036-AC2` | n/a            | n/a         | n/a            | n/a   | n/a                  |
| [AC-3](#ac-3) | n/a  | `IT-0036-AC3` | n/a      | `E2E-0036-AC3` | n/a            | n/a         | n/a            | n/a   | n/a                  |
| [AC-4](#ac-4) | n/a  | `IT-0036-AC4` | n/a      | n/a            | n/a            | n/a         | n/a            | n/a   | n/a                  |
| [AC-5](#ac-5) | n/a  | n/a           | n/a      | `E2E-0036-AC5` | n/a            | n/a         | n/a            | n/a   | n/a                  |
| [AC-6](#ac-6) | n/a  | n/a           | n/a      | n/a            | `SEC-0036-AC6` | n/a         | n/a            | n/a   | n/a                  |
| [AC-7](#ac-7) | n/a  | n/a           | n/a      | `E2E-0036-AC7` | n/a            | n/a         | `VIS-0036-AC7` | n/a   | n/a                  |
| [AC-8](#ac-8) | n/a  | n/a           | n/a      | `E2E-0036-AC8` | `SEC-0036-AC8` | n/a         | n/a            | n/a   | n/a                  |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

Tidak ada unit yang diwajibkan oleh acceptance criteria saat ini.

## Integration test

| ID            | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                         | Expected result                                      |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `IT-0036-AC1` | [AC-1](#ac-1) | GET /query/history mengembalikan riwayat milik user, terbaru dulu, paginated, dengan filter: teks (substring pada SQL), connectionId, status, rentang waktu;...  | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `IT-0036-AC2` | [AC-2](#ac-2) | aksi pada entri riwayat: buka ke tab query baru dengan konteks asalnya (koneksi terhapus → tab tetap terbuka tanpa koneksi dengan pemberitahuan untuk memilih... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `IT-0036-AC3` | [AC-3](#ac-3) | retensi otomatis (spec 0009 AC-5) berjalan pada setiap penulisan; jumlah maksimum dari settings; UI menampilkan keterangan batas retensi.                        | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `IT-0036-AC4` | [AC-4](#ac-4) | saved queries CRUD: GET/POST/PATCH/DELETE /query/saved; nama wajib dan unik per user (409 bila bentrok), SQL wajib, konteks opsional (connectionId, database)... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |

## Test tambahan

### Contract test

Tidak ada contract yang diwajibkan oleh acceptance criteria saat ini.

### E2E

| ID             | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                       | Expected result                                      |
| -------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------- |
| `E2E-0036-AC2` | [AC-2](#ac-2) | aksi pada entri riwayat: buka ke tab query baru dengan konteks asalnya (koneksi terhapus → tab tetap terbuka tanpa koneksi dengan pemberitahuan untuk memilih... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `E2E-0036-AC3` | [AC-3](#ac-3) | retensi otomatis (spec 0009 AC-5) berjalan pada setiap penulisan; jumlah maksimum dari settings; UI menampilkan keterangan batas retensi.                        | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `E2E-0036-AC5` | [AC-5](#ac-5) | simpan cepat dari editor: aksi "Simpan query" pada tab mengisi dialog nama dengan konteks tab; menyimpan ulang ke nama sama menawarkan timpa (update) secara...  | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `E2E-0036-AC7` | [AC-7](#ac-7) | UI: halaman query-history dengan dua tab (Riwayat, Tersimpan), pencarian dan filter, virtual list; panel samping cepat di query editor untuk membuka riwayat...  | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |
| `E2E-0036-AC8` | [AC-8](#ac-8) | e2e: eksekusi menambah riwayat; simpan bernama; buka dari riwayat dengan konteks; hapus semua riwayat; isolasi antar user dibuktikan test otorisasi.             | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

### Security

| ID             | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                               | Expected result                                      |
| -------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `SEC-0036-AC6` | [AC-6](#ac-6) | kedua daftar privat per pemilik: user lain (termasuk Admin) tidak dapat membaca riwayat atau saved query orang lain lewat API apa pun (bagian 5 matriks: hist... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `SEC-0036-AC8` | [AC-8](#ac-8) | e2e: eksekusi menambah riwayat; simpan bernama; buka dari riwayat dengan konteks; hapus semua riwayat; isolasi antar user dibuktikan test otorisasi.             | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

### Performance

Tidak ada performance yang diwajibkan oleh acceptance criteria saat ini.

### Visual dan accessibility

| ID             | AC            | Fokus                                                                                                                                                           | Scenario terencana                                                                    | Expected result                                      |
| -------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `VIS-0036-AC7` | [AC-7](#ac-7) | UI: halaman query-history dengan dua tab (Riwayat, Tersimpan), pencarian dan filter, virtual list; panel samping cepat di query editor untuk membuka riwayat... | Kunci viewport, mode warna, state komponen, interaksi keyboard, dan bukti screenshot. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

### Smoke dan operational acceptance

Tidak ada smoke dan operational yang diwajibkan oleh acceptance criteria saat ini.

### Manual atau external proof

Tidak ada manual atau external yang diwajibkan oleh acceptance criteria saat ini.

## Critical test scenarios

- Isolasi: user B meminta riwayat dengan id entri user A → 404, verifikasi **AC-6**.
- Konteks mati: buka riwayat berkoneksi terhapus → tab terbuka dengan pemberitahuan, verifikasi **AC-2**.
- Keunikan: simpan nama kembar → 409 lalu jalur timpa eksplisit, verifikasi **AC-4**, **AC-5**.

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
