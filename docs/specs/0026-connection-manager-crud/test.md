# Test dan acceptance criteria 0026. Connection manager: CRUD dan vault

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Belum dijalankan
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0026.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

`POST /connections` menerima descriptor lengkap (label, engine, host, port, database awal opsional, username, sslMode plus opsi TLS non rahasia, connectTimeoutMs, groupId opsional, tag, warna) plus `secret` opsional (password) dan `saveSecret` boolean; validasi server: label unik per pemilik, port 1 sampai 65535, engine dikenal, mode TLS valid (FR-CONN-01).

### AC-2

bila `saveSecret` true, secret dienkripsi vault dan disimpan di `connection_credentials`; bila false, koneksi tersimpan tanpa credential dan pemakaian nanti meminta password sesaat; secret tidak pernah muncul di response mana pun.

### AC-3

`POST /connections/test` menguji tanpa menyimpan: menerima descriptor plus secret transient, atau id koneksi tersimpan (memakai credential vault); hasil ternormalisasi: sukses dengan versi server dan latency, atau `DbError` kategori jelas; secret transient tidak dicatat di mana pun (FR-CONN-02).

### AC-4

`PATCH /connections/:id` mengubah descriptor dan opsional mengganti atau menghapus secret tersimpan; `GET /connections` mengembalikan daftar milik sendiri (semua koneksi bagi Admin, dengan penanda pemilik); response hanya descriptor, tidak pernah material rahasia.

### AC-5

`DELETE /connections/:id` meminta konfirmasi eksplisit di UI, menghapus descriptor dan credential nya (cascade), memutus sesi provider aktif koneksi itu, dan diaudit; setelah hapus, credential tidak mungkin dipakai lagi (FR-CONN-03).

### AC-6

`POST /connections/:id/duplicate` menyalin descriptor dengan label baru; credential ikut tersalin hanya bila pemilik yang menduplikasi dan memilih menyalin.

### AC-7

server group CRUD (`/server-groups`): nama unik per pemilik, warna, urutan; koneksi bisa dipindah group; menghapus group tidak menghapus koneksinya (koneksi menjadi tanpa group) dengan konfirmasi yang menjelaskan itu (FR-CONN-04).

### AC-8

otorisasi: pemilik penuh atas koneksinya; Admin dapat list semua descriptor dan menghapus koneksi siapa pun (diaudit dengan actor Admin), tapi tidak dapat membaca/mengubah/memakai credential milik orang lain; endpoint test dan duplicate atas koneksi orang lain ditolak 403 bagi Admin sekalipun.

### AC-9

mutasi koneksi (create, update, delete, ganti secret) menghasilkan audit event tanpa secret (FR-AUD-01).

### AC-10

UI: halaman connections berisi daftar per group, form buat dan ubah dengan bagian TLS dan timeout, aksi test dengan hasil inline, duplicate, delete dengan konfirmasi menyebut label dan host; form bisa diselesaikan keyboard; e2e menutup alur buat, test, ubah, hapus.

## Matriks cakupan

