# 0044. Manajemen view (CRUD GUI)

**Date**: 2026-08-28
**Status**: In Progress
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini membangun pengelolaan view dengan GUI penuh sesuai keputusan pemilik proyek: daftar view di explorer, halaman editor view berisi editor SQL untuk definisinya, create view baru, ubah definisi (CREATE OR REPLACE atau ALTER sesuai engine), dan drop view dengan konfirmasi dan audit. Materialized view tetap V2.

## Context

Keputusan sesi desain 2026-08-28 memilih CRUD GUI penuh untuk view di V1, melampaui v1-feature-specification yang semula browse saja; konsekuensinya kontrak `ViewPort` dan capability `viewEditor` sudah ditambahkan (spec 0021), dan kedua provider memaparkan definisi view (spec 0023, 0025). Editor definisi memakai CodeMirror yang sudah ada (spec 0033). Perbedaan engine yang diserap provider: PostgreSQL CREATE OR REPLACE terbatas (kolom tidak boleh berkurang; kadang butuh drop dan create), MySQL punya ALTER VIEW penuh.

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0031, 0033 (komponen editor), 0019.

## Requirements

**User stories**:

- Sebagai pengguna, saya ingin membuat dan memperbarui view dari editor yang menampilkan definisinya, tanpa menghafal perbedaan sintaks engine.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): dari explorer, view punya aksi: buka data (jalur data browser read only, spec 0037 AC-7), edit definisi, drop; folder Views punya aksi create view.
- [**AC-2**](test.md#ac-2): halaman editor view: nama (dan schema/database konteks), definisi SELECT di editor CodeMirror dengan dialek engine dan autocomplete metadata, tombol validasi (dry run provider bila engine mendukung, minimal parse di sisi server target lewat EXPLAIN atas SELECT nya), pratinjau DDL lengkap (CREATE [OR REPLACE] VIEW ... AS ...) sebelum terapkan.
- [**AC-3**](test.md#ac-3): `POST /views` membuat view; `PUT /views/:ref` memperbarui definisi: provider memilih strategi per engine (MySQL ALTER VIEW; PostgreSQL CREATE OR REPLACE bila kompatibel, dan bila tidak, menawarkan drop dan create sebagai change set dengan peringatan dampak dependensi yang eksplisit dan konfirmasi destructive); `DELETE /views/:ref` drop dengan confirmName.
- [**AC-4**](test.md#ac-4): fitur digerbangi `capabilities.viewEditor`; server menolak operasi saat capability false meski UI dimanipulasi (FR-PROV-04).
- [**AC-5**](test.md#ac-5): create, replace, drop diaudit (`view.created`, `view.replaced`, `view.dropped`) sebelum response sukses; drop dan jalur drop create memakai komponen konfirmasi destructive dengan dampak (perujuk dari metadata dependensi).
- [**AC-6**](test.md#ac-6): definisi yang gagal (SELECT tidak valid, kolom bentrok) tiba sebagai `DbError` berkategori dengan posisi bila tersedia, ditampilkan di editor seperti error query.
- [**AC-7**](test.md#ac-7): setelah operasi, cache metadata di invalidate; tab data view yang definisinya berubah diberi tanda muat ulang.
- [**AC-8**](test.md#ac-8): e2e kedua engine: create view dari SELECT fixture, buka datanya, ubah definisi (termasuk kasus PostgreSQL yang butuh drop create dengan konfirmasi), drop; audit tercatat.

## Options considered

### Option 1: Editor definisi berbasis SQL dengan pratinjau DDL (dipilih)

**Pros**:

- View adalah SQL; editor SQL dengan autocomplete adalah representasi jujurnya; pratinjau DDL konsisten dengan pola designer.

**Cons**:

- Bukan builder visual kolom; sesuai kesepakatan, builder visual bukan tuntutan keputusan.

### Option 2: Builder visual query untuk view

**Pros**:

- Ramah pemula.

**Cons**:

- Proyek besar tersendiri (query builder) yang tidak diminta; keputusan menyebut CRUD GUI, bukan visual builder.

## Decision

**Chosen option**: Option 1: halaman editor view (form nama plus editor SELECT plus pratinjau DDL), strategi update per engine di provider, gerbang `viewEditor`.

## Rationale

Keputusan view V1 dieksekusi dengan biaya paling proporsional: memakai kembali editor, autocomplete, pratinjau, dan pola konfirmasi yang sudah ada, sementara kerumitan nyata (strategi REPLACE vs drop create PostgreSQL) diletakkan di provider tempat semantik engine memang tinggal. Jalur drop create yang eksplisit dengan dampak dependensi mencegah kejutan view perujuk yang rusak diam diam.

## Feature design

**Data model sketch**: tidak ada tabel internal; operasi `ViewPort` (spec 0021).

**API surface**:

| Endpoint                | Method | Key inputs                                         | Key outputs                 | Auth                            | Key errors                     |
| ----------------------- | ------ | -------------------------------------------------- | --------------------------- | ------------------------------- | ------------------------------ |
| /views                  | GET    | connectionId, database, schema?                    | paged view refs             | pemilik, tersambung, viewEditor | 409/422/501, DbError           |
| /views                  | POST   | connectionId, ref (nama, schema/db), definitionSql | view                        | pemilik, tersambung, viewEditor | 409 nama, 422/DbError          |
| /views/ddl/validate     | POST   | connectionId, definitionSql                        | valid                       | pemilik, tersambung, viewEditor | 422/501, DbError               |
| /views/ddl/preview      | POST   | connectionId, ref, definitionSql, operation        | compiled change set         | pemilik, tersambung, viewEditor | 422/501, DbError               |
| /views/ddl/drop-preview | POST   | connectionId, ref                                  | compiled drop change set    | pemilik, tersambung, viewEditor | 422/501, DbError               |
| /views/:ref             | GET    | connectionId                                       | view, definition            | pemilik, tersambung, viewEditor | 404/422/501, DbError           |
| /views/:ref             | PUT    | definitionSql, allowDropCreate?, confirmName?      | view, strategi yang dipakai | sama                            | 409 butuh drop create, DbError |
| /views/:ref             | DELETE | confirmName                                        | kosong                      | sama                            | 409 confirm, DbError           |

**Value sourcing**:

| Action          | Value produced / displayed | Source                                              |
| --------------- | -------------------------- | --------------------------------------------------- |
| definisi kini   | SQL                        | getViewDefinition provider                          |
| strategi update | replace vs drop create     | analisis provider (kompatibilitas kolom PostgreSQL) |
| dampak drop     | perujuk                    | metadata dependensi provider                        |
| gerbang         | viewEditor                 | capability koneksi                                  |

**Key invariants**:

- Update tidak pernah memakai drop create tanpa persetujuan eksplisit (flag plus confirmName).
- Pratinjau DDL = yang dijalankan (kompilasi tunggal, pola spec 0041).
- Audit sebelum sukses untuk ketiga operasi.

**Security model**: hak mengikuti credential; pemilik koneksi; operasi destructive diaudit.

**Configuration required**: tidak ada.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. [x] Implementasikan `ViewPort` di kedua provider (create, getDefinition sudah ada, replace dengan analisis strategi, drop) plus test integrasi, memenuhi **AC-3**.
2. [x] Tambah operasi view ke kontrak (flag drop create, confirmName), regenerasi, contract test, memenuhi **AC-3**, **AC-4**.
3. [x] Endpoint server dengan gerbang capability dan audit, memenuhi **AC-4**, **AC-5**.
4. [x] UI: halaman editor view (nama, editor SELECT plus autocomplete, validasi, pratinjau DDL), aksi explorer, konfirmasi destructive dengan dampak, invalidasi metadata, memenuhi **AC-1**, **AC-2**, **AC-6**, **AC-7**.
5. [x] E2e dua engine, memenuhi **AC-8**.

## Consequences

**Positive**:

- Keputusan produk (view first class di V1) terpenuhi dengan pola yang sudah teruji; feature.md baris "CRUD views V1" kini punya implementasi yang didefinisikan.

**Negative / tradeoffs**:

- Strategi drop create PostgreSQL memindahkan risiko ke momen konfirmasi; dampak dependensi ditampilkan untuk itu.

**Neutral**:

- Materialized view tetap V2 dengan capability `materializedViews` false.

## Follow-up

- [ ] Perbarui v1-feature-specification.md bagian 7.8: tambah FR view editor (keputusan sesi desain melampaui dokumen).

## References

**Project sources**:

- Keputusan view CRUD GUI penuh, sesi desain 2026-08-28; feature.md baris views; spec 0021 (ViewPort), 0023, 0025, 0031, 0033, 0041 (pola pratinjau).

**Practices & standards**:

- Pratinjau DDL; strategi perubahan per engine di adapter; gerbang capability di server.

**Links**: tidak ada yang diverifikasi untuk spec ini.
