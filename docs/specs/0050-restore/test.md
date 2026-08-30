# Test dan acceptance criteria 0050. Restore

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Parsial lokal — unit/contract/restore stream, service validation/audit, native PostgreSQL/MySQL roundtrip, authenticated real PostgreSQL/MySQL upload-to-restore E2E, dan native MySQL backup-to-restore E2E lulus; smoke, security penuh, backup-to-restore UI penuh, dan seluruh acceptance belum lengkap.
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0050.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

sumber restore: artefak milik user dari folder backups, atau file yang diunggah (jalur upload spec 0048, tipe sql/sql.gz); validasi sebelum konfirmasi: sniff format (SQL dump plain atau gzip), deteksi engine asal dari header dump bila ada, dan penolakan dini dump yang engine nya tidak cocok dengan koneksi target (dengan pesan jelas).

### AC-2

target restore: koneksi plus database tujuan; opsi: restore ke database yang ada (menimpa object bentrok sesuai isi dump) atau buat database baru dulu lalu restore ke sana (jalur yang disarankan UI); tanpa opsi drop database otomatis di V1.

### AC-3

konfirmasi destructive maksimum: dialog menyebut koneksi, database target, sumber artefak, dan kalimat dampak; pengguna mengetik nama database target; server memverifikasi `confirmName` (FR-SAFE-01); tanpa jalur pintas API.

### AC-4

eksekusi: job menjalankan tool (PostgreSQL: psql untuk dump plain; MySQL: mysql client) membaca file streaming (gunzip bila perlu); password lewat mekanisme aman (pola spec 0049); progress dari byte terproses; error tool dihentikan pada kegagalan pertama dengan stderr tersensor dan posisi bila tersedia; cancel membunuh subprocess dan menyatakan keadaan database mungkin parsial dengan jelas.

### AC-5

hasil job memuat ringkasan (durasi, byte, exit code); restore sukses dan gagal diaudit (`restore.completed`/`restore.failed`: koneksi, database, sumber; tanpa isi) sebelum response sukses; percobaan restore juga diaudit saat dimulai (`restore.started`) supaya jejak ada meski proses mati.

### AC-6

UI: alur restore di halaman backup-restore (pilih artefak atau unggah, validasi tampil, pilih target, konfirmasi ketik nama, panel job); fitur digerbangi capability `backupRestore` dan nonaktif dengan penjelasan tanpa tool (FR-BKR-02).

### AC-7

e2e kedua engine: roundtrip penuh backup (spec 0049) lalu restore ke database baru menghasilkan data identik (perbandingan hitungan dan sampel); dump engine salah ditolak saat validasi; cancel di tengah menyatakan keadaan parsial; audit lengkap (started, completed).

## Matriks cakupan