| AC | Unit | Integration | Contract | E2E | Security | Performance | Visual | Smoke | Manual atau external |
|---|---|---|---|---|---|---|---|---|---|
| [AC-1](#ac-1) | n/a | `IT-0026-AC1` | `CT-0026-AC1` | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-2](#ac-2) | n/a | `IT-0026-AC2` | n/a | n/a | `SEC-0026-AC2` | n/a | n/a | n/a | n/a |
| [AC-3](#ac-3) | n/a | `IT-0026-AC3` | n/a | n/a | `SEC-0026-AC3` | n/a | n/a | n/a | n/a |
| [AC-4](#ac-4) | n/a | `IT-0026-AC4` | n/a | n/a | `SEC-0026-AC4` | n/a | n/a | n/a | n/a |
| [AC-5](#ac-5) | n/a | `IT-0026-AC5` | n/a | `E2E-0026-AC5` | n/a | n/a | n/a | n/a | n/a |
| [AC-6](#ac-6) | n/a | `IT-0026-AC6` | n/a | n/a | `SEC-0026-AC6` | n/a | n/a | n/a | n/a |
| [AC-7](#ac-7) | n/a | `IT-0026-AC7` | n/a | `E2E-0026-AC7` | n/a | n/a | n/a | n/a | n/a |
| [AC-8](#ac-8) | n/a | n/a | n/a | n/a | `SEC-0026-AC8` | n/a | n/a | n/a | n/a |
| [AC-9](#ac-9) | n/a | `IT-0026-AC9` | n/a | n/a | `SEC-0026-AC9` | n/a | n/a | n/a | n/a |
| [AC-10](#ac-10) | n/a | n/a | n/a | `E2E-0026-AC10` | n/a | n/a | `VIS-0026-AC10` | n/a | n/a |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

Tidak ada unit yang diwajibkan oleh acceptance criteria saat ini.

## Integration test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `IT-0026-AC1` | [AC-1](#ac-1) | POST /connections menerima descriptor lengkap (label, engine, host, port, database awal opsional, username, sslMode plus opsi TLS non rahasia, connectTimeout... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `IT-0026-AC2` | [AC-2](#ac-2) | bila saveSecret true, secret dienkripsi vault dan disimpan di connection_credentials; bila false, koneksi tersimpan tanpa credential dan pemakaian nanti memi... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `IT-0026-AC3` | [AC-3](#ac-3) | POST /connections/test menguji tanpa menyimpan: menerima descriptor plus secret transient, atau id koneksi tersimpan (memakai credential vault); hasil ternor... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `IT-0026-AC4` | [AC-4](#ac-4) | PATCH /connections/:id mengubah descriptor dan opsional mengganti atau menghapus secret tersimpan; GET /connections mengembalikan daftar milik sendiri (semua... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `IT-0026-AC5` | [AC-5](#ac-5) | DELETE /connections/:id meminta konfirmasi eksplisit di UI, menghapus descriptor dan credential nya (cascade), memutus sesi provider aktif koneksi itu, dan d... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `IT-0026-AC6` | [AC-6](#ac-6) | POST /connections/:id/duplicate menyalin descriptor dengan label baru; credential ikut tersalin hanya bila pemilik yang menduplikasi dan memilih menyalin. | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `IT-0026-AC7` | [AC-7](#ac-7) | server group CRUD (/server-groups): nama unik per pemilik, warna, urutan; koneksi bisa dipindah group; menghapus group tidak menghapus koneksinya (koneksi me... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |
| `IT-0026-AC9` | [AC-9](#ac-9) | mutasi koneksi (create, update, delete, ganti secret) menghasilkan audit event tanpa secret (FR-AUD-01). | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-9 terpenuhi. |

## Test tambahan

### Contract test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `CT-0026-AC1` | [AC-1](#ac-1) | POST /connections menerima descriptor lengkap (label, engine, host, port, database awal opsional, username, sslMode plus opsi TLS non rahasia, connectTimeout... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |

### E2E

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `E2E-0026-AC5` | [AC-5](#ac-5) | DELETE /connections/:id meminta konfirmasi eksplisit di UI, menghapus descriptor dan credential nya (cascade), memutus sesi provider aktif koneksi itu, dan d... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `E2E-0026-AC7` | [AC-7](#ac-7) | server group CRUD (/server-groups): nama unik per pemilik, warna, urutan; koneksi bisa dipindah group; menghapus group tidak menghapus koneksinya (koneksi me... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |
| `E2E-0026-AC10` | [AC-10](#ac-10) | UI: halaman connections berisi daftar per group, form buat dan ubah dengan bagian TLS dan timeout, aksi test dengan hasil inline, duplicate, delete dengan ko... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-10 terpenuhi. |

### Security

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `SEC-0026-AC2` | [AC-2](#ac-2) | bila saveSecret true, secret dienkripsi vault dan disimpan di connection_credentials; bila false, koneksi tersimpan tanpa credential dan pemakaian nanti memi... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `SEC-0026-AC3` | [AC-3](#ac-3) | POST /connections/test menguji tanpa menyimpan: menerima descriptor plus secret transient, atau id koneksi tersimpan (memakai credential vault); hasil ternor... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `SEC-0026-AC4` | [AC-4](#ac-4) | PATCH /connections/:id mengubah descriptor dan opsional mengganti atau menghapus secret tersimpan; GET /connections mengembalikan daftar milik sendiri (semua... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `SEC-0026-AC6` | [AC-6](#ac-6) | POST /connections/:id/duplicate menyalin descriptor dengan label baru; credential ikut tersalin hanya bila pemilik yang menduplikasi dan memilih menyalin. | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `SEC-0026-AC8` | [AC-8](#ac-8) | otorisasi: pemilik penuh atas koneksinya; Admin dapat list semua descriptor dan menghapus koneksi siapa pun (diaudit dengan actor Admin), tapi tidak dapat me... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |
| `SEC-0026-AC9` | [AC-9](#ac-9) | mutasi koneksi (create, update, delete, ganti secret) menghasilkan audit event tanpa secret (FR-AUD-01). | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-9 terpenuhi. |

### Performance

Tidak ada performance yang diwajibkan oleh acceptance criteria saat ini.

### Visual dan accessibility

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `VIS-0026-AC10` | [AC-10](#ac-10) | UI: halaman connections berisi daftar per group, form buat dan ubah dengan bagian TLS dan timeout, aksi test dengan hasil inline, duplicate, delete dengan ko... | Kunci viewport, mode warna, state komponen, interaksi keyboard, dan bukti screenshot. | Seluruh outcome dan failure boundary AC-10 terpenuhi. |

### Smoke dan operational acceptance

Tidak ada smoke dan operational yang diwajibkan oleh acceptance criteria saat ini.

### Manual atau external proof

Tidak ada manual atau external yang diwajibkan oleh acceptance criteria saat ini.

## Critical test scenarios

- Happy path: buat dengan simpan secret → file db tanpa plaintext → test by id sukses, verifikasi **AC-1**, **AC-2**, **AC-3**.
- Otorisasi: Admin menghapus koneksi user lain (boleh, diaudit); Admin test koneksi user lain (403), verifikasi **AC-8**.
- Hapus: koneksi terhapus → credential hilang → test by id 404, verifikasi **AC-5**.

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
