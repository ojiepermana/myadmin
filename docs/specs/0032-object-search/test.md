# Test dan acceptance criteria 0032. Object search

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Parsial lokal — real browser dan metadata performance PostgreSQL/MySQL lulus; visual dan acceptance penuh belum lengkap.
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0032.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

`GET /connections/:id/search?q=&types=&database=&page=` memanggil `searchObjects` provider: q minimal 2 karakter, types opsional (database, schema, table, view, routine), lingkup opsional per database, hasil paginated (pageSize 50) berbentuk `ObjectRef` plus tipe dan konteksnya.

### AC-2

pencarian berjalan hanya pada koneksi tersambung milik user; input dipakai sebagai parameter query provider (tanpa penyambungan SQL, sudah dijamin spec 0023/0025 AC-6).

### AC-3

UI: kotak pencarian di panel explorer dengan debounce 300 ms, hasil dikelompokkan per tipe, keyboard penuh (panah, Enter), dan tombol muat halaman berikutnya;状态 kosong dan error yang jelas.

### AC-4

memilih hasil melompat ke node terkait di pohon (mengekspansi jalurnya secara malas) atau, lewat menu hasil, langsung ke aksi utama object itu (browse data untuk table, definisi untuk view) sesuai registry aksi spec 0031.

### AC-5

pencarian dibatalkan otomatis saat kueri berubah (request lama di abort) supaya hasil tidak balapan.

### AC-6

e2e: cari nama table pada fixture 2000 table, hasil datang paginated cepat, lompat ke node bekerja, di kedua engine.

## Matriks cakupan

| AC            | Unit          | Integration   | Contract      | E2E            | Security       | Performance     | Visual | Smoke | Manual atau external |
| ------------- | ------------- | ------------- | ------------- | -------------- | -------------- | --------------- | ------ | ----- | -------------------- |
| [AC-1](#ac-1) | n/a           | `IT-0032-AC1` | `CT-0032-AC1` | n/a            | n/a            | n/a             | n/a    | n/a   | n/a                  |
| [AC-2](#ac-2) | n/a           | `IT-0032-AC2` | n/a           | n/a            | `SEC-0032-AC2` | n/a             | n/a    | n/a   | n/a                  |
| [AC-3](#ac-3) | `UT-0032-AC3` | n/a           | n/a           | `E2E-0032-AC3` | n/a            | n/a             | n/a    | n/a   | n/a                  |
| [AC-4](#ac-4) | n/a           | n/a           | n/a           | `E2E-0032-AC4` | n/a            | n/a             | n/a    | n/a   | n/a                  |
| [AC-5](#ac-5) | `UT-0032-AC5` | n/a           | n/a           | `E2E-0032-AC5` | n/a            | n/a             | n/a    | n/a   | n/a                  |
| [AC-6](#ac-6) | n/a           | n/a           | n/a           | `E2E-0032-AC6` | n/a            | `PERF-0032-AC6` | n/a    | n/a   | n/a                  |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

| ID            | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                                       | Expected result                                      |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `UT-0032-AC3` | [AC-3](#ac-3) | UI: kotak pencarian di panel explorer dengan debounce 300 ms, hasil dikelompokkan per tipe, keyboard penuh (panah, Enter), dan tombol muat halaman berikutnya... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `UT-0032-AC5` | [AC-5](#ac-5) | pencarian dibatalkan otomatis saat kueri berubah (request lama di abort) supaya hasil tidak balapan.                                                             | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |

## Integration test

| ID            | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                         | Expected result                                      |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `IT-0032-AC1` | [AC-1](#ac-1) | GET /connections/:id/search?q=&types=&database=&page= memanggil searchObjects provider: q minimal 2 karakter, types opsional (database, schema, table, view,...  | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `IT-0032-AC2` | [AC-2](#ac-2) | pencarian berjalan hanya pada koneksi tersambung milik user; input dipakai sebagai parameter query provider (tanpa penyambungan SQL, sudah dijamin spec 0023/... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |

## Test tambahan

### Contract test

| ID            | AC            | Fokus                                                                                                                                                           | Scenario terencana                                                                          | Expected result                                      |
| ------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `CT-0032-AC1` | [AC-1](#ac-1) | GET /connections/:id/search?q=&types=&database=&page= memanggil searchObjects provider: q minimal 2 karakter, types opsional (database, schema, table, view,... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |

### E2E

| ID             | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                       | Expected result                                      |
| -------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------- |
| `E2E-0032-AC3` | [AC-3](#ac-3) | UI: kotak pencarian di panel explorer dengan debounce 300 ms, hasil dikelompokkan per tipe, keyboard penuh (panah, Enter), dan tombol muat halaman berikutnya... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `E2E-0032-AC4` | [AC-4](#ac-4) | memilih hasil melompat ke node terkait di pohon (mengekspansi jalurnya secara malas) atau, lewat menu hasil, langsung ke aksi utama object itu (browse data u... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `E2E-0032-AC5` | [AC-5](#ac-5) | pencarian dibatalkan otomatis saat kueri berubah (request lama di abort) supaya hasil tidak balapan.                                                             | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `E2E-0032-AC6` | [AC-6](#ac-6) | e2e: cari nama table pada fixture 2000 table, hasil datang paginated cepat, lompat ke node bekerja, di kedua engine.                                             | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

### Security

| ID             | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                               | Expected result                                      |
| -------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `SEC-0032-AC2` | [AC-2](#ac-2) | pencarian berjalan hanya pada koneksi tersambung milik user; input dipakai sebagai parameter query provider (tanpa penyambungan SQL, sudah dijamin spec 0023/... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |

### Performance

| ID              | AC            | Fokus                                                                                                                | Scenario terencana                                                               | Expected result                                      |
| --------------- | ------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `PERF-0032-AC6` | [AC-6](#ac-6) | e2e: cari nama table pada fixture 2000 table, hasil datang paginated cepat, lompat ke node bekerja, di kedua engine. | Tetapkan dataset, baseline, ambang, pengulangan, dan toleransi sebelum eksekusi. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

### Visual dan accessibility

Tidak ada visual dan accessibility yang diwajibkan oleh acceptance criteria saat ini.

### Smoke dan operational acceptance

Tidak ada smoke dan operational yang diwajibkan oleh acceptance criteria saat ini.

### Manual atau external proof

Tidak ada manual atau external yang diwajibkan oleh acceptance criteria saat ini.

## Critical test scenarios

- Happy path: kueri menemukan table di schema dalam, lompat mengekspansi jalur, verifikasi **AC-1**, **AC-4**.
- Balapan: dua kueri beruntun cepat → hanya hasil terakhir dirender, verifikasi **AC-5**.
- Batas: q satu karakter → 422 dan UI menahan, verifikasi **AC-1**.

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
