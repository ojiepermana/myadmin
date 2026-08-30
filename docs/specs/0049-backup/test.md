# Test dan acceptance criteria 0049. Backup

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Parsial lokal — executor/artifact/provider tests, PostgreSQL dan MySQL native roundtrip, native MySQL backup-to-restore E2E, service/route unsupported capability, browser safeguard, serta no-tool UI lulus; PostgreSQL native backup host, smoke cancel/no-tool, route matrix penuh, dan seluruh E2E backup belum lengkap.
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0049.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

deteksi tool saat startup dan saat diminta: mencari `pg_dump`/`pg_restore` dan `mysqldump`/`mysql` di config path (`tools.pgDumpPath` dan sebagainya) lalu PATH; versi tool dibaca dan dicocokkan kompatibilitasnya dengan versi server (mayor pg_dump >= mayor server untuk PostgreSQL; ketidakcocokan menjadi peringatan atau penolakan sesuai aturan provider); hasil deteksi menentukan capability `backupRestore` per koneksi dan check doctor (FR-BKR-02).

### AC-2

`POST /backup` membuat job: { connectionId, database, scope: structure|data|both, compress: boolean, catatan opsional }; job menjalankan native tool sebagai subprocess dengan argumen yang dibangun provider; password dialirkan lewat mekanisme aman engine (PGPASSWORD env / file option MySQL yang dibuat sementara dengan permission ketat dan dihapus), tidak pernah lewat argumen command line (terlihat di process list).

### AC-3

keluaran tool dialirkan ke file `<data-dir>/backups/<label>-<timestamp>.sql[.gz]` (gzip streaming bila compress); progress dilaporkan dari byte tertulis dan keluaran stderr tool yang di parse ringan; cancel membunuh subprocess dengan rapi dan menghapus artefak parsial.

### AC-4

validasi hasil: exit code nol, file tidak kosong, dan sniff header format benar; kegagalan menyertakan potongan stderr yang sudah melalui redaction (stderr tool bisa memuat detail koneksi).

### AC-5

daftar backup: `GET /backups` menampilkan artefak di folder backups milik user pembuat (metadata manifest kecil per artefak: koneksi, database, scope, ukuran, waktu, versi tool); unduh dan hapus (dengan konfirmasi) tersedia; artefak tidak dihapus otomatis.

### AC-6

backup selesai/gagal diaudit (`backup.completed`/`backup.failed`: koneksi, database, scope; tanpa isi); UI: dialog backup dari context menu database plus halaman backup-restore berisi daftar artefak dan panel jobs (FR-BKR-01).

### AC-7

tanpa tool terdeteksi: UI menonaktifkan backup dengan penjelasan dan tautan ke doctor; endpoint menjawab `unsupported` dengan reason; tidak ada percobaan setengah jalan (FR-BKR-02).

### AC-8

e2e kedua engine (lingkungan test menyediakan tool): backup both compress, file valid dan bisa dibuka; structure only tanpa data; cancel membersihkan; tanpa tool (disimulasikan) fitur nonaktif dengan penjelasan.

## Matriks cakupan

