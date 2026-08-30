# 0036. Query history dan saved queries

**Date**: 2026-08-28
**Status**: In Progress
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini membangun dua fitur pendamping editor: riwayat query per user (otomatis terisi dari setiap eksekusi, bisa dicari, dibuka ulang, dan dihapus) dan saved queries (query bernama milik user dengan CRUD penuh). Keduanya privat per user dan tampil sebagai panel fitur sendiri plus integrasi cepat di editor.

## Context

FR-QRY-06: riwayat tersimpan terpisah per user; user dapat menyimpan, membuka, menamai, dan menghapus query miliknya. Data dan repository sudah ada (spec 0008, 0009: `query_history` dengan retensi, `saved_queries` dengan nama unik per user); pencatatan otomatis sudah berjalan (spec 0033 AC-7). Spec ini melengkapi jalur baca dan kelola nya.

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0033.

## Requirements

**User stories**:

- Sebagai pengguna, saya ingin menemukan kembali query yang pernah saya jalankan dan menyimpannya dengan nama bila sering dipakai.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): `GET /query/history` mengembalikan riwayat milik user, terbaru dulu, paginated, dengan filter: teks (substring pada SQL), connectionId, status, rentang waktu; entri memuat SQL, koneksi (label bila masih ada), database, status, durasi, jumlah baris, waktu.
- [**AC-2**](test.md#ac-2): aksi pada entri riwayat: buka ke tab query baru dengan konteks asalnya (koneksi terhapus → tab tetap terbuka tanpa koneksi dengan pemberitahuan untuk memilih ulang); salin SQL; hapus entri; `DELETE /query/history` menghapus seluruh riwayat milik user dengan konfirmasi.
- [**AC-3**](test.md#ac-3): retensi otomatis (spec 0009 AC-5) berjalan pada setiap penulisan; jumlah maksimum dari settings; UI menampilkan keterangan batas retensi.
- [**AC-4**](test.md#ac-4): saved queries CRUD: `GET/POST/PATCH/DELETE /query/saved`; nama wajib dan unik per user (409 bila bentrok), SQL wajib, tag opsional, konteks opsional (connectionId, database); membuka saved query membuat tab baru dengan konteksnya.
- [**AC-5**](test.md#ac-5): simpan cepat dari editor: aksi "Simpan query" pada tab mengisi dialog nama dengan konteks tab; menyimpan ulang ke nama sama menawarkan timpa (update) secara eksplisit.
- [**AC-6**](test.md#ac-6): kedua daftar privat per pemilik: user lain (termasuk Admin) tidak dapat membaca riwayat atau saved query orang lain lewat API apa pun (bagian 5 matriks: history dan saved query per user).
- [**AC-7**](test.md#ac-7): UI: halaman query-history dengan dua tab (Riwayat, Tersimpan), pencarian dan filter, virtual list; panel samping cepat di query editor untuk membuka riwayat dan tersimpan tanpa pindah halaman.
- [**AC-8**](test.md#ac-8): e2e: eksekusi menambah riwayat; simpan bernama; buka dari riwayat dengan konteks; hapus semua riwayat; isolasi antar user dibuktikan test otorisasi.

## Options considered

### Option 1: Pencarian riwayat lewat LIKE pada SQLite (dipilih)

**Pros**:

- Sederhana, cukup untuk ribuan entri per user dengan retensi 1000; tanpa infrastruktur tambahan.

**Cons**:

- Substring besar tanpa index; volume dibatasi retensi sehingga aman.

### Option 2: FTS5 SQLite untuk riwayat

**Pros**:

- Pencarian teks lebih kaya.

**Cons**:

- Tabel bayangan dan pemeliharaan index untuk data yang dibatasi 1000 baris per user; berlebihan.

## Decision

**Chosen option**: Option 1: LIKE berparameter dengan batas retensi sebagai penjamin skala; saved queries CRUD standar dengan keunikan nama per user.

## Rationale

Retensi yang sudah diputuskan (default 1000 per user) membuat pencarian sederhana memadai; kompleksitas FTS tidak membeli apa pun pada volume itu. Privasi ketat (Admin pun tidak bisa membaca) mengikuti keputusan bagian 5 bahwa riwayat per Myadmin user, konsisten dengan batas Admin pada credential (spec 0026): jejak kerja user terhadap database nya adalah data sensitif.

## Feature design

**Data model sketch**: memakai `query_history` dan `saved_queries` (spec 0008); migrasi v2 menambah `saved_queries.tags` sebagai JSON array tervalidasi untuk memenuhi pengelompokan tag milik user.

**API surface**:

| Endpoint           | Method       | Key inputs                                   | Key outputs  | Auth    | Key errors |
| ------------------ | ------------ | -------------------------------------------- | ------------ | ------- | ---------- |
| /query/history     | GET          | q?, connectionId?, status?, from?, to?, page | items, total | pemilik |            |
| /query/history/:id | DELETE       | tidak ada                                    | kosong       | pemilik | 404        |
| /query/history     | DELETE       | tidak ada                                    | kosong       | pemilik |            |
| /query/saved       | GET/POST     | name, sql, connectionId?, database?, tags?   | item(s)      | pemilik | 409 nama   |
| /query/saved/:id   | PATCH/DELETE | name?, sql?, konteks?                        | item         | pemilik | 404, 409   |

**Value sourcing**:

| Action         | Value produced / displayed | Source                                                      |
| -------------- | -------------------------- | ----------------------------------------------------------- |
| daftar riwayat | label koneksi              | join descriptor; koneksi terhapus tampil sebagai "terhapus" |
| buka ke tab    | konteks                    | kolom connection_id, database, schema entri                 |
| batas retensi  | nilai                      | settings `history.maxEntriesPerUser`                        |

**Key invariants**:

- Semua endpoint di scope kan ke user sesi; tidak ada parameter userId dari klien.
- Riwayat menyimpan SQL, bukan hasil (bagian 8.2 butir 8: tanpa isi data).

**Security model**: kepemilikan ketat (AC-6); test otorisasi lintas user wajib.

**Configuration required**: memakai `history.maxEntriesPerUser` (spec 0012).

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. [x] Tambah operasi history dan saved ke kontrak, regenerasi, contract test.
2. [x] Use case dan endpoint server (filter berparameter, kepemilikan, retensi saat penulisan, hapus semua), memenuhi **AC-1** sampai **AC-4**, **AC-6**.
3. [x] UI halaman query-history dua tab plus panel cepat di editor plus simpan cepat, memenuhi **AC-5**, **AC-7**.
4. [x] E2e dan test otorisasi, memenuhi **AC-8**.

## Consequences

**Positive**:

- Melengkapi FR-QRY-06 penuh; editor terasa lengkap untuk kerja harian.

**Negative / tradeoffs**:

- Pencarian substring sederhana; cukup untuk retensi V1, dievaluasi ulang bila retensi dinaikkan.

**Neutral**:

- Berbagi saved query antar user adalah kandidat V2 (terkait connection sharing yang juga V2).

## Follow-up

- [ ] Tidak ada.

## References

**Project sources**:

- v1-feature-specification.md FR-QRY-06, matriks bagian 5, bagian 8.2 butir 8; spec 0008, 0009, 0033.

**Practices & standards**:

- Data jejak kerja privat per pemilik; retensi sebagai pengendali skala.

**Links**: tidak ada yang diverifikasi untuk spec ini.