| AC            | Unit          | Integration   | Contract      | E2E            | Security       | Performance | Visual | Smoke            | Manual atau external |
| ------------- | ------------- | ------------- | ------------- | -------------- | -------------- | ----------- | ------ | ---------------- | -------------------- |
| [AC-1](#ac-1) | `UT-0050-AC1` | `IT-0050-AC1` | `CT-0050-AC1` | n/a            | `SEC-0050-AC1` | n/a         | n/a    | n/a              | n/a                  |
| [AC-2](#ac-2) | `UT-0050-AC2` | `IT-0050-AC2` | `CT-0050-AC2` | `E2E-0050-AC2` | n/a            | n/a         | n/a    | n/a              | n/a                  |
| [AC-3](#ac-3) | n/a           | `IT-0050-AC3` | `CT-0050-AC3` | `E2E-0050-AC3` | `SEC-0050-AC3` | n/a         | n/a    | n/a              | n/a                  |
| [AC-4](#ac-4) | n/a           | `IT-0050-AC4` | n/a           | n/a            | `SEC-0050-AC4` | n/a         | n/a    | `SMOKE-0050-AC4` | n/a                  |
| [AC-5](#ac-5) | n/a           | `IT-0050-AC5` | `CT-0050-AC5` | n/a            | `SEC-0050-AC5` | n/a         | n/a    | n/a              | n/a                  |
| [AC-6](#ac-6) | `UT-0050-AC6` | n/a           | `CT-0050-AC6` | `E2E-0050-AC6` | n/a            | n/a         | n/a    | n/a              | n/a                  |
| [AC-7](#ac-7) | n/a           | `IT-0050-AC7` | n/a           | `E2E-0050-AC7` | `SEC-0050-AC7` | n/a         | n/a    | `SMOKE-0050-AC7` | n/a                  |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

| ID            | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                                       | Expected result                                      |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `UT-0050-AC1` | [AC-1](#ac-1) | sumber restore: artefak milik user dari folder backups, atau file yang diunggah (jalur upload spec 0048, tipe sql/sql.gz); validasi sebelum konfirmasi: sniff... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `UT-0050-AC2` | [AC-2](#ac-2) | target restore: koneksi plus database tujuan; opsi: restore ke database yang ada (menimpa object bentrok sesuai isi dump) atau buat database baru dulu lalu r... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `UT-0050-AC6` | [AC-6](#ac-6) | UI: alur restore di halaman backup-restore (pilih artefak atau unggah, validasi tampil, pilih target, konfirmasi ketik nama, panel job); fitur digerbangi cap... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

## Integration test

| ID            | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                         | Expected result                                      |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `IT-0050-AC1` | [AC-1](#ac-1) | sumber restore: artefak milik user dari folder backups, atau file yang diunggah (jalur upload spec 0048, tipe sql/sql.gz); validasi sebelum konfirmasi: sniff... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `IT-0050-AC2` | [AC-2](#ac-2) | target restore: koneksi plus database tujuan; opsi: restore ke database yang ada (menimpa object bentrok sesuai isi dump) atau buat database baru dulu lalu r... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `IT-0050-AC3` | [AC-3](#ac-3) | konfirmasi destructive maksimum: dialog menyebut koneksi, database target, sumber artefak, dan kalimat dampak; pengguna mengetik nama database target; server... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `IT-0050-AC4` | [AC-4](#ac-4) | eksekusi: job menjalankan tool (PostgreSQL: psql untuk dump plain; MySQL: mysql client) membaca file streaming (gunzip bila perlu); password lewat mekanisme...  | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `IT-0050-AC5` | [AC-5](#ac-5) | hasil job memuat ringkasan (durasi, byte, exit code); restore sukses dan gagal diaudit (restore.completed/restore.failed: koneksi, database, sumber; tanpa is... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `IT-0050-AC7` | [AC-7](#ac-7) | e2e kedua engine: roundtrip penuh backup (spec 0049) lalu restore ke database baru menghasilkan data identik (perbandingan hitungan dan sampel); dump engine...  | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

## Test tambahan

### Contract test

| ID            | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                          | Expected result                                      |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `CT-0050-AC1` | [AC-1](#ac-1) | sumber restore: artefak milik user dari folder backups, atau file yang diunggah (jalur upload spec 0048, tipe sql/sql.gz); validasi sebelum konfirmasi: sniff... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `CT-0050-AC2` | [AC-2](#ac-2) | target restore: koneksi plus database tujuan; opsi: restore ke database yang ada (menimpa object bentrok sesuai isi dump) atau buat database baru dulu lalu r... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `CT-0050-AC3` | [AC-3](#ac-3) | konfirmasi destructive maksimum: dialog menyebut koneksi, database target, sumber artefak, dan kalimat dampak; pengguna mengetik nama database target; server... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `CT-0050-AC5` | [AC-5](#ac-5) | hasil job memuat ringkasan (durasi, byte, exit code); restore sukses dan gagal diaudit (restore.completed/restore.failed: koneksi, database, sumber; tanpa is... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `CT-0050-AC6` | [AC-6](#ac-6) | UI: alur restore di halaman backup-restore (pilih artefak atau unggah, validasi tampil, pilih target, konfirmasi ketik nama, panel job); fitur digerbangi cap... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

### E2E

| ID             | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                       | Expected result                                      |
| -------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------- |
| `E2E-0050-AC2` | [AC-2](#ac-2) | target restore: koneksi plus database tujuan; opsi: restore ke database yang ada (menimpa object bentrok sesuai isi dump) atau buat database baru dulu lalu r... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `E2E-0050-AC3` | [AC-3](#ac-3) | konfirmasi destructive maksimum: dialog menyebut koneksi, database target, sumber artefak, dan kalimat dampak; pengguna mengetik nama database target; server... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `E2E-0050-AC6` | [AC-6](#ac-6) | UI: alur restore di halaman backup-restore (pilih artefak atau unggah, validasi tampil, pilih target, konfirmasi ketik nama, panel job); fitur digerbangi cap... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `E2E-0050-AC7` | [AC-7](#ac-7) | e2e kedua engine: roundtrip penuh backup (spec 0049) lalu restore ke database baru menghasilkan data identik (perbandingan hitungan dan sampel); dump engine...  | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

### Security

| ID             | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                               | Expected result                                      |
| -------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `SEC-0050-AC1` | [AC-1](#ac-1) | sumber restore: artefak milik user dari folder backups, atau file yang diunggah (jalur upload spec 0048, tipe sql/sql.gz); validasi sebelum konfirmasi: sniff... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `SEC-0050-AC3` | [AC-3](#ac-3) | konfirmasi destructive maksimum: dialog menyebut koneksi, database target, sumber artefak, dan kalimat dampak; pengguna mengetik nama database target; server... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `SEC-0050-AC4` | [AC-4](#ac-4) | eksekusi: job menjalankan tool (PostgreSQL: psql untuk dump plain; MySQL: mysql client) membaca file streaming (gunzip bila perlu); password lewat mekanisme...  | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `SEC-0050-AC5` | [AC-5](#ac-5) | hasil job memuat ringkasan (durasi, byte, exit code); restore sukses dan gagal diaudit (restore.completed/restore.failed: koneksi, database, sumber; tanpa is... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `SEC-0050-AC7` | [AC-7](#ac-7) | e2e kedua engine: roundtrip penuh backup (spec 0049) lalu restore ke database baru menghasilkan data identik (perbandingan hitungan dan sampel); dump engine...  | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

### Performance

Tidak ada performance yang diwajibkan oleh acceptance criteria saat ini.

### Visual dan accessibility

Tidak ada visual dan accessibility yang diwajibkan oleh acceptance criteria saat ini.

### Smoke dan operational acceptance

| ID               | AC            | Fokus                                                                                                                                                           | Scenario terencana                                                                   | Expected result                                      |
| ---------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `SMOKE-0050-AC4` | [AC-4](#ac-4) | eksekusi: job menjalankan tool (PostgreSQL: psql untuk dump plain; MySQL: mysql client) membaca file streaming (gunzip bila perlu); password lewat mekanisme... | Jalankan artefak atau workflow pada environment bersih dan simpan bukti operasional. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `SMOKE-0050-AC7` | [AC-7](#ac-7) | e2e kedua engine: roundtrip penuh backup (spec 0049) lalu restore ke database baru menghasilkan data identik (perbandingan hitungan dan sampel); dump engine... | Jalankan artefak atau workflow pada environment bersih dan simpan bukti operasional. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

### Manual atau external proof

Tidak ada manual atau external yang diwajibkan oleh acceptance criteria saat ini.

## Critical test scenarios

- Roundtrip identik, verifikasi **AC-7**.
- Mismatch: dump MySQL ke koneksi PostgreSQL → ditolak di validate, verifikasi **AC-1**.
- Jejak: proses di kill paksa saat restore → audit started ada, job hilang dijelaskan (spec 0028 AC-6), verifikasi **AC-5**.

## Staged, environment, dan external proof

| AC            | Jenis bukti   | Kewajiban                                                         |
| ------------- | ------------- | ----------------------------------------------------------------- |
| [AC-4](#ac-4) | `environment` | Bukti membutuhkan native client subprocess.                       |
| [AC-7](#ac-7) | `environment` | Roundtrip kedua engine membutuhkan native tools dan server nyata. |

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
