# Test dan acceptance criteria 0035. Query cancel dan EXPLAIN

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Belum dijalankan
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0035.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

`POST /query/executions/:id/cancel` (pemilik saja) memicu cancel provider pada sesi tab eksekusi itu; state menjadi `cancelling` lalu `cancelled` saat provider mengonfirmasi (statement berakhir dengan kategori `cancelled`); statement yang keburu selesai sebelum cancel tiba tetap `completed` dan dilaporkan apa adanya (FR-QRY-04).

### AC-2

cancel menarget tepat: hanya statement aktif eksekusi itu; eksekusi dan tab lain tidak terpengaruh; hasil statement yang sudah selesai pada eksekusi yang sama tetap utuh.

### AC-3

tombol cancel di UI hanya aktif saat ada eksekusi berjalan dan `capabilities.cancelQuery` true (bagian 10); state akhir tampil eksplisit: cancelled (dengan statement ke berapa), failed, atau completed.

### AC-4

race tertangani: cancel pada eksekusi yang sudah selesai menjawab state final tanpa error; dua cancel beruntun idempotent.

### AC-5

EXPLAIN: aksi "Explain" menjalankan rencana untuk statement terpilih (atau statement di kursor) lewat `POST /query/explain` { connectionId, database, schema?, sql }: PostgreSQL memakai `EXPLAIN (FORMAT TEXT)`, MySQL memakai `EXPLAIN FORMAT=TRADITIONAL` (detail per engine hidup di provider); hasil tampil sebagai panel teks monospace di area hasil, tanpa klaim visual plan (FR-QRY-07).

### AC-6

EXPLAIN digerbangi `capabilities.explain`; statement non EXPLAINable (DDL tertentu) mengembalikan error ternormalisasi yang dijelaskan UI; EXPLAIN tidak mengeksekusi datanya (tanpa ANALYZE di V1).

### AC-7

cancel dan explain melalui sesi tab yang sama (konsisten dengan konteks transaksi); explain tidak merusak transaksi aktif.

### AC-8

integration test kedua engine: query tidur panjang dibatalkan cepat dan status akhir benar; explain menghasilkan teks rencana; e2e tombol cancel dan explain.

## Matriks cakupan

| AC | Unit | Integration | Contract | E2E | Security | Performance | Visual | Smoke | Manual atau external |
|---|---|---|---|---|---|---|---|---|---|
| [AC-1](#ac-1) | n/a | `IT-0035-AC1` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-2](#ac-2) | n/a | `IT-0035-AC2` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-3](#ac-3) | n/a | n/a | n/a | `E2E-0035-AC3` | n/a | n/a | n/a | n/a | n/a |
| [AC-4](#ac-4) | `UT-0035-AC4` | `IT-0035-AC4` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-5](#ac-5) | n/a | `IT-0035-AC5` | n/a | `E2E-0035-AC5` | n/a | n/a | n/a | n/a | n/a |
| [AC-6](#ac-6) | n/a | `IT-0035-AC6` | n/a | `E2E-0035-AC6` | n/a | n/a | n/a | n/a | n/a |
| [AC-7](#ac-7) | n/a | `IT-0035-AC7` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-8](#ac-8) | n/a | `IT-0035-AC8` | n/a | `E2E-0035-AC8` | n/a | n/a | n/a | n/a | n/a |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `UT-0035-AC4` | [AC-4](#ac-4) | race tertangani: cancel pada eksekusi yang sudah selesai menjawab state final tanpa error; dua cancel beruntun idempotent. | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |

## Integration test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `IT-0035-AC1` | [AC-1](#ac-1) | POST /query/executions/:id/cancel (pemilik saja) memicu cancel provider pada sesi tab eksekusi itu; state menjadi cancelling lalu cancelled saat provider men... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `IT-0035-AC2` | [AC-2](#ac-2) | cancel menarget tepat: hanya statement aktif eksekusi itu; eksekusi dan tab lain tidak terpengaruh; hasil statement yang sudah selesai pada eksekusi yang sam... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `IT-0035-AC4` | [AC-4](#ac-4) | race tertangani: cancel pada eksekusi yang sudah selesai menjawab state final tanpa error; dua cancel beruntun idempotent. | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `IT-0035-AC5` | [AC-5](#ac-5) | EXPLAIN: aksi "Explain" menjalankan rencana untuk statement terpilih (atau statement di kursor) lewat POST /query/explain { connectionId, database, schema?,... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `IT-0035-AC6` | [AC-6](#ac-6) | EXPLAIN digerbangi capabilities.explain; statement non EXPLAINable (DDL tertentu) mengembalikan error ternormalisasi yang dijelaskan UI; EXPLAIN tidak mengek... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `IT-0035-AC7` | [AC-7](#ac-7) | cancel dan explain melalui sesi tab yang sama (konsisten dengan konteks transaksi); explain tidak merusak transaksi aktif. | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |
| `IT-0035-AC8` | [AC-8](#ac-8) | integration test kedua engine: query tidur panjang dibatalkan cepat dan status akhir benar; explain menghasilkan teks rencana; e2e tombol cancel dan explain. | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

## Test tambahan

### Contract test

Tidak ada contract yang diwajibkan oleh acceptance criteria saat ini.

### E2E

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `E2E-0035-AC3` | [AC-3](#ac-3) | tombol cancel di UI hanya aktif saat ada eksekusi berjalan dan capabilities.cancelQuery true (bagian 10); state akhir tampil eksplisit: cancelled (dengan sta... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `E2E-0035-AC5` | [AC-5](#ac-5) | EXPLAIN: aksi "Explain" menjalankan rencana untuk statement terpilih (atau statement di kursor) lewat POST /query/explain { connectionId, database, schema?,... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `E2E-0035-AC6` | [AC-6](#ac-6) | EXPLAIN digerbangi capabilities.explain; statement non EXPLAINable (DDL tertentu) mengembalikan error ternormalisasi yang dijelaskan UI; EXPLAIN tidak mengek... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `E2E-0035-AC8` | [AC-8](#ac-8) | integration test kedua engine: query tidur panjang dibatalkan cepat dan status akhir benar; explain menghasilkan teks rencana; e2e tombol cancel dan explain. | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

### Security

Tidak ada security yang diwajibkan oleh acceptance criteria saat ini.

### Performance

Tidak ada performance yang diwajibkan oleh acceptance criteria saat ini.

### Visual dan accessibility

Tidak ada visual dan accessibility yang diwajibkan oleh acceptance criteria saat ini.

### Smoke dan operational acceptance

Tidak ada smoke dan operational yang diwajibkan oleh acceptance criteria saat ini.

### Manual atau external proof

Tidak ada manual atau external yang diwajibkan oleh acceptance criteria saat ini.

## Critical test scenarios

- Cancel cepat: `pg_sleep(60)` / `SLEEP(60)` dibatalkan di bawah 2 detik, state cancelled, sesi tetap hidup (SELECT ringan sesudahnya jalan), verifikasi **AC-1**, **AC-2**, **AC-7**.
- Race: cancel dikirim tepat saat statement selesai → state completed dilaporkan, tanpa error, verifikasi **AC-4**.
- Explain: rencana teks tampil; pada engine dengan capability false (disimulasikan) tombol nonaktif dengan alasan, verifikasi **AC-5**, **AC-6**.

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