| AC            | Unit          | Integration   | Contract      | E2E            | Security       | Performance | Visual | Smoke            | Manual atau external |
| ------------- | ------------- | ------------- | ------------- | -------------- | -------------- | ----------- | ------ | ---------------- | -------------------- |
| [AC-1](#ac-1) | `UT-0049-AC1` | `IT-0049-AC1` | `CT-0049-AC1` | n/a            | n/a            | n/a         | n/a    | `SMOKE-0049-AC1` | n/a                  |
| [AC-2](#ac-2) | `UT-0049-AC2` | `IT-0049-AC2` | `CT-0049-AC2` | n/a            | `SEC-0049-AC2` | n/a         | n/a    | n/a              | n/a                  |
| [AC-3](#ac-3) | n/a           | `IT-0049-AC3` | n/a           | n/a            | n/a            | n/a         | n/a    | `SMOKE-0049-AC3` | n/a                  |
| [AC-4](#ac-4) | `UT-0049-AC4` | `IT-0049-AC4` | n/a           | n/a            | `SEC-0049-AC4` | n/a         | n/a    | n/a              | n/a                  |
| [AC-5](#ac-5) | n/a           | `IT-0049-AC5` | `CT-0049-AC5` | `E2E-0049-AC5` | `SEC-0049-AC5` | n/a         | n/a    | n/a              | n/a                  |
| [AC-6](#ac-6) | n/a           | `IT-0049-AC6` | n/a           | `E2E-0049-AC6` | `SEC-0049-AC6` | n/a         | n/a    | n/a              | n/a                  |
| [AC-7](#ac-7) | `UT-0049-AC7` | `IT-0049-AC7` | `CT-0049-AC7` | `E2E-0049-AC7` | n/a            | n/a         | n/a    | n/a              | n/a                  |
| [AC-8](#ac-8) | n/a           | `IT-0049-AC8` | n/a           | `E2E-0049-AC8` | n/a            | n/a         | n/a    | `SMOKE-0049-AC8` | n/a                  |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

| ID            | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                                       | Expected result                                      |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `UT-0049-AC1` | [AC-1](#ac-1) | deteksi tool saat startup dan saat diminta: mencari pg_dump/pg_restore dan mysqldump/mysql di config path (tools.pgDumpPath dan sebagainya) lalu PATH; versi...  | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `UT-0049-AC2` | [AC-2](#ac-2) | POST /backup membuat job: { connectionId, database, scope: structure\|data\|both, compress: boolean, catatan opsional }; job menjalankan native tool sebagai...  | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `UT-0049-AC4` | [AC-4](#ac-4) | validasi hasil: exit code nol, file tidak kosong, dan sniff header format benar; kegagalan menyertakan potongan stderr yang sudah melalui redaction (stderr t... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `UT-0049-AC7` | [AC-7](#ac-7) | tanpa tool terdeteksi: UI menonaktifkan backup dengan penjelasan dan tautan ke doctor; endpoint menjawab unsupported dengan reason; tidak ada percobaan seten... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

## Integration test

| ID            | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                         | Expected result                                      |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `IT-0049-AC1` | [AC-1](#ac-1) | deteksi tool saat startup dan saat diminta: mencari pg_dump/pg_restore dan mysqldump/mysql di config path (tools.pgDumpPath dan sebagainya) lalu PATH; versi...  | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `IT-0049-AC2` | [AC-2](#ac-2) | POST /backup membuat job: { connectionId, database, scope: structure\|data\|both, compress: boolean, catatan opsional }; job menjalankan native tool sebagai...  | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `IT-0049-AC3` | [AC-3](#ac-3) | keluaran tool dialirkan ke file <data-dir>/backups/<label>-<timestamp>.sql[.gz] (gzip streaming bila compress); progress dilaporkan dari byte tertulis dan ke... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `IT-0049-AC4` | [AC-4](#ac-4) | validasi hasil: exit code nol, file tidak kosong, dan sniff header format benar; kegagalan menyertakan potongan stderr yang sudah melalui redaction (stderr t... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `IT-0049-AC5` | [AC-5](#ac-5) | daftar backup: GET /backups menampilkan artefak di folder backups milik user pembuat (metadata manifest kecil per artefak: koneksi, database, scope, ukuran,...  | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `IT-0049-AC6` | [AC-6](#ac-6) | backup selesai/gagal diaudit (backup.completed/backup.failed: koneksi, database, scope; tanpa isi); UI: dialog backup dari context menu database plus halaman... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `IT-0049-AC7` | [AC-7](#ac-7) | tanpa tool terdeteksi: UI menonaktifkan backup dengan penjelasan dan tautan ke doctor; endpoint menjawab unsupported dengan reason; tidak ada percobaan seten... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |
| `IT-0049-AC8` | [AC-8](#ac-8) | e2e kedua engine (lingkungan test menyediakan tool): backup both compress, file valid dan bisa dibuka; structure only tanpa data; cancel membersihkan; tanpa...  | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

## Test tambahan

### Contract test

| ID            | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                          | Expected result                                      |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `CT-0049-AC1` | [AC-1](#ac-1) | deteksi tool saat startup dan saat diminta: mencari pg_dump/pg_restore dan mysqldump/mysql di config path (tools.pgDumpPath dan sebagainya) lalu PATH; versi...  | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `CT-0049-AC2` | [AC-2](#ac-2) | POST /backup membuat job: { connectionId, database, scope: structure\|data\|both, compress: boolean, catatan opsional }; job menjalankan native tool sebagai...  | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `CT-0049-AC5` | [AC-5](#ac-5) | daftar backup: GET /backups menampilkan artefak di folder backups milik user pembuat (metadata manifest kecil per artefak: koneksi, database, scope, ukuran,...  | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `CT-0049-AC7` | [AC-7](#ac-7) | tanpa tool terdeteksi: UI menonaktifkan backup dengan penjelasan dan tautan ke doctor; endpoint menjawab unsupported dengan reason; tidak ada percobaan seten... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

### E2E

| ID             | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                       | Expected result                                      |
| -------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------- |
| `E2E-0049-AC5` | [AC-5](#ac-5) | daftar backup: GET /backups menampilkan artefak di folder backups milik user pembuat (metadata manifest kecil per artefak: koneksi, database, scope, ukuran,...  | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `E2E-0049-AC6` | [AC-6](#ac-6) | backup selesai/gagal diaudit (backup.completed/backup.failed: koneksi, database, scope; tanpa isi); UI: dialog backup dari context menu database plus halaman... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `E2E-0049-AC7` | [AC-7](#ac-7) | tanpa tool terdeteksi: UI menonaktifkan backup dengan penjelasan dan tautan ke doctor; endpoint menjawab unsupported dengan reason; tidak ada percobaan seten... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |
| `E2E-0049-AC8` | [AC-8](#ac-8) | e2e kedua engine (lingkungan test menyediakan tool): backup both compress, file valid dan bisa dibuka; structure only tanpa data; cancel membersihkan; tanpa...  | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

### Security

| ID             | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                               | Expected result                                      |
| -------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `SEC-0049-AC2` | [AC-2](#ac-2) | POST /backup membuat job: { connectionId, database, scope: structure\|data\|both, compress: boolean, catatan opsional }; job menjalankan native tool sebagai...  | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `SEC-0049-AC4` | [AC-4](#ac-4) | validasi hasil: exit code nol, file tidak kosong, dan sniff header format benar; kegagalan menyertakan potongan stderr yang sudah melalui redaction (stderr t... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `SEC-0049-AC5` | [AC-5](#ac-5) | daftar backup: GET /backups menampilkan artefak di folder backups milik user pembuat (metadata manifest kecil per artefak: koneksi, database, scope, ukuran,...  | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `SEC-0049-AC6` | [AC-6](#ac-6) | backup selesai/gagal diaudit (backup.completed/backup.failed: koneksi, database, scope; tanpa isi); UI: dialog backup dari context menu database plus halaman... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

### Performance

Tidak ada performance yang diwajibkan oleh acceptance criteria saat ini.

### Visual dan accessibility

Tidak ada visual dan accessibility yang diwajibkan oleh acceptance criteria saat ini.

### Smoke dan operational acceptance

| ID               | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                   | Expected result                                      |
| ---------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `SMOKE-0049-AC1` | [AC-1](#ac-1) | deteksi tool saat startup dan saat diminta: mencari pg_dump/pg_restore dan mysqldump/mysql di config path (tools.pgDumpPath dan sebagainya) lalu PATH; versi...  | Jalankan artefak atau workflow pada environment bersih dan simpan bukti operasional. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `SMOKE-0049-AC3` | [AC-3](#ac-3) | keluaran tool dialirkan ke file <data-dir>/backups/<label>-<timestamp>.sql[.gz] (gzip streaming bila compress); progress dilaporkan dari byte tertulis dan ke... | Jalankan artefak atau workflow pada environment bersih dan simpan bukti operasional. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `SMOKE-0049-AC8` | [AC-8](#ac-8) | e2e kedua engine (lingkungan test menyediakan tool): backup both compress, file valid dan bisa dibuka; structure only tanpa data; cancel membersihkan; tanpa...  | Jalankan artefak atau workflow pada environment bersih dan simpan bukti operasional. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

### Manual atau external proof

Tidak ada manual atau external yang diwajibkan oleh acceptance criteria saat ini.

## Critical test scenarios

- Kebersihan credential: process list dan log selama backup tidak memuat password, verifikasi **AC-2**.
- Validasi: tool dipaksa gagal (host salah) → job failed dengan stderr tersensor, tanpa artefak, verifikasi **AC-4**.
- Ketersediaan: PATH tanpa tool → capability false, UI menjelaskan, doctor menyebut, verifikasi **AC-1**, **AC-7**.

## Staged, environment, dan external proof

| AC            | Jenis bukti   | Kewajiban                                                        |
| ------------- | ------------- | ---------------------------------------------------------------- |
| [AC-1](#ac-1) | `environment` | Bukti membutuhkan native tools dan server database target.       |
| [AC-8](#ac-8) | `environment` | Bukti membutuhkan native tools serta PostgreSQL dan MySQL nyata. |

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
