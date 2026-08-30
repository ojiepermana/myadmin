# Test dan acceptance criteria 0020. Halaman audit Admin

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Parsial lokal — audit integration/security, 100k-row index benchmark, dan browser audit flow lulus; hosted/manual review tetap belum tersedia.
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0020.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

`GET /audit` (admin only) mendukung filter: rentang waktu (`from`, `to`), `actorUserId`, `action` (satu atau beberapa, dari taksonomi), `connectionId`, `targetRef` (pencocokan awalan), `result`; semua filter opsional dan bisa digabung.

### AC-2

hasil terurut `occurred_at` menurun dengan pagination server side (page, pageSize maksimum 100); total boleh berupa hitungan tepat karena query lokal.

### AC-3

response memuat baris audit apa adanya dari kolom yang aman (semua kolom `audit_logs`; `details` sudah tersensor sejak tulis); tidak ada proses un redact.

### AC-4

role user menjawab 403; guard web menyembunyikan menu audit dari non admin (dua lapis, server tetap penegak).

### AC-5

halaman audit: data grid foundation dengan kolom waktu, actor (username di join kan), action, target, koneksi, result, correlation ID; panel filter dengan pilihan action dari taksonomi yang diekspos endpoint kecil `GET /audit/actions`; baris bisa diperluas untuk melihat `details` JSON.

### AC-6

query berfilter memakai index yang ada (`occurred_at`, `actor_user_id`); kombinasi filter umum tetap responsif pada 100 ribu baris (dibuktikan test performa ringan dengan data sintetis).

### AC-7

e2e: aksi destructive yang dilakukan di test (misal hapus koneksi) muncul di halaman audit dengan filter action yang tepat.

## Matriks cakupan

| AC            | Unit | Integration   | Contract | E2E            | Security       | Performance     | Visual | Smoke | Manual atau external |
| ------------- | ---- | ------------- | -------- | -------------- | -------------- | --------------- | ------ | ----- | -------------------- |
| [AC-1](#ac-1) | n/a  | `IT-0020-AC1` | n/a      | n/a            | `SEC-0020-AC1` | n/a             | n/a    | n/a   | n/a                  |
| [AC-2](#ac-2) | n/a  | `IT-0020-AC2` | n/a      | n/a            | n/a            | n/a             | n/a    | n/a   | n/a                  |
| [AC-3](#ac-3) | n/a  | `IT-0020-AC3` | n/a      | n/a            | `SEC-0020-AC3` | n/a             | n/a    | n/a   | n/a                  |
| [AC-4](#ac-4) | n/a  | n/a           | n/a      | `E2E-0020-AC4` | `SEC-0020-AC4` | n/a             | n/a    | n/a   | n/a                  |
| [AC-5](#ac-5) | n/a  | n/a           | n/a      | `E2E-0020-AC5` | n/a            | n/a             | n/a    | n/a   | n/a                  |
| [AC-6](#ac-6) | n/a  | n/a           | n/a      | n/a            | n/a            | `PERF-0020-AC6` | n/a    | n/a   | n/a                  |
| [AC-7](#ac-7) | n/a  | n/a           | n/a      | `E2E-0020-AC7` | n/a            | n/a             | n/a    | n/a   | n/a                  |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

Tidak ada unit yang diwajibkan oleh acceptance criteria saat ini.

## Integration test

| ID            | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                         | Expected result                                      |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `IT-0020-AC1` | [AC-1](#ac-1) | GET /audit (admin only) mendukung filter: rentang waktu (from, to), actorUserId, action (satu atau beberapa, dari taksonomi), connectionId, targetRef (pencoc... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `IT-0020-AC2` | [AC-2](#ac-2) | hasil terurut occurred_at menurun dengan pagination server side (page, pageSize maksimum 100); total boleh berupa hitungan tepat karena query lokal.             | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `IT-0020-AC3` | [AC-3](#ac-3) | response memuat baris audit apa adanya dari kolom yang aman (semua kolom audit_logs; details sudah tersensor sejak tulis); tidak ada proses un redact.           | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |

## Test tambahan

### Contract test

Tidak ada contract yang diwajibkan oleh acceptance criteria saat ini.

### E2E

| ID             | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                       | Expected result                                      |
| -------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------- |
| `E2E-0020-AC4` | [AC-4](#ac-4) | role user menjawab 403; guard web menyembunyikan menu audit dari non admin (dua lapis, server tetap penegak).                                                    | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `E2E-0020-AC5` | [AC-5](#ac-5) | halaman audit: data grid foundation dengan kolom waktu, actor (username di join kan), action, target, koneksi, result, correlation ID; panel filter dengan pi... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `E2E-0020-AC7` | [AC-7](#ac-7) | e2e: aksi destructive yang dilakukan di test (misal hapus koneksi) muncul di halaman audit dengan filter action yang tepat.                                      | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

### Security

| ID             | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                               | Expected result                                      |
| -------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `SEC-0020-AC1` | [AC-1](#ac-1) | GET /audit (admin only) mendukung filter: rentang waktu (from, to), actorUserId, action (satu atau beberapa, dari taksonomi), connectionId, targetRef (pencoc... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `SEC-0020-AC3` | [AC-3](#ac-3) | response memuat baris audit apa adanya dari kolom yang aman (semua kolom audit_logs; details sudah tersensor sejak tulis); tidak ada proses un redact.           | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `SEC-0020-AC4` | [AC-4](#ac-4) | role user menjawab 403; guard web menyembunyikan menu audit dari non admin (dua lapis, server tetap penegak).                                                    | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |

### Performance

| ID              | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                               | Expected result                                      |
| --------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `PERF-0020-AC6` | [AC-6](#ac-6) | query berfilter memakai index yang ada (occurred_at, actor_user_id); kombinasi filter umum tetap responsif pada 100 ribu baris (dibuktikan test performa ring... | Tetapkan dataset, baseline, ambang, pengulangan, dan toleransi sebelum eksekusi. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

### Visual dan accessibility

Tidak ada visual dan accessibility yang diwajibkan oleh acceptance criteria saat ini.

### Smoke dan operational acceptance

Tidak ada smoke dan operational yang diwajibkan oleh acceptance criteria saat ini.

### Manual atau external proof

Tidak ada manual atau external yang diwajibkan oleh acceptance criteria saat ini.

## Critical test scenarios

- Happy path: filter kombinasi waktu plus action mengembalikan baris yang tepat dan terurut, verifikasi **AC-1**, **AC-2**.
- Auth: role user → 403, verifikasi **AC-4**.
- Kinerja: 100 ribu baris sintetis, filter umum di bawah ambang wajar, verifikasi **AC-6**.

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
