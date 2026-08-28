# 0040. Manajemen schema

**Date**: 2026-08-28
**Status**: In Progress
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini membangun pengelolaan schema untuk engine yang mendukungnya (PostgreSQL di V1): browse properti schema, create, rename, drop dengan konfirmasi destructive, dan owner bila capability menyatakannya. Di MySQL seluruh fitur ini tidak muncul sama sekali karena capability `schemas` false, dan itulah bukti pertama pola capability driven bekerja untuk fitur yang benar benar absen di satu engine.

## Context

FR-SCH-01: schema management tersedia bila capability `schemas` true; browse/create/rename/drop pada PostgreSQL; UI tidak menampilkan operasi ini pada MySQL. Explorer sudah merender lapisan schema hanya bila capability true (spec 0031); komponen konfirmasi destructive sudah baku (spec 0039).

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0039.

## Requirements

**User stories**:

- Sebagai pengguna PostgreSQL, saya ingin mengatur schema sebagai ruang kerja object tanpa menulis DDL manual.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): operasi `SchemaPort` diimplementasikan provider PostgreSQL: list (sudah lewat metadata), properties (owner, jumlah object ringkas), create (nama, owner opsional), rename, drop (dengan mode restrict default; drop berisi object ditolak dengan pesan menjelaskan isi, tanpa opsi cascade di V1).
- [**AC-2**](test.md#ac-2): endpoint sesuai kontrak: `POST /schemas`, `PATCH /schemas/:name` (rename), `DELETE /schemas/:name` (confirmName wajib); semua menyertakan connectionId dan database konteks.
- [**AC-3**](test.md#ac-3): seluruh fitur digerbangi `capabilities.schemas`: menu, halaman, dan endpoint (server menjawab `unsupported` untuk engine tanpa capability meski request dipaksa, FR-PROV-04).
- [**AC-4**](test.md#ac-4): rename memperingatkan dampak (object yang mereferensikan schema lewat nama terkualifikasi bisa rusak) sebelum konfirmasi; drop memakai komponen konfirmasi ketik nama.
- [**AC-5**](test.md#ac-5): create, rename, drop diaudit (`schema.created`, `schema.renamed`, `schema.dropped`) sebelum response sukses.
- [**AC-6**](test.md#ac-6): e2e PostgreSQL: create, rename, drop kosong sukses; drop schema berisi ditolak dengan pesan; e2e MySQL: tidak ada menu schema dan endpoint menjawab unsupported.

## Options considered

### Option 1: Drop restrict saja di V1 (dipilih)

**Pros**:

- Menghapus schema berisi lewat GUI adalah operasi bencana; restrict memaksa kesadaran isi; konsisten semangat safety V1.

**Cons**:

- Pengguna yang sungguh ingin cascade harus lewat query editor (tersedia, sadar, dan tetap diaudit sebagai DDL destructive lewat konfirmasi editor? eksekusi SQL bebas tidak berkonfirmasi; keputusan sadar: cascade manual adalah wilayah SQL pengguna).

### Option 2: Opsi cascade di GUI

**Pros**:

- Lengkap.

**Cons**:

- Satu klik bisa menghapus ratusan object; kombinasi checkbox cascade dan kebiasaan mengetik nama menurunkan kewaspadaan justru pada kasus terbahaya.

## Decision

**Chosen option**: Option 1: restrict di GUI, cascade hanya lewat SQL manual pengguna.

## Rationale

GUI bertanggung jawab atas blast radius yang bisa diprediksi; drop schema cascade tidak bisa diprediksi dari dialog. Pola gerbang capability diuji dua arah di sini (fitur hadir penuh di PostgreSQL, absen total di MySQL) sehingga menjadi acuan fitur bergerbang lain (FR-SCH-01 memang dirancang dokumen sebagai contoh pola ini).

## Feature design

**Data model sketch**: tidak ada tabel internal; operasi `SchemaPort` PostgreSQL.

**API surface**:

| Endpoint                               | Method | Key inputs   | Key outputs | Auth                            | Key errors                      |
| -------------------------------------- | ------ | ------------ | ----------- | ------------------------------- | ------------------------------- |
| /connections/:id/databases/:db/schemas | POST   | name, owner? | schema      | pemilik, tersambung, capability | 409, 422, unsupported           |
| .../schemas/:name                      | PATCH  | newName      | schema      | sama                            | 409, unsupported                |
| .../schemas/:name                      | DELETE | confirmName  | kosong      | sama                            | 409 confirm/berisi, unsupported |

**Value sourcing**:

| Action       | Value produced / displayed | Source                               |
| ------------ | -------------------------- | ------------------------------------ |
| daftar owner | role tersedia              | metadata principal provider (ringan) |
| drop ditolak | daftar isi ringkas         | hitungan object schema dari metadata |
| gerbang      | schemas capability         | describe koneksi                     |

**Key invariants**:

- Server menolak operasi schema pada koneksi tanpa capability, apa pun yang UI kirim (AC-3).
- Drop hanya schema kosong (restrict); audit sebelum sukses.

**Security model**: hak mengikuti credential; pemilik koneksi saja.

**Configuration required**: tidak ada.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. Implementasikan `SchemaPort` PostgreSQL (create, rename, drop restrict, properties) plus test integrasi, memenuhi **AC-1**.
2. Tambah operasi ke kontrak dengan confirmName, regenerasi, contract test, memenuhi **AC-2**.
3. Endpoint server dengan gerbang capability tegas, memenuhi **AC-3**.
4. UI: menu dan form schema (create dengan owner, rename dengan peringatan, drop konfirmasi), registrasi menu explorer, memenuhi **AC-4**.
5. Audit dan e2e dua arah, memenuhi **AC-5**, **AC-6**.

## Consequences

**Positive**:

- Pola capability yang absen total di satu engine terbukti bekerja; manajemen schema PostgreSQL lengkap untuk V1.

**Negative / tradeoffs**:

- Tanpa cascade di GUI; pengguna tingkat lanjut memakai SQL.

**Neutral**:

- Schema privileges adalah V2 (feature.md).

## Follow-up

- [ ] Tidak ada.

## References

**Project sources**:

- v1-feature-specification.md FR-SCH-01, FR-PROV-04, bagian 10; feature.md baris schema; spec 0031, 0039.

**Practices & standards**:

- Blast radius GUI yang bisa diprediksi; gerbang capability di server, bukan hanya UI.

**Links**: tidak ada yang diverifikasi untuk spec ini.
