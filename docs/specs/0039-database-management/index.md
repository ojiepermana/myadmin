# 0039. Manajemen database

**Date**: 2026-08-28
**Status**: In Progress
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini membangun pengelolaan database: halaman properti database (ukuran, encoding atau charset, collation, owner bila ada), pembuatan database dengan opsi yang digerbangi capability per engine, dan drop database dengan konfirmasi ketik nama plus audit. Pola konfirmasi destructive ketik nama yang lahir di sini dipakai semua operasi drop berikutnya.

## Context

FR-DB-01 dan FR-DB-02: browse database dengan properti yang provider dukung; create divalidasi provider; drop memerlukan confirmation yang menyebut target spesifik dan audit event. FR-SAFE-01 menuntut confirmation eksplisit menyebut connection dan object. Metadata daftar database sudah ada (spec 0023, 0025); yang ditambah adalah operasi tulis `DatabasePort` dan UI nya.

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0031, 0019.

## Requirements

**User stories**:

- Sebagai pengguna, saya ingin membuat database baru dengan opsi yang benar untuk engine nya, dan menghapus database dengan pengaman yang membuat salah sasaran hampir mustahil.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): halaman properti database (dari context menu explorer): nama, owner (PostgreSQL), encoding/charset, collation, ukuran (dimuat malas), jumlah object ringkas; hanya properti yang provider paparkan (tanpa nilai kosong palsu).
- [**AC-2**](test.md#ac-2): `POST /databases` membuat database: PostgreSQL (nama, owner opsional, encoding, template opsional), MySQL (nama, charset, collation); formulir UI menampilkan opsi per capability/metadata engine (daftar charset/collation diambil dari server target, bukan hardcode); validasi nama oleh provider; sukses memunculkan node baru di explorer.
- [**AC-3**](test.md#ac-3): `DELETE /databases/:name` drop database: konfirmasi UI mewajibkan mengetik ulang nama database persis dan menampilkan label koneksi plus engine; server menolak drop database yang sedang dipakai sesi tab aktif user itu dengan pesan jelas (tutup tab dulu), dan meneruskan error provider bila ada koneksi lain (misal PostgreSQL "database is being accessed").
- [**AC-4**](test.md#ac-4): drop dan create diaudit (`database.created`, `database.dropped`) dengan target dan koneksi, sebelum response sukses (FR-AUD-01); drop memuat konfirmasi eksplisit di jalur API juga (field `confirmName` yang harus sama, pertahanan kedua di server, FR-SAFE-01).
- [**AC-5**](test.md#ac-5): kegagalan (hak kurang, nama dipakai, charset tidak valid) tiba sebagai `DbError` berkategori dengan pesan aman dan ditampilkan di formulir.
- [**AC-6**](test.md#ac-6): e2e kedua engine: create dengan opsi engine yang benar, properti tampil, drop dengan ketik nama, audit tercatat; drop dengan nama konfirmasi salah ditolak server.

## Options considered

### Option 1: Konfirmasi ketik nama plus confirmName di API (dipilih)

**Pros**:

- Pengaman dua lapis (UI dan server) sesuai FR-SAFE-01; konfirmasi generik klik ganda tidak mungkin salah sasaran.

**Cons**:

- Sedikit gesekan pada operasi yang memang harus bergesekan.

### Option 2: Dialog konfirmasi biasa

**Pros**:

- Lebih cepat.

**Cons**:

- FR-SAFE-01 menuntut confirmation menyebut target dan tahan klik tak sengaja; dialog Ya/Tidak tidak memenuhi semangat itu untuk operasi sebesar drop database.

## Decision

**Chosen option**: Option 1: ketik nama di UI, `confirmName` diverifikasi server, audit sebelum sukses.

Komponen `destructive-action-confirmation` (struktur.md database-components) lahir di sini dan menjadi komponen baku semua operasi destructive (basis: FR-SAFE-01; FR-DB-02).

## Rationale

Drop database adalah operasi paling berbahaya di produk ini; pola pengamannya harus lahir pada fitur pertama yang membutuhkannya dan dibakukan sebagai komponen supaya truncate, drop table, restore, dan revoke memakai perilaku yang sama, bukan variasi masing masing. Verifikasi confirmName di server melindungi dari klien yang salah atau dimanipulasi (FR-PROV-04 semangatnya: server tidak percaya UI).

## Feature design

**Data model sketch**: tidak ada tabel internal; operasi `DatabasePort.create/drop/properties` di provider.

**API surface**:

| Endpoint                                    | Method | Key inputs            | Key outputs | Auth                | Key errors                                  |
| ------------------------------------------- | ------ | --------------------- | ----------- | ------------------- | ------------------------------------------- |
| /connections/:id/databases                  | POST   | name, opsi per engine | database    | pemilik, tersambung | 409 nama, 422, DbError                      |
| /connections/:id/databases/:name            | DELETE | confirmName           | kosong      | pemilik             | 409 confirm salah / sedang dipakai, DbError |
| /connections/:id/databases/:name/properties | GET    | tidak ada             | properti    | pemilik             | 404                                         |

**Value sourcing**:

| Action        | Value produced / displayed        | Source                                      |
| ------------- | --------------------------------- | ------------------------------------------- |
| opsi create   | daftar charset/collation/template | query metadata server target lewat provider |
| properti      | ukuran, encoding, owner           | metadata provider (malas untuk ukuran)      |
| pengaman drop | confirmName                       | input pengguna, dibandingkan server         |
| blokir drop   | database dipakai tab              | registry sesi tab user (spec 0033)          |

**Key invariants**:

- Tidak ada operasi drop tanpa confirmName yang cocok di server.
- Audit tertulis sebelum response sukses (jalur `withAudit`).
- Formulir hanya menampilkan opsi yang engine dukung (capability/metadata, bukan nama engine di logic UI).

**Security model**: hak create/drop mengikuti credential koneksi; kegagalan hak tampil jelas (FR-SEC semangat); pemilik koneksi saja.

**Configuration required**: tidak ada.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. [x] Implementasikan `DatabasePort` create/drop/properties di kedua provider plus test integrasi, memenuhi **AC-1**, **AC-2**, **AC-3**.
2. [x] Tambah operasi ke kontrak (termasuk confirmName), regenerasi, contract test, memenuhi **AC-3**, **AC-4**.
3. [x] Bangun komponen `destructive-action-confirmation` (ketik nama, ringkasan target, koneksi, engine) di database-components, memenuhi **AC-3**.
4. [x] UI: halaman properti, form create data driven, aksi drop dari explorer, plus registrasi menu (spec 0031), memenuhi **AC-1**, **AC-2**, **AC-5**.
5. [x] Audit lewat `withAudit`, e2e dua engine, memenuhi **AC-4**, **AC-6**.

## Consequences

**Positive**:

- Pola safety destructive baku lahir dan teruji; pengelolaan database dasar lengkap.

**Negative / tradeoffs**:

- Ketik nama menambah friksi; disengaja.

**Neutral**:

- Rename database tidak ada di V1 (tidak ada di FR; PostgreSQL butuh disconnect semua, MySQL tidak punya rename database modern).

## Follow-up

- [x] Spec 0040, 0043, 0044, 0046, 0050 memakai komponen konfirmasi destructive ini.

## References

**Project sources**:

- v1-feature-specification.md FR-DB-01, FR-DB-02, FR-SAFE-01, FR-AUD-01; spec 0019, 0023, 0025, 0031.

**Practices & standards**:

- Konfirmasi ketik nama untuk operasi tak terpulihkan; verifikasi konfirmasi di server; UI data driven dari metadata engine.

**Links**: tidak ada yang diverifikasi untuk spec ini.
