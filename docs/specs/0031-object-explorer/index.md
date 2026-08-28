# 0031. Object explorer

**Date**: 2026-08-28
**Status**: In Progress
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini membangun pohon penjelajah object di sidebar: koneksi per group di akar, lalu database, schema (bila engine mendukungnya), table, view, routine, dan trigger, dimuat malas per node dari metadata provider, dengan context menu per jenis node yang digerakkan capability. Explorer adalah pintu masuk hampir semua fitur database.

## Context

FR-EXP-01 (lazy per node), FR-EXP-02 (hierarki provider dan common object), FR-PROV-05 (PostgreSQL database → schema → object; MySQL database → object), dan aturan capability (UI membaca capability, bukan nama engine). Metadata paginated tersedia dari kedua provider (spec 0023, 0025); status koneksi dari spec 0027. Yang diputuskan di sini: endpoint HTTP metadata, bentuk node UI, dan perilaku context menu.

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0023, 0025, 0027.

## Requirements

**User stories**:

- Sebagai pengguna, saya ingin menelusuri server besar dengan cepat dan membuka aksi yang relevan dari klik kanan.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): endpoint metadata terdefinisi di kontrak dan diimplementasikan: `GET /connections/:id/databases`, `GET /connections/:id/databases/:db/children` (schema atau object sesuai capability), `GET .../schemas/:schema/objects?type=&page=`, `GET .../objects/describe?ref=`; semua paginated sesuai kontrak provider dan hanya untuk koneksi tersambung milik user (409 `NOT_CONNECTED` bila belum connect).
- [**AC-2**](test.md#ac-2): pohon dirender dari data: koneksi (per group, dengan indikator status), database, node schema hanya muncul bila `capabilities.schemas` true, folder object per tipe (Tables, Views, Routines, Triggers bila provider memaparkan); tidak ada percabangan nama engine di kode UI (FR-PROV-04, dibuktikan review dan tidak adanya string engine di feature explorer).
- [**AC-3**](test.md#ac-3): ekspansi node memuat hanya anak node itu (satu halaman pertama); folder besar menampilkan item "Muat lebih banyak" untuk halaman berikutnya; tanpa prefetch rekursif (FR-EXP-01, NFR-01).
- [**AC-4**](test.md#ac-4): node menampilkan ikon per tipe, nama, dan detail ringkas (misal jumlah perkiraan baris pada table bila sudah dimuat); loading dan error per node (error node tidak merobohkan pohon, bisa retry).
- [**AC-5**](test.md#ac-5): context menu per jenis node berisi aksi yang capability dan spec nya tersedia, dinonaktifkan dengan penjelasan bila tidak (prinsip scope butir 4): koneksi (connect, disconnect, edit, test), database (browse properti, create/drop [spec 0039]), table (browse data [0037], design [0041], drop/rename/truncate [0043]), view (open definition, edit [0044]), routine/trigger (lihat definisi di query editor, FR-TBL-04); aksi yang spec nya belum terbangun tidak muncul sampai fiturnya ada.
- [**AC-6**](test.md#ac-6): refresh manual per node menginvalidasi cache metadata node itu (spec 0023/0025) dan memuat ulang.
- [**AC-7**](test.md#ac-7): pohon virtualized (ribuan node tetap mulus), navigasi keyboard penuh (panah, Enter ekspansi, menu kunci konteks), memakai komponen tree foundation.
- [**AC-8**](test.md#ac-8): e2e pada kedua engine: telusuri sampai kolom table, verifikasi MySQL tanpa lapisan schema dan PostgreSQL dengan schema, context menu muncul sesuai capability.

## Options considered

### Option 1: Endpoint metadata generik berbentuk node (dipilih)

**Pros**:

- UI satu untuk semua engine; bentuk node dari model umum; pagination bawaan.

**Cons**:

- Endpoint agak abstrak; ditutup dokumentasi kontrak yang jelas.

### Option 2: Endpoint per jenis object per engine

**Pros**:

- Response paling spesifik.

**Cons**:

- Meledakkan permukaan API dan menggoda UI bercabang engine; bertentangan dengan FR-PROV-04.

## Decision

**Chosen option**: Option 1: endpoint metadata generik yang meneruskan model umum provider, pohon UI murni data driven.

**Implementation skills**: `angular-developer` (level user); komponen tree dari @ojiepermana/angular.

## Rationale

Explorer adalah tempat godaan terbesar menulis "if postgresql"; desain node driven dengan capability menutupnya sejak bentuk API. Kemalasan per node dan virtualisasi bukan optimasi tapi syarat (NFR-01) karena server nyata berisi ribuan object. Context menu yang menonaktifkan dengan penjelasan, bukan menyembunyikan diam diam, mengikuti prinsip scope butir 4.

## Feature design

**Data model sketch**: tidak ada tabel baru; bentuk node UI `ExplorerNode { id, kind, ref: ObjectRef | connectionId, label, hasChildren, page? }`.

**API surface**: seperti AC-1; semua GET, auth pemilik koneksi, error `NOT_CONNECTED`, `DbError` diteruskan berkategori.

**Value sourcing**:

| Action            | Value produced / displayed  | Source                                                     |
| ----------------- | --------------------------- | ---------------------------------------------------------- |
| anak node koneksi | daftar database             | MetadataPort.listDatabases                                 |
| bentuk hierarki   | ada tidaknya lapisan schema | `capabilities.schemas` koneksi itu                         |
| aksi context menu | daftar aksi aktif           | capability koneksi plus registry aksi fitur yang terpasang |
| indikator status  | status koneksi              | store status (spec 0027, push 0029)                        |

**Key invariants**:

- Tidak ada pemuatan rekursif; setiap request metadata dipicu interaksi.
- UI tidak memuat string nama engine untuk logika (hanya untuk tampilan label engine).
- Node yang gagal dimuat bisa dicoba ulang tanpa mereset pohon.

**Security model**: semua endpoint metadata mensyaratkan kepemilikan koneksi dan keadaan tersambung; data yang terlihat mengikuti hak credential koneksi (bagian 8.2 butir 6).

**Configuration required**: tidak ada.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. Tambah endpoint metadata ke kontrak, implementasi server di modul explorer (meneruskan MetadataPort dengan pemeriksaan koneksi), contract test, memenuhi **AC-1**.
2. Bangun `explorer.store` dan pohon virtualized data driven dengan lazy load dan halaman berikutnya, memenuhi **AC-2**, **AC-3**, **AC-4**, **AC-7**.
3. Bangun registry aksi context menu yang membaca capability dan fitur terpasang, memenuhi **AC-5**.
4. Refresh per node dengan invalidasi cache provider, memenuhi **AC-6**.
5. E2e dua engine, memenuhi **AC-8**.

## Consequences

**Positive**:

- Pintu masuk semua fitur database berdiri; fitur berikutnya tinggal mendaftarkan aksi context menu.

**Negative / tradeoffs**:

- Registry aksi menambah tipuan kecil; imbalannya menu yang tumbuh tanpa mengedit explorer.

**Neutral**:

- Object search dipisah ke spec 0032 agar pohon ini fokus.

## Follow-up

- [ ] Setiap fitur baru (0037, 0039, 0041, 0043, 0044, 0045) mendaftarkan aksinya ke registry menu.

## References

**Project sources**:

- v1-feature-specification.md FR-EXP-01, FR-EXP-02, FR-PROV-04, FR-PROV-05, NFR-01; spec 0023, 0025, 0027.

**Practices & standards**:

- UI data driven dari capability; virtualisasi untuk pohon besar; kegagalan terlokalisasi per node.

**Links**: tidak ada yang diverifikasi untuk spec ini.
