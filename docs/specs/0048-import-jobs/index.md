# 0048. Import

**Date**: 2026-08-28
**Status**: In Progress
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini membangun import SQL dan CSV sebagai job: unggah file secara streaming dengan validasi tipe dan ukuran, import SQL dengan eksekusi statement bertahap dan laporan error yang menunjuk posisi, import CSV ke table dengan pemetaan kolom dan opsi kosongkan dulu yang berkonfirmasi destructive, semuanya dengan progress, cancel, dan audit.

## Context

FR-IEX-01: import SQL/CSV dengan validasi tipe, ukuran, dan target; progress, error ringkas, cancellation, hasil akhir; destructive overwrite memerlukan confirmation. Mesin job dan pola file temp sudah ada (spec 0047). Batas ukuran unggah dari config (`limits.uploadMaxBytes`, spec 0012). Pemecah statement SQL per engine sudah ada dari query editor (spec 0033) dan dipakai ulang dalam mode streaming.

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0047.

## Requirements

**User stories**:

- Sebagai pengguna, saya ingin mengunggah dump SQL atau file CSV dan mengalirkannya ke database dengan progress, tanpa takut setengah jalan tanpa kabar.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): `POST /import/upload` menerima unggahan multipart streaming ke `<data-dir>/temp/imports/`, memvalidasi ukuran maksimum (`limits.uploadMaxBytes`) saat mengalir (bukan setelah selesai) dan ekstensi/tipe (sql, csv); hasilnya uploadId dengan masa berlaku 1 jam.
- [**AC-2**](test.md#ac-2): import SQL: `POST /import/sql` { connectionId, database, uploadId, mode transaksi } membuat job yang membaca file streaming, memecah statement (pemecah provider, mode streaming), dan mengeksekusi berurutan pada sesi khusus job; progress berbasis byte dan hitungan statement; kegagalan menghentikan job dengan laporan: statement ke berapa, posisi, pesan `DbError`; mode transaksi: `single` (semua dalam satu transaksi, rollback saat gagal; pilihan default untuk PostgreSQL) atau `per-statement` (lanjut dicatat? tidak: berhenti pada error pertama, hasil parsial dinyatakan jelas) sesuai pilihan pengguna dan dukungan engine.
- [**AC-3**](test.md#ac-3): import CSV: `POST /import/csv` { connectionId, ref table target, uploadId, options } dengan opsi: delimiter, header ada/tidak, pemetaan kolom CSV ke kolom table (UI menyarankan dari header dan tipe), nilai NULL literal, batch size; eksekusi INSERT batch berparameter lewat provider; baris gagal dicatat (nomor baris, alasan) sampai ambang (100) lalu job gagal dengan laporan; progress berbasis byte/baris.
- [**AC-4**](test.md#ac-4): opsi destructive "kosongkan table sebelum import" (truncate dulu) memerlukan konfirmasi eksplisit menyebut table dan konsekuensi, diverifikasi server (flag plus confirmName), dan menjadikan job diaudit sebagai import destructive (FR-IEX-01, FR-SAFE-01).
- [**AC-5**](test.md#ac-5): cancel menghentikan eksekusi pada batas statement/batch berikutnya; mode `single` di rollback; hasil parsial mode lain dilaporkan jujur (berapa statement/baris masuk).
- [**AC-6**](test.md#ac-6): hasil akhir job memuat ringkasan: statement/baris sukses, gagal, durasi; import selesai atau gagal diaudit (`import.completed` / `import.failed`, plus penanda destructive bila truncate dipakai) tanpa isi data.
- [**AC-7**](test.md#ac-7): UI: alur import di halaman import-export: pilih file (drag and drop), pilih target, opsi per format, pemetaan kolom CSV dengan pratinjau 20 baris pertama, konfirmasi destructive bila dipilih, lalu panel job; file dan pratinjau tidak pernah mengirim isi penuh ke klien (pratinjau dipotong server).
- [**AC-8**](test.md#ac-8): e2e kedua engine: roundtrip export SQL (spec 0047) diimpor balik utuh; CSV dengan pemetaan dan baris gagal melaporkan nomor baris; truncate dulu meminta konfirmasi dan diaudit; unggah melebihi batas ditolak saat mengalir.

## Options considered

### Option 1: Unggah dulu sebagai file, lalu job memproses (dipilih)

**Pros**:

- Unggahan dan eksekusi terpisah: koneksi browser boleh putus saat job jalan; validasi dan pratinjau dari file yang sama; konsisten pola spec 0047.

**Cons**:

- Disk temp dipakai dua kali lipat sesaat; pembersih menangani.

### Option 2: Stream unggahan langsung ke eksekusi

**Pros**:

- Tanpa file perantara.

**Cons**:

- Gagal jaringan browser membatalkan import setengah jalan; tanpa pratinjau; cancel dan retry lebih rapuh.

## Decision

**Chosen option**: Option 1: unggah streaming ke temp dengan uploadId, job memproses file, pemecah statement streaming milik provider, CSV lewat INSERT batch berparameter.

## Rationale

Import adalah operasi tulis terbesar yang bisa dilakukan pengguna; pemisahan unggah dari eksekusi memberi titik aman (validasi, pratinjau, konfirmasi destructive) sebelum satu byte pun menyentuh database. Kebijakan berhenti pada error pertama dipilih karena melanjutkan diam diam menghasilkan keadaan campuran yang tidak bisa dinalar; laporan posisi persis membuat perbaikan cepat. INSERT batch berparameter dipilih daripada jalur bulk load native (COPY, LOAD DATA) untuk V1 karena berlaku seragam dan aman; jalur native adalah optimasi V2 yang bisa ditambah per provider.

## Feature design

**Data model sketch**: tidak ada tabel internal; file temp per upload dengan metadata (nama asli, ukuran, tipe) di memori/manifest.

**API surface**:

| Endpoint        | Method | Key inputs                                                         | Key outputs                          | Auth                | Key errors                   |
| --------------- | ------ | ------------------------------------------------------------------ | ------------------------------------ | ------------------- | ---------------------------- |
| /import/upload  | POST   | multipart file                                                     | uploadId, meta                       | sesi                | 413 melebihi batas, 422 tipe |
| /import/preview | GET    | uploadId, format, options                                          | 20 baris pertama / statement pertama | pemilik upload      | 404                          |
| /import/sql     | POST   | connectionId, database, uploadId, txMode                           | jobId                                | pemilik, tersambung | 422                          |
| /import/csv     | POST   | connectionId, ref, uploadId, options, truncateFirst?, confirmName? | jobId                                | pemilik             | 409 confirm, 422 mapping     |

**Value sourcing**:

| Action           | Value produced / displayed | Source                                  |
| ---------------- | -------------------------- | --------------------------------------- |
| batas unggah     | byte                       | config `limits.uploadMaxBytes`          |
| saran pemetaan   | pasangan kolom             | header CSV plus describeTable target    |
| posisi error SQL | statement ke N, offset     | pemecah dan `DbError.position` provider |
| ringkasan        | hitungan sukses/gagal      | akumulasi executor job                  |

**Key invariants**:

- Tidak ada isi file yang dieksekusi sebelum job dimulai dengan target dan opsi terkonfirmasi.
- Truncate sebelum import tidak pernah terjadi tanpa confirmName terverifikasi server.
- Semua nilai CSV masuk lewat parameter bind; SQL import dieksekusi sebagai statement pengguna secara sadar (itulah fungsinya) pada credential koneksi itu.

**Security model**: upload dimiliki pengunggah; import berjalan dengan hak credential koneksi; file temp dibersihkan; audit untuk selesai/gagal/destructive.

**Configuration required**: memakai `limits.uploadMaxBytes` (spec 0012).

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. [x] Endpoint unggah streaming dengan batas mengalir, penyimpanan temp, uploadId, pratinjau terpotong server, memenuhi **AC-1**, **AC-7**.
2. [x] Mode streaming pemecah statement di provider plus executor job SQL (mode transaksi, laporan posisi), memenuhi **AC-2**, **AC-5**.
3. [x] Executor job CSV (pemetaan, batch berparameter, ambang baris gagal, truncateFirst dengan konfirmasi), memenuhi **AC-3**, **AC-4**.
4. Kontrak, regenerasi, contract test; audit, memenuhi **AC-6**.
5. UI alur import lengkap dengan pemetaan dan pratinjau, memenuhi **AC-7**.
6. E2e roundtrip dan kegagalan, memenuhi **AC-8**.

## Consequences

**Positive**:

- Jalur masuk data lengkap dan aman; bersama export membentuk pasangan FR-IEX penuh.

**Negative / tradeoffs**:

- INSERT batch lebih lambat dari bulk load native; benar dan seragam dulu, cepat kemudian (V2).

**Neutral**:

- Import lintas engine (dump PostgreSQL ke MySQL) tidak didukung dan dinyatakan (migration lintas engine adalah Future).

## Follow-up

- [ ] V2: jalur bulk load native (COPY, LOAD DATA LOCAL) per provider sebagai optimasi.

## References

**Project sources**:

- v1-feature-specification.md FR-IEX-01, FR-JOB-01, FR-SAFE-01; spec 0012, 0028, 0033 (pemecah), 0047.

**Practices & standards**:

- Validasi saat mengalir; berhenti pada error pertama dengan posisi; konfirmasi destructive terverifikasi server.

**Links**: tidak ada yang diverifikasi untuk spec ini.
