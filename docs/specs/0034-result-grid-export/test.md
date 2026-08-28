# Test dan acceptance criteria 0034. Result grid dan export result

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Belum dijalankan
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0034.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

ResultGrid menampilkan satu result set dengan virtual scrolling (ribuan baris mulus), header kolom dengan tipe data, lebar kolom bisa diubah, dan pengurutan sisi klien atas data yang dimuat (dengan label bahwa urutan hanya atas baris termuat bila terpotong).

### AC-2

multiple result set dari satu eksekusi tampil sebagai sub tab per statement dengan ringkasan (jumlah baris atau affected, durasi); statement error menampilkan panel error di posisi sub tab nya (FR-QRY-05).

### AC-3

render sel bertipe: NULL sebagai badge berbeda dari string kosong, angka rata kanan, tanggal ISO, boolean jelas, nilai panjang dipotong dengan pratinjau dan dialog lihat penuh; JSON dan JSONB mendapat viewer terformat di dialog; nilai biner tampil sebagai label ukuran (viewer BLOB adalah V2 sesuai feature.md); semua render sebagai teks (tanpa interpretasi HTML, aman dari injeksi markup).

### AC-4

salin: sel, baris terpilih, atau seluruh baris termuat, sebagai teks tab separated atau CSV; pemilihan baris ganda dengan klik shift dan checkbox.

### AC-5

export hasil termuat: tombol export menghasilkan CSV atau JSON dari baris yang sudah dimuat di klien seketika; saat hasil terpotong, tombol yang sama menawarkan "export semua baris lewat job" yang dinonaktifkan dengan keterangan sampai spec 0047 terpasang, lalu aktif setelahnya (satu tombol, dua jalur).

### AC-6

durasi eksekusi per statement dan total tampil; indikator hasil terpotong dengan jumlah yang dimuat vs penanda tidak diketahui.

### AC-7

grid dapat diakses: navigasi sel dengan keyboard, header dibaca screen reader, kontras badge NULL memadai (NFR-04).

### AC-8

unit dan e2e: render tipe tepat (fixture semua tipe umum kedua engine), salin menghasilkan format benar, multiple result set, 5000 baris tetap mulus.

## Matriks cakupan

