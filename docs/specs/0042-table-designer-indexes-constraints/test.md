# Test dan acceptance criteria 0042. Table designer: index dan constraint

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Parsial lokal — provider unit, contract, browser index/constraint flow, dan real-engine two-engine flow lulus; failure-boundary/security matrix dan visual penuh belum lengkap.
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0042.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

tab Index dan tab Constraint di table designer memuat keadaan kini dari describeTable: daftar index (nama, kolom terurut, unik, metode bila ada) dan constraint (PK, FK dengan referensi dan aturan ON, unique, check dengan ekspresi).

### AC-2

change set diperluas: addIndex, dropIndex, addConstraint, dropConstraint; "ubah" dimodelkan drop plus add dan pratinjau menampilkannya jujur sebagai dua statement.

### AC-3

editor FK: memilih kolom lokal, table target (pencari object dari metadata), kolom target, ON DELETE dan ON UPDATE dari daftar aturan engine; provider memvalidasi kecocokan tipe kolom dan (MySQL) memastikan index pendukung ada atau menambahkannya ke change set dengan pemberitahuan.

### AC-4

editor check dengan ekspresi bebas divalidasi provider saat preview (engine yang mem parse saat DDL); pada MySQL versi tanpa penegakan, UI menonaktifkan check dengan alasan dari capability `checkConstraints`.

### AC-5

composite index dan composite PK/unique didukung dengan pengurutan kolom drag; batas jumlah kolom mengikuti engine (dinyatakan provider).

### AC-6

drop index atau constraint memakai konfirmasi destructive; drop PK dan drop FK menampilkan peringatan dampak khusus (identitas baris data browser, integritas relasi); semua penerapan diaudit (`table.altered` dengan ringkasan) sebelum sukses.

### AC-7

setelah terapkan, invalidasi metadata (pola spec 0041 AC-7); data browser menyegarkan rowIdentity bila PK berubah.

### AC-8

test snapshot kompilasi untuk semua jenis index dan constraint di kedua engine; e2e: buat FK antar table fixture dengan aturan ON, buat composite unique, drop index, semuanya lewat pratinjau.

## Matriks cakupan

