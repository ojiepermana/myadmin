# 0025. Provider MySQL: metadata dan introspeksi

**Date**: 2026-08-28
**Status**: In Progress
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini melengkapi provider MySQL dengan lapisan metadata, cermin spec 0023: daftar database (yang sekaligus schema), table, view, routine, trigger, kolom, index, constraint, ukuran, komentar, dan pencarian object, lazy dan paginated, dalam bentuk model umum yang sama dengan PostgreSQL.

## Context

Hierarki MySQL lebih datar: database → object, tanpa lapisan schema (FR-PROV-05); `MetadataPort` yang sama harus menghasilkan bentuk yang sama dengan `schema` bernilai null. Sumber datanya information_schema MySQL plus perintah SHOW seperlunya. Explorer juga menampilkan trigger untuk MySQL sesuai matriks scope (browse saja, tanpa editor GUI, FR-TBL-04).

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0024.

## Requirements

**User stories**:
- Sebagai pengguna MySQL, saya ingin pengalaman menelusuri yang sama dengan PostgreSQL meski hierarkinya berbeda.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): `listDatabases` mengembalikan database non sistem (sys, mysql, information_schema, performance_schema disaring kecuali diminta), dengan charset, collation, dan ukuran (malas); `listSchemas` mengembalikan kosong dan bukan error (capability `schemas` false).
- [**AC-2**](test.md#ac-2): `listObjects(database, type[], page)` mengembalikan table, view, routine (function dan procedure), dan trigger paginated (pageSize maksimum 500), dengan `ObjectRef.schema` bernilai null.
- [**AC-3**](test.md#ac-3): `describeTable(ref)` selengkap versi PostgreSQL untuk hal yang berlaku: kolom (tipe, nullability, default, auto_increment sebagai identity, generated, komentar), primary key, foreign key dengan aturan ON, unique, check (bila versi mendukung), index (komposit, unik, tipe), engine penyimpanan dan collation table sebagai properti tambahan, perkiraan jumlah baris; cukup untuk table designer.
- [**AC-4**](test.md#ac-4): `getViewDefinition(ref)` mengembalikan definisi view; `listRoutines` dan daftar trigger untuk tampilan explorer.
- [**AC-5**](test.md#ac-5): `searchObjects(scope, q, type[], page)` server side paginated pada information_schema; tanpa unduhan katalog penuh.
- [**AC-6**](test.md#ac-6): quoting identifier MySQL (backtick) lewat satu fungsi teruji; nilai pencarian sebagai parameter.
- [**AC-7**](test.md#ac-7): test kontrak metadata generik (spec 0021) lulus pada MySQL nyata; bentuk hasil identik lintas provider (dibuktikan test bentuk yang membandingkan skema objek hasil PostgreSQL dan MySQL).
- [**AC-8**](test.md#ac-8): performa: database sintetis 2000 table, per halaman tetap responsif dan ekspansi node hanya memicu query node itu.

## Options considered

### Option 1: information_schema plus SHOW pelengkap (dipilih)

**Pros**:
- information_schema MySQL cukup lengkap untuk kolom, constraint, index; SHOW CREATE untuk definisi view; kombinasi yang lazim dan stabil.

**Cons**:
- Beberapa informasi (misal komentar index) tersebar; ditutup query gabungan di package ini.

### Option 2: SHOW saja

**Pros**:
- Sederhana.

**Cons**:
- Hasil SHOW berorientasi teks, sulit dipaginasi dan difilter; tidak memadai untuk kontrak paginated.

## Decision

**Chosen option**: Option 1: information_schema sebagai sumber utama, SHOW CREATE untuk definisi, hasil dipetakan ke model umum spec 0021.

## Rationale

Kontrak menuntut bentuk seragam dan pagination; information_schema adalah satu satunya sumber MySQL yang bisa di query seperti itu. Perbedaan hierarki diserap di provider (schema null), bukan di UI, persis tujuan FR-PROV-05: UI merender hierarki dari data, tanpa if engine.

## Feature design

**Data model sketch**: cache metadata per koneksi aktif, pola sama dengan spec 0023 (TTL 30 detik, refresh manual).

**API surface**: port spec 0021.

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| listDatabases | ukuran | agregat `information_schema.tables.data_length + index_length`, malas |
| describeTable | auto_increment, generated | information_schema.columns (extra, generation_expression) |
| describeTable | engine, collation table | information_schema.tables |
| view definition | SQL | SHOW CREATE VIEW |

**Key invariants**:
- `ObjectRef.schema` selalu null dari provider ini; UI tidak pernah menerima bentuk hierarki yang berbeda, hanya nilai yang berbeda.
- Pagination wajib; quoting terpusat; nilai lewat parameter.

**Security model**: metadata mengikuti hak credential koneksi; error lewat mapper spec 0024.

**Configuration required**: tidak ada.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. [x] Fungsi quoting backtick plus test, memenuhi **AC-6**.
2. [x] listDatabases (saring sistem, charset, collation, ukuran malas), listObjects paginated termasuk trigger, memenuhi **AC-1**, **AC-2**.
3. [x] describeTable lengkap plus properti engine/collation, memenuhi **AC-3**.
4. [x] getViewDefinition, listRoutines, daftar trigger, memenuhi **AC-4**.
5. [x] searchObjects paginated, memenuhi **AC-5**.
6. Test integrasi dua versi, test bentuk lintas provider, test performa, memenuhi **AC-7**, **AC-8**.

## Consequences

**Positive**:
- Kedua provider setara secara metadata; explorer dan designer bisa dibangun sekali untuk keduanya.

**Negative / tradeoffs**:
- Perbedaan minor antar versi MySQL (check constraint, generated) ditanggung tabel versi di provider.

**Neutral**:
- Trigger tampil di explorer sebagai informasi; pengelolaannya V2.

## Follow-up

- [ ] Tidak ada.

## References

**Project sources**:
- v1-feature-specification.md FR-EXP-01 sampai FR-EXP-03, FR-PROV-05, matriks scope baris workspace dan explorer; spec 0021, 0024.

**Practices & standards**:
- Satu bentuk metadata lintas engine; perbedaan diserap adapter.

**Links**: tidak ada yang diverifikasi untuk spec ini.
