# Test dan acceptance criteria 0048. Import

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Belum dijalankan
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0048.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

`POST /import/upload` menerima unggahan multipart streaming ke `<data-dir>/temp/imports/`, memvalidasi ukuran maksimum (`limits.uploadMaxBytes`) saat mengalir (bukan setelah selesai) dan ekstensi/tipe (sql, csv); hasilnya uploadId dengan masa berlaku 1 jam.

### AC-2

import SQL: `POST /import/sql` { connectionId, database, uploadId, mode transaksi } membuat job yang membaca file streaming, memecah statement (pemecah provider, mode streaming), dan mengeksekusi berurutan pada sesi khusus job; progress berbasis byte dan hitungan statement; kegagalan menghentikan job dengan laporan: statement ke berapa, posisi, pesan `DbError`; mode transaksi: `single` (semua dalam satu transaksi, rollback saat gagal; pilihan default untuk PostgreSQL) atau `per-statement` (lanjut dicatat? tidak: berhenti pada error pertama, hasil parsial dinyatakan jelas) sesuai pilihan pengguna dan dukungan engine.

### AC-3

import CSV: `POST /import/csv` { connectionId, ref table target, uploadId, options } dengan opsi: delimiter, header ada/tidak, pemetaan kolom CSV ke kolom table (UI menyarankan dari header dan tipe), nilai NULL literal, batch size; eksekusi INSERT batch berparameter lewat provider; baris gagal dicatat (nomor baris, alasan) sampai ambang (100) lalu job gagal dengan laporan; progress berbasis byte/baris.

### AC-4

opsi destructive "kosongkan table sebelum import" (truncate dulu) memerlukan konfirmasi eksplisit menyebut table dan konsekuensi, diverifikasi server (flag plus confirmName), dan menjadikan job diaudit sebagai import destructive (FR-IEX-01, FR-SAFE-01).

### AC-5

cancel menghentikan eksekusi pada batas statement/batch berikutnya; mode `single` di rollback; hasil parsial mode lain dilaporkan jujur (berapa statement/baris masuk).

### AC-6

hasil akhir job memuat ringkasan: statement/baris sukses, gagal, durasi; import selesai atau gagal diaudit (`import.completed` / `import.failed`, plus penanda destructive bila truncate dipakai) tanpa isi data.

### AC-7

UI: alur import di halaman import-export: pilih file (drag and drop), pilih target, opsi per format, pemetaan kolom CSV dengan pratinjau 20 baris pertama, konfirmasi destructive bila dipilih, lalu panel job; file dan pratinjau tidak pernah mengirim isi penuh ke klien (pratinjau dipotong server).

### AC-8

e2e kedua engine: roundtrip export SQL (spec 0047) diimpor balik utuh; CSV dengan pemetaan dan baris gagal melaporkan nomor baris; truncate dulu meminta konfirmasi dan diaudit; unggah melebihi batas ditolak saat mengalir.

## Matriks cakupan