| AC            | Unit          | Integration   | Contract      | E2E            | Security       | Performance | Visual | Smoke | Manual atau external |
| ------------- | ------------- | ------------- | ------------- | -------------- | -------------- | ----------- | ------ | ----- | -------------------- |
| [AC-1](#ac-1) | `UT-0042-AC1` | `IT-0042-AC1` | n/a           | `E2E-0042-AC1` | n/a            | n/a         | n/a    | n/a   | n/a                  |
| [AC-2](#ac-2) | `UT-0042-AC2` | n/a           | `CT-0042-AC2` | `E2E-0042-AC2` | n/a            | n/a         | n/a    | n/a   | n/a                  |
| [AC-3](#ac-3) | `UT-0042-AC3` | `IT-0042-AC3` | `CT-0042-AC3` | `E2E-0042-AC3` | n/a            | n/a         | n/a    | n/a   | n/a                  |
| [AC-4](#ac-4) | `UT-0042-AC4` | `IT-0042-AC4` | n/a           | `E2E-0042-AC4` | n/a            | n/a         | n/a    | n/a   | n/a                  |
| [AC-5](#ac-5) | `UT-0042-AC5` | `IT-0042-AC5` | n/a           | `E2E-0042-AC5` | n/a            | n/a         | n/a    | n/a   | n/a                  |
| [AC-6](#ac-6) | n/a           | `IT-0042-AC6` | n/a           | `E2E-0042-AC6` | `SEC-0042-AC6` | n/a         | n/a    | n/a   | n/a                  |
| [AC-7](#ac-7) | `UT-0042-AC7` | `IT-0042-AC7` | n/a           | `E2E-0042-AC7` | n/a            | n/a         | n/a    | n/a   | n/a                  |
| [AC-8](#ac-8) | `UT-0042-AC8` | `IT-0042-AC8` | n/a           | `E2E-0042-AC8` | n/a            | n/a         | n/a    | n/a   | n/a                  |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

| ID            | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                                       | Expected result                                      |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `UT-0042-AC1` | [AC-1](#ac-1) | tab Index dan tab Constraint di table designer memuat keadaan kini dari describeTable: daftar index (nama, kolom terurut, unik, metode bila ada) dan constrai... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `UT-0042-AC2` | [AC-2](#ac-2) | change set diperluas: addIndex, dropIndex, addConstraint, dropConstraint; "ubah" dimodelkan drop plus add dan pratinjau menampilkannya jujur sebagai dua stat... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `UT-0042-AC3` | [AC-3](#ac-3) | editor FK: memilih kolom lokal, table target (pencari object dari metadata), kolom target, ON DELETE dan ON UPDATE dari daftar aturan engine; provider memval... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `UT-0042-AC4` | [AC-4](#ac-4) | editor check dengan ekspresi bebas divalidasi provider saat preview (engine yang mem parse saat DDL); pada MySQL versi tanpa penegakan, UI menonaktifkan chec... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `UT-0042-AC5` | [AC-5](#ac-5) | composite index dan composite PK/unique didukung dengan pengurutan kolom drag; batas jumlah kolom mengikuti engine (dinyatakan provider).                        | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `UT-0042-AC7` | [AC-7](#ac-7) | setelah terapkan, invalidasi metadata (pola spec 0041 AC-7); data browser menyegarkan rowIdentity bila PK berubah.                                               | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |
| `UT-0042-AC8` | [AC-8](#ac-8) | test snapshot kompilasi untuk semua jenis index dan constraint di kedua engine; e2e: buat FK antar table fixture dengan aturan ON, buat composite unique, dro... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

## Integration test

| ID            | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                         | Expected result                                      |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `IT-0042-AC1` | [AC-1](#ac-1) | tab Index dan tab Constraint di table designer memuat keadaan kini dari describeTable: daftar index (nama, kolom terurut, unik, metode bila ada) dan constrai... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `IT-0042-AC3` | [AC-3](#ac-3) | editor FK: memilih kolom lokal, table target (pencari object dari metadata), kolom target, ON DELETE dan ON UPDATE dari daftar aturan engine; provider memval... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `IT-0042-AC4` | [AC-4](#ac-4) | editor check dengan ekspresi bebas divalidasi provider saat preview (engine yang mem parse saat DDL); pada MySQL versi tanpa penegakan, UI menonaktifkan chec... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `IT-0042-AC5` | [AC-5](#ac-5) | composite index dan composite PK/unique didukung dengan pengurutan kolom drag; batas jumlah kolom mengikuti engine (dinyatakan provider).                        | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `IT-0042-AC6` | [AC-6](#ac-6) | drop index atau constraint memakai konfirmasi destructive; drop PK dan drop FK menampilkan peringatan dampak khusus (identitas baris data browser, integritas... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `IT-0042-AC7` | [AC-7](#ac-7) | setelah terapkan, invalidasi metadata (pola spec 0041 AC-7); data browser menyegarkan rowIdentity bila PK berubah.                                               | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |
| `IT-0042-AC8` | [AC-8](#ac-8) | test snapshot kompilasi untuk semua jenis index dan constraint di kedua engine; e2e: buat FK antar table fixture dengan aturan ON, buat composite unique, dro... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

## Test tambahan

### Contract test

| ID            | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                          | Expected result                                      |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `CT-0042-AC2` | [AC-2](#ac-2) | change set diperluas: addIndex, dropIndex, addConstraint, dropConstraint; "ubah" dimodelkan drop plus add dan pratinjau menampilkannya jujur sebagai dua stat... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `CT-0042-AC3` | [AC-3](#ac-3) | editor FK: memilih kolom lokal, table target (pencari object dari metadata), kolom target, ON DELETE dan ON UPDATE dari daftar aturan engine; provider memval... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |

### E2E

| ID             | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                       | Expected result                                      |
| -------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------- |
| `E2E-0042-AC1` | [AC-1](#ac-1) | tab Index dan tab Constraint di table designer memuat keadaan kini dari describeTable: daftar index (nama, kolom terurut, unik, metode bila ada) dan constrai... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `E2E-0042-AC2` | [AC-2](#ac-2) | change set diperluas: addIndex, dropIndex, addConstraint, dropConstraint; "ubah" dimodelkan drop plus add dan pratinjau menampilkannya jujur sebagai dua stat... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `E2E-0042-AC3` | [AC-3](#ac-3) | editor FK: memilih kolom lokal, table target (pencari object dari metadata), kolom target, ON DELETE dan ON UPDATE dari daftar aturan engine; provider memval... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `E2E-0042-AC4` | [AC-4](#ac-4) | editor check dengan ekspresi bebas divalidasi provider saat preview (engine yang mem parse saat DDL); pada MySQL versi tanpa penegakan, UI menonaktifkan chec... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `E2E-0042-AC5` | [AC-5](#ac-5) | composite index dan composite PK/unique didukung dengan pengurutan kolom drag; batas jumlah kolom mengikuti engine (dinyatakan provider).                        | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `E2E-0042-AC6` | [AC-6](#ac-6) | drop index atau constraint memakai konfirmasi destructive; drop PK dan drop FK menampilkan peringatan dampak khusus (identitas baris data browser, integritas... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `E2E-0042-AC7` | [AC-7](#ac-7) | setelah terapkan, invalidasi metadata (pola spec 0041 AC-7); data browser menyegarkan rowIdentity bila PK berubah.                                               | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |
| `E2E-0042-AC8` | [AC-8](#ac-8) | test snapshot kompilasi untuk semua jenis index dan constraint di kedua engine; e2e: buat FK antar table fixture dengan aturan ON, buat composite unique, dro... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

### Security

| ID             | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                               | Expected result                                      |
| -------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `SEC-0042-AC6` | [AC-6](#ac-6) | drop index atau constraint memakai konfirmasi destructive; drop PK dan drop FK menampilkan peringatan dampak khusus (identitas baris data browser, integritas... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

### Performance

Tidak ada performance yang diwajibkan oleh acceptance criteria saat ini.

### Visual dan accessibility

Tidak ada visual dan accessibility yang diwajibkan oleh acceptance criteria saat ini.

### Smoke dan operational acceptance

Tidak ada smoke dan operational yang diwajibkan oleh acceptance criteria saat ini.

### Manual atau external proof

Tidak ada manual atau external yang diwajibkan oleh acceptance criteria saat ini.

## Critical test scenarios

- FK MySQL tanpa index pendukung → change set otomatis berisi index tambahan dan pratinjau menampilkannya, verifikasi **AC-3**.
- Drop PK → peringatan dampak dan setelahnya data browser menandai read only bila tak ada identitas lain, verifikasi **AC-6**, **AC-7**.
- Check pada MySQL lama → dinonaktifkan dengan alasan, verifikasi **AC-4**.

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
