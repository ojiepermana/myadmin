# Test dan acceptance criteria 0041. Table designer: kolom dan properti

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Belum dijalankan
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0041.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

create table: editor kolom multi baris (nama, tipe dari daftar tipe engine dengan parameter panjang/presisi/skala sesuai tipe, nullability, default eksplisit atau ekspresi, identity/auto increment, generated dengan ekspresinya, komentar), nama table dan schema/database konteks; PK sederhana bisa ditandai di sini (detail constraint lain di spec 0042).

### AC-2

alter table: editor memuat kolom kini dari describeTable, perubahan dikumpulkan sebagai change set (add, modify per aspek, drop, rename kolom); aspek yang tidak bisa diubah engine untuk tipe itu dinonaktifkan dengan alasan dari provider (contoh: mengubah generated expression di MySQL berarti drop dan add, dinyatakan).

### AC-3

`POST /tables/ddl/preview` mengkompilasi change set menjadi DDL lewat provider dan mengembalikan daftar statement plus peringatan (contoh: MySQL mengubah tipe akan menulis ulang table; PostgreSQL default volatile pada add column); UI menampilkan SQL dan peringatan sebelum tombol terapkan aktif.

### AC-4

`POST /tables/ddl/apply` menjalankan statement hasil kompilasi berurutan dalam transaksi bila engine mendukung DDL transaksional (PostgreSQL), atau berurutan dengan berhenti pada error dan laporan posisi bila tidak (MySQL), dengan hasil per statement; drop kolom di dalam change set memakai konfirmasi destructive (menyebut kolom dan table).

### AC-5

validasi provider: nama valid dan tidak bentrok, tipe dikenal, parameter tipe masuk akal, default kompatibel tipe, generated dan identity sesuai dukungan versi (capability `generatedColumns`, `identityColumns`); pelanggaran tiba sebagai 422 per field.

### AC-6

penerapan perubahan diaudit (`table.created`, `table.altered` dengan ringkasan perubahan, `table.column_dropped` untuk drop kolom) sebelum response sukses; drop kolom termasuk destructive (FR-SAFE-01, FR-SAFE-02).

### AC-7

setelah terapkan, cache metadata node terkait di invalidate dan explorer serta tab data menyegarkan struktur.

### AC-8

e2e kedua engine: buat table dengan semua jenis kolom yang didukung, alter (tambah, ubah nullability, rename, drop kolom), pratinjau selalu tampil, audit tercatat; test integrasi kompilasi DDL per engine dengan snapshot SQL.

## Matriks cakupan