| AC | Unit | Integration | Contract | E2E | Security | Performance | Visual | Smoke | Manual atau external |
|---|---|---|---|---|---|---|---|---|---|
| [AC-1](#ac-1) | `UT-0048-AC1` | `IT-0048-AC1` | `CT-0048-AC1` | n/a | `SEC-0048-AC1` | n/a | n/a | n/a | n/a |
| [AC-2](#ac-2) | `UT-0048-AC2` | `IT-0048-AC2` | `CT-0048-AC2` | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-3](#ac-3) | `UT-0048-AC3` | `IT-0048-AC3` | `CT-0048-AC3` | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-4](#ac-4) | n/a | `IT-0048-AC4` | `CT-0048-AC4` | `E2E-0048-AC4` | `SEC-0048-AC4` | n/a | n/a | n/a | n/a |
| [AC-5](#ac-5) | n/a | `IT-0048-AC5` | n/a | `E2E-0048-AC5` | n/a | n/a | n/a | n/a | n/a |
| [AC-6](#ac-6) | n/a | `IT-0048-AC6` | `CT-0048-AC6` | n/a | `SEC-0048-AC6` | n/a | n/a | n/a | n/a |
| [AC-7](#ac-7) | n/a | n/a | `CT-0048-AC7` | `E2E-0048-AC7` | `SEC-0048-AC7` | n/a | n/a | n/a | n/a |
| [AC-8](#ac-8) | n/a | `IT-0048-AC8` | n/a | `E2E-0048-AC8` | `SEC-0048-AC8` | n/a | n/a | n/a | n/a |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `UT-0048-AC1` | [AC-1](#ac-1) | POST /import/upload menerima unggahan multipart streaming ke <data-dir>/temp/imports/, memvalidasi ukuran maksimum (limits.uploadMaxBytes) saat mengalir (buk... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `UT-0048-AC2` | [AC-2](#ac-2) | import SQL: POST /import/sql { connectionId, database, uploadId, mode transaksi } membuat job yang membaca file streaming, memecah statement (pemecah provide... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `UT-0048-AC3` | [AC-3](#ac-3) | import CSV: POST /import/csv { connectionId, ref table target, uploadId, options } dengan opsi: delimiter, header ada/tidak, pemetaan kolom CSV ke kolom tabl... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |

## Integration test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `IT-0048-AC1` | [AC-1](#ac-1) | POST /import/upload menerima unggahan multipart streaming ke <data-dir>/temp/imports/, memvalidasi ukuran maksimum (limits.uploadMaxBytes) saat mengalir (buk... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `IT-0048-AC2` | [AC-2](#ac-2) | import SQL: POST /import/sql { connectionId, database, uploadId, mode transaksi } membuat job yang membaca file streaming, memecah statement (pemecah provide... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `IT-0048-AC3` | [AC-3](#ac-3) | import CSV: POST /import/csv { connectionId, ref table target, uploadId, options } dengan opsi: delimiter, header ada/tidak, pemetaan kolom CSV ke kolom tabl... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `IT-0048-AC4` | [AC-4](#ac-4) | opsi destructive "kosongkan table sebelum import" (truncate dulu) memerlukan konfirmasi eksplisit menyebut table dan konsekuensi, diverifikasi server (flag p... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `IT-0048-AC5` | [AC-5](#ac-5) | cancel menghentikan eksekusi pada batas statement/batch berikutnya; mode single di rollback; hasil parsial mode lain dilaporkan jujur (berapa statement/baris... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `IT-0048-AC6` | [AC-6](#ac-6) | hasil akhir job memuat ringkasan: statement/baris sukses, gagal, durasi; import selesai atau gagal diaudit (import.completed / import.failed, plus penanda de... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `IT-0048-AC8` | [AC-8](#ac-8) | e2e kedua engine: roundtrip export SQL (spec 0047) diimpor balik utuh; CSV dengan pemetaan dan baris gagal melaporkan nomor baris; truncate dulu meminta konf... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

## Test tambahan

### Contract test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `CT-0048-AC1` | [AC-1](#ac-1) | POST /import/upload menerima unggahan multipart streaming ke <data-dir>/temp/imports/, memvalidasi ukuran maksimum (limits.uploadMaxBytes) saat mengalir (buk... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `CT-0048-AC2` | [AC-2](#ac-2) | import SQL: POST /import/sql { connectionId, database, uploadId, mode transaksi } membuat job yang membaca file streaming, memecah statement (pemecah provide... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `CT-0048-AC3` | [AC-3](#ac-3) | import CSV: POST /import/csv { connectionId, ref table target, uploadId, options } dengan opsi: delimiter, header ada/tidak, pemetaan kolom CSV ke kolom tabl... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `CT-0048-AC4` | [AC-4](#ac-4) | opsi destructive "kosongkan table sebelum import" (truncate dulu) memerlukan konfirmasi eksplisit menyebut table dan konsekuensi, diverifikasi server (flag p... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `CT-0048-AC6` | [AC-6](#ac-6) | hasil akhir job memuat ringkasan: statement/baris sukses, gagal, durasi; import selesai atau gagal diaudit (import.completed / import.failed, plus penanda de... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `CT-0048-AC7` | [AC-7](#ac-7) | UI: alur import di halaman import-export: pilih file (drag and drop), pilih target, opsi per format, pemetaan kolom CSV dengan pratinjau 20 baris pertama, ko... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

### E2E

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `E2E-0048-AC4` | [AC-4](#ac-4) | opsi destructive "kosongkan table sebelum import" (truncate dulu) memerlukan konfirmasi eksplisit menyebut table dan konsekuensi, diverifikasi server (flag p... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `E2E-0048-AC5` | [AC-5](#ac-5) | cancel menghentikan eksekusi pada batas statement/batch berikutnya; mode single di rollback; hasil parsial mode lain dilaporkan jujur (berapa statement/baris... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `E2E-0048-AC7` | [AC-7](#ac-7) | UI: alur import di halaman import-export: pilih file (drag and drop), pilih target, opsi per format, pemetaan kolom CSV dengan pratinjau 20 baris pertama, ko... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |
| `E2E-0048-AC8` | [AC-8](#ac-8) | e2e kedua engine: roundtrip export SQL (spec 0047) diimpor balik utuh; CSV dengan pemetaan dan baris gagal melaporkan nomor baris; truncate dulu meminta konf... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

### Security

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `SEC-0048-AC1` | [AC-1](#ac-1) | POST /import/upload menerima unggahan multipart streaming ke <data-dir>/temp/imports/, memvalidasi ukuran maksimum (limits.uploadMaxBytes) saat mengalir (buk... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `SEC-0048-AC4` | [AC-4](#ac-4) | opsi destructive "kosongkan table sebelum import" (truncate dulu) memerlukan konfirmasi eksplisit menyebut table dan konsekuensi, diverifikasi server (flag p... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `SEC-0048-AC6` | [AC-6](#ac-6) | hasil akhir job memuat ringkasan: statement/baris sukses, gagal, durasi; import selesai atau gagal diaudit (import.completed / import.failed, plus penanda de... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `SEC-0048-AC7` | [AC-7](#ac-7) | UI: alur import di halaman import-export: pilih file (drag and drop), pilih target, opsi per format, pemetaan kolom CSV dengan pratinjau 20 baris pertama, ko... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |
| `SEC-0048-AC8` | [AC-8](#ac-8) | e2e kedua engine: roundtrip export SQL (spec 0047) diimpor balik utuh; CSV dengan pemetaan dan baris gagal melaporkan nomor baris; truncate dulu meminta konf... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

### Performance

Tidak ada performance yang diwajibkan oleh acceptance criteria saat ini.

### Visual dan accessibility

Tidak ada visual dan accessibility yang diwajibkan oleh acceptance criteria saat ini.

### Smoke dan operational acceptance

Tidak ada smoke dan operational yang diwajibkan oleh acceptance criteria saat ini.

### Manual atau external proof

Tidak ada manual atau external yang diwajibkan oleh acceptance criteria saat ini.

## Critical test scenarios

- Roundtrip: export SQL → import → data identik, verifikasi **AC-2**, **AC-8**.
- Gagal jelas: dump dengan statement rusak di tengah → job gagal menyebut statement dan posisi; mode single ter rollback, verifikasi **AC-2**, **AC-5**.
- Destructive: truncateFirst tanpa confirm → 409; dengan confirm → audit destructive, verifikasi **AC-4**.

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
