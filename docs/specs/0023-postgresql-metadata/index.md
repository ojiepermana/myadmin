# 0023. Provider PostgreSQL: metadata dan introspeksi

**Date**: 2026-08-28
**Status**: In Progress
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini melengkapi provider PostgreSQL dengan lapisan metadata: daftar database, schema, table, view, routine, kolom, index, constraint, ukuran, komentar, dan pencarian object, semuanya lazy per node dan paginated. Lapisan ini menjadi bahan bakar object explorer, autocomplete, data browser, dan table designer.

## Context

FR-EXP-01 sampai FR-EXP-03 menuntut lazy loading (buka server tidak menarik seluruh katalog), hierarchy sesuai provider (database → schema → object untuk PostgreSQL, FR-PROV-05), dan object search di sisi server dengan pagination. Semua query katalog PostgreSQL (pg_catalog, information_schema) harus tinggal di package ini (FR-PROV-02). Bentuk hasil memakai model umum `ObjectRef`, kolom, index, constraint dari spec 0021.

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0022.

## Requirements

**User stories**:

- Sebagai pengguna, saya ingin menelusuri isi server besar tanpa menunggu seluruh katalog dimuat.
- Sebagai fitur lain, saya ingin metadata berbentuk seragam untuk membangun UI dan autocomplete.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): `MetadataPort.listDatabases` mengembalikan nama, owner, encoding, collation, dan ukuran (ukuran boleh dihitung malas terpisah karena mahal); tanpa memuat object di dalamnya.
- [**AC-2**](test.md#ac-2): `listSchemas(database)` mengembalikan schema non sistem plus flag schema sistem bila diminta eksplisit; `listObjects(database, schema, type[], page)` mengembalikan table, view, sequence, function/procedure secara paginated (pageSize maksimum 500) dan tidak pernah menarik semua tipe sekaligus tanpa diminta.
- [**AC-3**](test.md#ac-3): `describeTable(ref)` mengembalikan kolom (nama, tipe tampil, nullability, default, identity, generated, komentar), primary key, foreign key (dengan referensi dan aturan ON), unique, check, index (termasuk komposit, unik, metode), dan perkiraan jumlah baris; cukup lengkap untuk table designer (spec 0041, 0042) tanpa query tambahan.
- [**AC-4**](test.md#ac-4): `getViewDefinition(ref)` mengembalikan definisi view; `listRoutines` mengembalikan nama dan signature untuk ditampilkan explorer (tanpa editor GUI, FR-TBL-04).
- [**AC-5**](test.md#ac-5): `searchObjects(scope, q, type[], page)` mencari nama object (awalan dan substring) pada lingkup koneksi atau database di sisi server dengan pagination; tidak ada jalur yang mengunduh katalog penuh ke klien (FR-EXP-03, NFR-01).
- [**AC-6**](test.md#ac-6): semua identifier yang disisipkan ke query katalog di quote benar (fungsi quoting tunggal teruji); input pencarian dipakai sebagai parameter, bukan disambung ke SQL.
- [**AC-7**](test.md#ac-7): hasil sesuai model umum spec 0021 sehingga MySQL (spec 0025) menghasilkan bentuk yang sama; test kontrak metadata generik dijalankan pada server nyata.
- [**AC-8**](test.md#ac-8): performa: pada database sintetis 2000 table, `listObjects` per halaman tetap di bawah ambang wajar dan explorer tidak pernah meminta lebih dari satu halaman per ekspansi (test performa di `tests/performance/`).

## Options considered

### Option 1: Query pg_catalog langsung (dipilih)

**Pros**:

- Lengkap dan cepat (identity, generated, komentar, ukuran tersedia); satu sumber untuk semua kebutuhan describe.

**Cons**:

- SQL katalog lebih rumit dan spesifik versi; ditanggung tabel query per versi di package ini, tempat yang memang ditakdirkan untuk itu.

### Option 2: information_schema saja

**Pros**:

- Portabel antar engine.

**Cons**:

- Tidak memuat semua yang dibutuhkan (komentar, ukuran, metode index); portabilitas tidak bernilai karena tiap provider memang punya implementasinya sendiri.

## Decision

**Chosen option**: Option 1: pg_catalog dengan tabel query per versi mayor, hasil dipetakan ke model umum.

Ukuran database dan table dihitung lewat panggilan terpisah yang dipanggil UI secara malas (basis: NFR-01; ukuran itu mahal dan jarang dibutuhkan bersamaan dengan daftar).

## Rationale

Metadata adalah fondasi separuh fitur V1; kelengkapan describeTable menentukan apakah table designer bisa dibangun tanpa kembali ke sini. pg_catalog dipilih karena kebutuhan itu; biaya kerumitannya dilokalkan di package provider sesuai arsitektur. Pagination dan kemalasan bukan optimasi melainkan syarat FR, maka keduanya diuji sebagai perilaku (AC-8), bukan diserahkan ke niat baik UI.

## Feature design

**Data model sketch**: tidak ada tabel internal; cache metadata dalam memori per koneksi aktif dengan invalidasi manual (tombol refresh) dan TTL pendek (30 detik) untuk autocomplete.

**API surface**: port metadata (spec 0021); endpoint HTTP nya didefinisikan bersama fitur pemakai (spec 0031, 0032).

**Value sourcing**:

| Action        | Value produced / displayed | Source                                              |
| ------------- | -------------------------- | --------------------------------------------------- |
| listDatabases | ukuran                     | `pg_database_size` lewat panggilan malas            |
| describeTable | identity/generated         | pg_attribute dan pg_attrdef sesuai versi            |
| describeTable | perkiraan baris            | `reltuples` (perkiraan, dilabeli sebagai perkiraan) |
| search        | hasil                      | query katalog parameterized dengan ILIKE            |

**Key invariants**:

- Tidak ada operasi metadata yang tanpa batas halaman; tidak ada panggilan "ambil semua" lintas tipe.
- Semua identifier lewat quoting tunggal; semua nilai lewat parameter (AC-6).
- Bentuk keluaran identik lintas provider (kontrak spec 0021).

**Security model**: metadata dibaca dengan hak credential koneksi itu sendiri; object yang tidak boleh dilihat credential tersebut memang tidak muncul (bagian 8.2 butir 6). Pesan error melewati mapper spec 0022.

**Configuration required**: tidak ada.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. [x] Bangun fungsi quoting identifier tunggal plus test, memenuhi **AC-6**.
2. [x] Implementasikan listDatabases, listSchemas, listObjects paginated, memenuhi **AC-1**, **AC-2**.
3. [x] Implementasikan describeTable lengkap dan getViewDefinition, listRoutines, memenuhi **AC-3**, **AC-4**.
4. [x] Implementasikan searchObjects paginated, memenuhi **AC-5**.
5. [x] Tambah panggilan ukuran malas dan cache TTL pendek, memenuhi **AC-1**.
6. [x] Test integrasi dua versi PostgreSQL, test kontrak generik, dan test performa 2000 table, memenuhi **AC-7**, **AC-8**.

## Consequences

**Positive**:

- Explorer, autocomplete, data browser, dan designer memiliki satu sumber metadata yang lengkap dan berpagination.

**Negative / tradeoffs**:

- Tabel query per versi menambah perawatan saat versi PostgreSQL baru; terlokalisasi dan tertutup test versi.

**Neutral**:

- Cache 30 detik berarti autocomplete bisa tertinggal sesaat dari DDL terbaru; tombol refresh explorer menjadi jalan keluarnya.

## Follow-up

- [ ] Spec 0031 dan 0033 memakai cache metadata ini; jangan membangun cache kedua di UI.

## References

**Project sources**:

- v1-feature-specification.md FR-EXP-01 sampai FR-EXP-03, FR-PROV-05, NFR-01; spec 0021, 0022.

**Practices & standards**:

- Introspeksi lewat katalog native; pagination sebagai kontrak; quoting terpusat.

**Links**: tidak ada yang diverifikasi untuk spec ini.
