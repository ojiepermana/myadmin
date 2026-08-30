# 0043. Operasi destructive table

**Date**: 2026-08-28
**Status**: In Progress
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini membangun tiga operasi table yang berbahaya sebagai alur GUI tersendiri: rename table, truncate table, dan drop table, masing masing dengan konfirmasi yang menyebut target dan dampaknya, verifikasi konfirmasi di server, dan audit event. Melengkapi FR-TBL-03 dengan memakai komponen dan pola yang sudah baku.

## Context

FR-TBL-03: drop, rename, truncate memerlukan confirmation eksplisit yang menampilkan target dan dampak, plus audit event. Pola ketik nama plus confirmName server sudah baku (spec 0039); operasi ini kecil secara teknis tapi bernilai tinggi secara keselamatan, sehingga dipisah sebagai spec sendiri agar tiap alur dan dampaknya dirancang penuh, bukan menjadi menu tempelan.

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0041 (designer sebagai rumah aksi; kompilasi DDL provider).

## Requirements

**User stories**:

- Sebagai pengguna, saya ingin menghapus, mengosongkan, atau mengganti nama table dengan pengaman yang membuat saya sadar persis apa yang akan terjadi.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): rename table: dialog menampilkan nama kini dan input nama baru, peringatan dampak (view, FK, dan query tersimpan yang mereferensikan nama lama bisa rusak; FK yang mengikuti rename ditangani engine masing masing dan dinyatakan provider); `POST /tables/:ref/rename` dengan validasi nama; setelah sukses, node explorer, tab data, dan tab designer yang menunjuk table itu diperbarui atau diberi tanda basi.
- [**AC-2**](test.md#ac-2): truncate table: dialog menampilkan perkiraan jumlah baris yang akan hilang (dari metadata, berlabel perkiraan), opsi engine yang relevan (PostgreSQL: RESTART IDENTITY dan CASCADE dinyatakan; V1 mengunci CASCADE nonaktif dan restart identity sebagai checkbox), ketik nama table untuk konfirmasi; `POST /tables/:ref/truncate` dengan confirmName.
- [**AC-3**](test.md#ac-3): drop table: dialog menampilkan dependensi yang diketahui (view yang mereferensikan, FK masuk dari table lain, dari metadata provider), ketik nama, tanpa opsi cascade di GUI (pola spec 0040); `DELETE /tables/:ref` dengan confirmName; drop table yang direferensikan FK ditolak engine dan pesan provider diteruskan jelas.
- [**AC-4**](test.md#ac-4): ketiganya diaudit (`table.renamed`, `table.truncated` dengan perkiraan baris, `table.dropped`) sebelum response sukses; ketiganya memerlukan confirmName yang diverifikasi server (rename memakai nama lama sebagai confirm).
- [**AC-5**](test.md#ac-5): ketiga aksi terdaftar di context menu explorer dan menu tab designer; nonaktif dengan alasan bila koneksi tidak tersambung.
- [**AC-6**](test.md#ac-6): e2e kedua engine: rename memperbarui explorer; truncate mengosongkan dengan identitas di restart sesuai pilihan; drop menghapus dan menutup tab terkait dengan pemberitahuan; konfirmasi salah selalu ditolak server; audit tercatat.

## Options considered

### Option 1: Alur khusus per operasi dengan informasi dampak (dipilih)

**Pros**:

- Tiap dialog memuat informasi dampak spesifik (baris, dependensi) sehingga konfirmasi bermakna, bukan ritual.

**Cons**:

- Query dampak tambahan sebelum dialog; murah (metadata) dan sepadan.

### Option 2: Konfirmasi generik satu komponen tanpa dampak

**Pros**:

- Paling cepat dibangun.

**Cons**:

- FR-TBL-03 menuntut dampak ditampilkan; konfirmasi tanpa informasi melatih klik otomatis.

## Decision

**Chosen option**: Option 1: tiga alur di atas komponen konfirmasi baku dengan bagian dampak yang diisi data metadata; confirmName di server.

## Rationale

Nilai keselamatan datang dari informasi pada momen keputusan: jumlah baris yang hilang, siapa yang mereferensikan. Metadata untuk itu sudah tersedia murah dari provider, jadi tidak ada alasan menampilkan dialog kosong. Menolak cascade di GUI konsisten dengan keputusan spec 0040: blast radius GUI harus bisa diprediksi.

## Feature design

**Data model sketch**: tidak ada tabel internal.

**API surface**:

| Endpoint         | Method | Key inputs                                       | Key outputs | Auth                | Key errors                             |
| ---------------- | ------ | ------------------------------------------------ | ----------- | ------------------- | -------------------------------------- |
| /tables/rename   | POST   | connectionId, ref, newName, confirmName          | ref baru    | pemilik, tersambung | 409 confirm, 409 nama dipakai, DbError |
| /tables/truncate | POST   | connectionId, ref, restartIdentity?, confirmName | kosong      | pemilik             | 409 confirm, DbError                   |
| /tables/drop     | DELETE | connectionId, ref, confirmName                   | kosong      | pemilik             | 409 confirm, DbError (FK)              |

**Value sourcing**:

| Action                | Value produced / displayed | Source                                         |
| --------------------- | -------------------------- | ---------------------------------------------- |
| dampak truncate       | perkiraan baris            | describeTable (reltuples / information_schema) |
| dampak drop           | view dan FK perujuk        | metadata dependensi provider                   |
| opsi restart identity | ketersediaan               | capability/engine lewat provider (data driven) |
| konfirmasi            | confirmName                | input pengguna, diverifikasi server            |

**Key invariants**:

- Tidak ada operasi tanpa confirmName cocok di server; audit sebelum sukses; tanpa cascade di GUI.
- Tab dan node yang menunjuk object yang hilang atau berganti nama tidak dibiarkan diam diam basi (ditandai atau ditutup dengan pemberitahuan).

**Security model**: hak mengikuti credential koneksi; pemilik koneksi saja; ketiganya destructive dan diaudit (FR-SAFE-01, 02).

**Configuration required**: tidak ada.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. [x] Implementasikan rename, truncate (dengan opsi), drop di provider `table/` kedua engine plus query dampak dependensi, test integrasi, memenuhi **AC-1**, **AC-2**, **AC-3**.
2. [x] Tambah tiga operasi ke kontrak dengan confirmName, regenerasi, contract test, memenuhi **AC-4**.
3. [x] Endpoint server dengan verifikasi confirm dan audit `withAudit`, memenuhi **AC-4**.
4. [x] UI: tiga dialog di atas komponen konfirmasi baku dengan bagian dampak, registrasi menu, penanganan tab basi, memenuhi **AC-1**, **AC-2**, **AC-3**, **AC-5**.
5. [x] E2e dua engine, memenuhi **AC-6**.

## Consequences

**Positive**:

- Tiga operasi paling sering menyebabkan insiden kini berpagar informasi dan audit; FR-TBL-03 selesai.

**Negative / tradeoffs**:

- Query dampak menambah sedikit latensi sebelum dialog; sepadan.

**Neutral**:

- Duplicate/copy table adalah V2 (feature.md).

## Follow-up

- [ ] Tidak ada.

## References

**Project sources**:

- v1-feature-specification.md FR-TBL-03, FR-SAFE-01, FR-SAFE-02; feature.md; spec 0039 (pola), 0041.

**Practices & standards**:

- Konfirmasi berinformasi dampak; verifikasi server; tanpa cascade di GUI.

**Links**: tidak ada yang diverifikasi untuk spec ini.
