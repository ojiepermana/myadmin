# 0047. Export

**Date**: 2026-08-28
**Status**: In Progress
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini membangun mesin export: mengekspor database, table, hasil query, atau baris terpilih ke SQL, CSV, atau JSON sebagai job dengan progress dan cancel, ditulis streaming ke file di folder temp lalu diunduh lewat endpoint terautentikasi. Streaming untuk data besar adalah keputusan V1 yang sudah dikunci (menutup kontradiksi feature.md).

## Context

FR-IEX-02: export SQL/CSV/JSON dari database, table, query result, atau selected data, dibuat streaming untuk data besar. FR-JOB-01 memayungi progress dan cancel; mesin job (spec 0028) dan realtime (0029) siap. Panel UI jobs pertama juga lahir di sini karena export adalah pemakai job pertama. Dialek dan format per engine milik provider `import-export/`.

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0028, 0029, 0037. Mengaktifkan jalur "export semua baris" pada tombol result grid (spec 0034 AC-5).

## Requirements

**User stories**:

- Sebagai pengguna, saya ingin mengekspor table besar ke CSV tanpa membekukan aplikasi, melihat progress nya, dan membatalkannya.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): `POST /export` membuat job export dengan sumber: table (ref plus filter/sort/kolom aktif opsional dari data browser), query (SQL plus konteks), selection (identitas baris terpilih), atau database (per table, PostgreSQL per schema juga); format: `sql` (INSERT statements plus opsi struktur), `csv` (delimiter, header, quoting, encoding UTF-8), `json` (array objek, streaming); response berisi jobId seketika.
- [**AC-2**](test.md#ac-2): opsi SQL export: structure only, data only, atau keduanya (sejalan opsi backup feature.md); struktur dihasilkan dari DDL provider (CREATE TABLE dari metadata); INSERT dalam batch dengan quoting nilai milik provider.
- [**AC-3**](test.md#ac-3): eksekusi streaming: provider membaca baris lewat cursor/stream (tanpa memuat seluruh hasil ke memori), penulis format menulis bertahap ke file di `<data-dir>/temp/exports/<jobId>.<ext>`; memori proses tetap datar pada table jutaan baris (dibuktikan test dengan pemantauan memori kasar).
- [**AC-4**](test.md#ac-4): progress dilaporkan (baris ditulis; total bila diketahui dari perkiraan) lewat job events; cancel menghormati AbortSignal, menghentikan cursor, dan menghapus file parsial.
- [**AC-5**](test.md#ac-5): `GET /export/:jobId/download` mengunduh hasil (pemilik saja) dengan nama file yang bermakna (objek, waktu); file kadaluarsa dan dihapus setelah 1 jam atau saat diunduh plus grace (kebijakan: hapus 10 menit setelah unduhan pertama selesai, maksimum 1 jam); doctor tidak diperlukan, pembersih temp berkala menjaga folder.
- [**AC-6**](test.md#ac-6): UI: dialog export dari context menu table, tombol export data browser (membawa filter aktif), tombol export result grid (jalur penuh kini aktif), dan halaman import-export berisi panel jobs (daftar job milik user dengan progress, cancel, unduh); panel jobs generik ini dipakai juga backup/restore.
- [**AC-7**](test.md#ac-7): export selesai tercatat audit (`export.completed`: sumber, format, jumlah baris; tanpa isi data); export tidak memuat credential dalam bentuk apa pun.
- [**AC-8**](test.md#ac-8): e2e kedua engine: export CSV table 100 ribu baris dengan progress dan unduhan benar (jumlah baris cocok), cancel di tengah menghapus file parsial, export SQL structure plus data bisa diimpor balik (roundtrip dengan spec 0048 kelak).

## Options considered

### Option 1: File di temp lalu unduh (dipilih)

**Pros**:

- Job bisa berjalan tanpa koneksi browser hidup; unduhan bisa diulang; cancel dan pembersihan jelas.

**Cons**:

- Butuh ruang disk sementara; pembersih berkala menanganinya.

### Option 2: Stream langsung ke response HTTP

**Pros**:

- Tanpa file sementara.

**Cons**:

- Menutup tab membunuh export; tidak ada progress via WS; cancel dan resume unduhan rumit; bertabrakan dengan model job yang diminta FR-JOB-01.

## Decision

**Chosen option**: Option 1: job menulis streaming ke temp, unduhan terautentikasi terpisah, kebijakan kadaluarsa file.

Penulis format (csv, json, sql) sebagai modul bersama di server; pembacaan cursor dan quoting nilai per engine di provider `import-export/` (basis: FR-IEX-02; FR-JOB-01; keputusan streaming V1 sesi desain 2026-08-28).

## Rationale

Model job plus file memenuhi ketiga janji sekaligus (tidak memblokir, progress, cancel) dan membuat streaming alami: cursor ke file adalah aliran datar memori. Pemisahan penulis format (bersama) dari pembaca dan quoting (per engine) meletakkan tiap pengetahuan di tempatnya: CSV tidak peduli engine, tapi literal SQL sangat peduli.

## Feature design

**Data model sketch**: tidak ada tabel internal; file temp per job dengan manifest kecil (sumber, format, baris) di memori job.

**API surface**:

| Endpoint                | Method | Key inputs              | Key outputs | Auth                | Key errors             |
| ----------------------- | ------ | ----------------------- | ----------- | ------------------- | ---------------------- |
| /export                 | POST   | source, format, options | jobId       | pemilik, tersambung | 422, 409 NOT_CONNECTED |
| /export/:jobId/download | GET    | tidak ada               | file stream | pemilik job         | 404, 410 kadaluarsa    |

**Value sourcing**:

| Action            | Value produced / displayed | Source                                                           |
| ----------------- | -------------------------- | ---------------------------------------------------------------- |
| baris sumber      | stream                     | cursor provider (table/query/selection dengan filter aktif)      |
| total progress    | perkiraan                  | estimate metadata bila sumber table; tidak diketahui untuk query |
| nama file unduhan | string                     | pola `<objek>-<timestamp>.<ext>` di server                       |
| quoting nilai SQL | literal                    | provider engine sumber                                           |

**Key invariants**:

- Tidak ada jalur export yang membaca seluruh hasil ke memori (AC-3).
- File export hanya bisa diunduh pemilik job nya; folder temp dibersihkan berkala.
- Export membawa data pengguna, bukan rahasia aplikasi; tetap tidak pernah menyertakan credential.

**Security model**: unduhan terautentikasi dan dimiliki; path file dibangun server dari jobId (tanpa input path dari klien).

**Configuration required**: tidak ada baru (folder temp dari spec 0006).

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. [x] Bangun penulis format csv/json/sql (streaming, opsi) sebagai modul server plus unit test, memenuhi **AC-1**, **AC-2**.
2. [x] Implementasikan pembaca cursor dan quoting nilai di provider `import-export/` kedua engine plus test, memenuhi **AC-2**, **AC-3**.
3. [x] Executor job export (baca → tulis → progress → cancel → pembersihan), endpoint export dan download, kebijakan kadaluarsa plus pembersih temp berkala, memenuhi **AC-1**, **AC-3**, **AC-4**, **AC-5**.
4. [x] Kontrak, regenerasi, contract test; audit selesai, memenuhi **AC-7**.
5. [x] UI: dialog export, integrasi tombol data browser dan result grid, panel jobs generik di halaman import-export, memenuhi **AC-6**.
6. [x] E2e dan test skala, memenuhi **AC-8**.

## Consequences

**Positive**:

- Export kelas produksi dengan UX job yang menjadi pola untuk import, backup, restore; panel jobs lahir.

**Negative / tradeoffs**:

- Ruang disk temp dipakai; kebijakan kadaluarsa dan pembersih menahannya.

**Neutral**:

- Scheduled export adalah V2 sesuai matriks scope.

## Follow-up

- [x] Spec 0048 memakai roundtrip export SQL sebagai fixture import.

## References

**Project sources**:

- v1-feature-specification.md FR-IEX-02, FR-JOB-01, NFR-01; keputusan streaming V1 sesi desain 2026-08-28; feature.md opsi structure/data; spec 0028, 0029, 0037.

**Practices & standards**:

- Streaming cursor ke file; job dengan progress dan cancel; unduhan terautentikasi berkadaluarsa.

**Links**: tidak ada yang diverifikasi untuk spec ini.