| AC | Unit | Integration | Contract | E2E | Security | Performance | Visual | Smoke | Manual atau external |
|---|---|---|---|---|---|---|---|---|---|
| [AC-1](#ac-1) | `UT-0041-AC1` | `IT-0041-AC1` | n/a | `E2E-0041-AC1` | n/a | n/a | n/a | n/a | n/a |
| [AC-2](#ac-2) | `UT-0041-AC2` | `IT-0041-AC2` | n/a | `E2E-0041-AC2` | n/a | n/a | n/a | n/a | n/a |
| [AC-3](#ac-3) | `UT-0041-AC3` | `IT-0041-AC3` | `CT-0041-AC3` | `E2E-0041-AC3` | n/a | n/a | n/a | n/a | n/a |
| [AC-4](#ac-4) | n/a | `IT-0041-AC4` | `CT-0041-AC4` | `E2E-0041-AC4` | `SEC-0041-AC4` | n/a | n/a | n/a | n/a |
| [AC-5](#ac-5) | `UT-0041-AC5` | `IT-0041-AC5` | `CT-0041-AC5` | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-6](#ac-6) | n/a | `IT-0041-AC6` | n/a | n/a | `SEC-0041-AC6` | n/a | n/a | n/a | n/a |
| [AC-7](#ac-7) | `UT-0041-AC7` | `IT-0041-AC7` | n/a | `E2E-0041-AC7` | n/a | n/a | n/a | n/a | n/a |
| [AC-8](#ac-8) | `UT-0041-AC8` | `IT-0041-AC8` | n/a | `E2E-0041-AC8` | `SEC-0041-AC8` | n/a | n/a | n/a | n/a |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `UT-0041-AC1` | [AC-1](#ac-1) | create table: editor kolom multi baris (nama, tipe dari daftar tipe engine dengan parameter panjang/presisi/skala sesuai tipe, nullability, default eksplisit... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `UT-0041-AC2` | [AC-2](#ac-2) | alter table: editor memuat kolom kini dari describeTable, perubahan dikumpulkan sebagai change set (add, modify per aspek, drop, rename kolom); aspek yang ti... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `UT-0041-AC3` | [AC-3](#ac-3) | POST /tables/ddl/preview mengkompilasi change set menjadi DDL lewat provider dan mengembalikan daftar statement plus peringatan (contoh: MySQL mengubah tipe... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `UT-0041-AC5` | [AC-5](#ac-5) | validasi provider: nama valid dan tidak bentrok, tipe dikenal, parameter tipe masuk akal, default kompatibel tipe, generated dan identity sesuai dukungan ver... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `UT-0041-AC7` | [AC-7](#ac-7) | setelah terapkan, cache metadata node terkait di invalidate dan explorer serta tab data menyegarkan struktur. | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |
| `UT-0041-AC8` | [AC-8](#ac-8) | e2e kedua engine: buat table dengan semua jenis kolom yang didukung, alter (tambah, ubah nullability, rename, drop kolom), pratinjau selalu tampil, audit ter... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

## Integration test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `IT-0041-AC1` | [AC-1](#ac-1) | create table: editor kolom multi baris (nama, tipe dari daftar tipe engine dengan parameter panjang/presisi/skala sesuai tipe, nullability, default eksplisit... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `IT-0041-AC2` | [AC-2](#ac-2) | alter table: editor memuat kolom kini dari describeTable, perubahan dikumpulkan sebagai change set (add, modify per aspek, drop, rename kolom); aspek yang ti... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `IT-0041-AC3` | [AC-3](#ac-3) | POST /tables/ddl/preview mengkompilasi change set menjadi DDL lewat provider dan mengembalikan daftar statement plus peringatan (contoh: MySQL mengubah tipe... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `IT-0041-AC4` | [AC-4](#ac-4) | POST /tables/ddl/apply menjalankan statement hasil kompilasi berurutan dalam transaksi bila engine mendukung DDL transaksional (PostgreSQL), atau berurutan d... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `IT-0041-AC5` | [AC-5](#ac-5) | validasi provider: nama valid dan tidak bentrok, tipe dikenal, parameter tipe masuk akal, default kompatibel tipe, generated dan identity sesuai dukungan ver... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `IT-0041-AC6` | [AC-6](#ac-6) | penerapan perubahan diaudit (table.created, table.altered dengan ringkasan perubahan, table.column_dropped untuk drop kolom) sebelum response sukses; drop ko... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `IT-0041-AC7` | [AC-7](#ac-7) | setelah terapkan, cache metadata node terkait di invalidate dan explorer serta tab data menyegarkan struktur. | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |
| `IT-0041-AC8` | [AC-8](#ac-8) | e2e kedua engine: buat table dengan semua jenis kolom yang didukung, alter (tambah, ubah nullability, rename, drop kolom), pratinjau selalu tampil, audit ter... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

## Test tambahan

### Contract test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `CT-0041-AC3` | [AC-3](#ac-3) | POST /tables/ddl/preview mengkompilasi change set menjadi DDL lewat provider dan mengembalikan daftar statement plus peringatan (contoh: MySQL mengubah tipe... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `CT-0041-AC4` | [AC-4](#ac-4) | POST /tables/ddl/apply menjalankan statement hasil kompilasi berurutan dalam transaksi bila engine mendukung DDL transaksional (PostgreSQL), atau berurutan d... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `CT-0041-AC5` | [AC-5](#ac-5) | validasi provider: nama valid dan tidak bentrok, tipe dikenal, parameter tipe masuk akal, default kompatibel tipe, generated dan identity sesuai dukungan ver... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |

### E2E

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `E2E-0041-AC1` | [AC-1](#ac-1) | create table: editor kolom multi baris (nama, tipe dari daftar tipe engine dengan parameter panjang/presisi/skala sesuai tipe, nullability, default eksplisit... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `E2E-0041-AC2` | [AC-2](#ac-2) | alter table: editor memuat kolom kini dari describeTable, perubahan dikumpulkan sebagai change set (add, modify per aspek, drop, rename kolom); aspek yang ti... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `E2E-0041-AC3` | [AC-3](#ac-3) | POST /tables/ddl/preview mengkompilasi change set menjadi DDL lewat provider dan mengembalikan daftar statement plus peringatan (contoh: MySQL mengubah tipe... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `E2E-0041-AC4` | [AC-4](#ac-4) | POST /tables/ddl/apply menjalankan statement hasil kompilasi berurutan dalam transaksi bila engine mendukung DDL transaksional (PostgreSQL), atau berurutan d... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `E2E-0041-AC7` | [AC-7](#ac-7) | setelah terapkan, cache metadata node terkait di invalidate dan explorer serta tab data menyegarkan struktur. | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |
| `E2E-0041-AC8` | [AC-8](#ac-8) | e2e kedua engine: buat table dengan semua jenis kolom yang didukung, alter (tambah, ubah nullability, rename, drop kolom), pratinjau selalu tampil, audit ter... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

### Security

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `SEC-0041-AC4` | [AC-4](#ac-4) | POST /tables/ddl/apply menjalankan statement hasil kompilasi berurutan dalam transaksi bila engine mendukung DDL transaksional (PostgreSQL), atau berurutan d... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `SEC-0041-AC6` | [AC-6](#ac-6) | penerapan perubahan diaudit (table.created, table.altered dengan ringkasan perubahan, table.column_dropped untuk drop kolom) sebelum response sukses; drop ko... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `SEC-0041-AC8` | [AC-8](#ac-8) | e2e kedua engine: buat table dengan semua jenis kolom yang didukung, alter (tambah, ubah nullability, rename, drop kolom), pratinjau selalu tampil, audit ter... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

### Performance

Tidak ada performance yang diwajibkan oleh acceptance criteria saat ini.

### Visual dan accessibility

Tidak ada visual dan accessibility yang diwajibkan oleh acceptance criteria saat ini.

### Smoke dan operational acceptance

Tidak ada smoke dan operational yang diwajibkan oleh acceptance criteria saat ini.

### Manual atau external proof

Tidak ada manual atau external yang diwajibkan oleh acceptance criteria saat ini.

## Critical test scenarios

- Kesetiaan: preview dan apply menghasilkan statement identik (fungsi sama), verifikasi **AC-3**, **AC-4**.
- Transaksional: PostgreSQL change set gagal di tengah → rollback penuh; MySQL berhenti dengan laporan posisi, verifikasi **AC-4**.
- Validasi: default tak kompatibel tipe → 422 field spesifik, verifikasi **AC-5**.

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