| AC | Unit | Integration | Contract | E2E | Security | Performance | Visual | Smoke | Manual atau external |
|---|---|---|---|---|---|---|---|---|---|
| [AC-1](#ac-1) | n/a | n/a | n/a | `E2E-0034-AC1` | n/a | `PERF-0034-AC1` | `VIS-0034-AC1` | n/a | n/a |
| [AC-2](#ac-2) | n/a | n/a | n/a | `E2E-0034-AC2` | n/a | n/a | n/a | n/a | n/a |
| [AC-3](#ac-3) | `UT-0034-AC3` | n/a | n/a | `E2E-0034-AC3` | `SEC-0034-AC3` | n/a | n/a | n/a | n/a |
| [AC-4](#ac-4) | `UT-0034-AC4` | n/a | n/a | `E2E-0034-AC4` | n/a | n/a | n/a | n/a | n/a |
| [AC-5](#ac-5) | `UT-0034-AC5` | n/a | n/a | `E2E-0034-AC5` | n/a | n/a | n/a | n/a | n/a |
| [AC-6](#ac-6) | n/a | n/a | n/a | `E2E-0034-AC6` | n/a | n/a | n/a | n/a | n/a |
| [AC-7](#ac-7) | n/a | n/a | n/a | `E2E-0034-AC7` | n/a | n/a | `VIS-0034-AC7` | n/a | n/a |
| [AC-8](#ac-8) | `UT-0034-AC8` | n/a | n/a | `E2E-0034-AC8` | n/a | `PERF-0034-AC8` | n/a | n/a | n/a |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `UT-0034-AC3` | [AC-3](#ac-3) | render sel bertipe: NULL sebagai badge berbeda dari string kosong, angka rata kanan, tanggal ISO, boolean jelas, nilai panjang dipotong dengan pratinjau dan... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `UT-0034-AC4` | [AC-4](#ac-4) | salin: sel, baris terpilih, atau seluruh baris termuat, sebagai teks tab separated atau CSV; pemilihan baris ganda dengan klik shift dan checkbox. | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `UT-0034-AC5` | [AC-5](#ac-5) | export hasil termuat: tombol export menghasilkan CSV atau JSON dari baris yang sudah dimuat di klien seketika; saat hasil terpotong, tombol yang sama menawar... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `UT-0034-AC8` | [AC-8](#ac-8) | unit dan e2e: render tipe tepat (fixture semua tipe umum kedua engine), salin menghasilkan format benar, multiple result set, 5000 baris tetap mulus. | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

## Integration test

Tidak ada integration yang diwajibkan oleh acceptance criteria saat ini.

## Test tambahan

### Contract test

Tidak ada contract yang diwajibkan oleh acceptance criteria saat ini.

### E2E

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `E2E-0034-AC1` | [AC-1](#ac-1) | ResultGrid menampilkan satu result set dengan virtual scrolling (ribuan baris mulus), header kolom dengan tipe data, lebar kolom bisa diubah, dan pengurutan... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `E2E-0034-AC2` | [AC-2](#ac-2) | multiple result set dari satu eksekusi tampil sebagai sub tab per statement dengan ringkasan (jumlah baris atau affected, durasi); statement error menampilka... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `E2E-0034-AC3` | [AC-3](#ac-3) | render sel bertipe: NULL sebagai badge berbeda dari string kosong, angka rata kanan, tanggal ISO, boolean jelas, nilai panjang dipotong dengan pratinjau dan... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `E2E-0034-AC4` | [AC-4](#ac-4) | salin: sel, baris terpilih, atau seluruh baris termuat, sebagai teks tab separated atau CSV; pemilihan baris ganda dengan klik shift dan checkbox. | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `E2E-0034-AC5` | [AC-5](#ac-5) | export hasil termuat: tombol export menghasilkan CSV atau JSON dari baris yang sudah dimuat di klien seketika; saat hasil terpotong, tombol yang sama menawar... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `E2E-0034-AC6` | [AC-6](#ac-6) | durasi eksekusi per statement dan total tampil; indikator hasil terpotong dengan jumlah yang dimuat vs penanda tidak diketahui. | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `E2E-0034-AC7` | [AC-7](#ac-7) | grid dapat diakses: navigasi sel dengan keyboard, header dibaca screen reader, kontras badge NULL memadai (NFR-04). | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |
| `E2E-0034-AC8` | [AC-8](#ac-8) | unit dan e2e: render tipe tepat (fixture semua tipe umum kedua engine), salin menghasilkan format benar, multiple result set, 5000 baris tetap mulus. | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

### Security

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `SEC-0034-AC3` | [AC-3](#ac-3) | render sel bertipe: NULL sebagai badge berbeda dari string kosong, angka rata kanan, tanggal ISO, boolean jelas, nilai panjang dipotong dengan pratinjau dan... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |

### Performance

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `PERF-0034-AC1` | [AC-1](#ac-1) | ResultGrid menampilkan satu result set dengan virtual scrolling (ribuan baris mulus), header kolom dengan tipe data, lebar kolom bisa diubah, dan pengurutan... | Tetapkan dataset, baseline, ambang, pengulangan, dan toleransi sebelum eksekusi. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `PERF-0034-AC8` | [AC-8](#ac-8) | unit dan e2e: render tipe tepat (fixture semua tipe umum kedua engine), salin menghasilkan format benar, multiple result set, 5000 baris tetap mulus. | Tetapkan dataset, baseline, ambang, pengulangan, dan toleransi sebelum eksekusi. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

### Visual dan accessibility

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `VIS-0034-AC1` | [AC-1](#ac-1) | ResultGrid menampilkan satu result set dengan virtual scrolling (ribuan baris mulus), header kolom dengan tipe data, lebar kolom bisa diubah, dan pengurutan... | Kunci viewport, mode warna, state komponen, interaksi keyboard, dan bukti screenshot. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `VIS-0034-AC7` | [AC-7](#ac-7) | grid dapat diakses: navigasi sel dengan keyboard, header dibaca screen reader, kontras badge NULL memadai (NFR-04). | Kunci viewport, mode warna, state komponen, interaksi keyboard, dan bukti screenshot. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

### Smoke dan operational acceptance

Tidak ada smoke dan operational yang diwajibkan oleh acceptance criteria saat ini.

### Manual atau external proof

Tidak ada manual atau external yang diwajibkan oleh acceptance criteria saat ini.

## Critical test scenarios

- Render: fixture berisi NULL, string kosong, JSON, BIGINT, timestamp, bytea → tampil benar dan tersalin benar, verifikasi **AC-3**, **AC-4**.
- Result set ganda dengan error di tengah, verifikasi **AC-2**.
- Kinerja: 5000 baris scroll mulus, verifikasi **AC-1**, **AC-8**.

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
