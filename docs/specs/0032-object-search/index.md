# 0032. Object search

**Date**: 2026-08-28
**Status**: In Progress
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini menambah pencarian object lintas katalog: kotak pencarian di atas explorer yang mencari nama database, schema, table, view, dan routine pada koneksi aktif lewat provider, server side dan paginated, dengan hasil yang bisa dilompati ke node explorer atau langsung ke aksi.

## Context

FR-EXP-03: object search berjalan di server provider dengan pagination dan tidak mengunduh seluruh katalog ke browser. Kemampuan pencarian provider sudah dibangun (`searchObjects`, spec 0023 dan 0025); yang tersisa adalah endpoint, UI, dan perilaku lompat ke hasil.

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0031.

## Requirements

**User stories**:

- Sebagai pengguna di server dengan ribuan table, saya ingin menemukan object dari namanya tanpa menelusuri pohon.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): `GET /connections/:id/search?q=&types=&database=&page=` memanggil `searchObjects` provider: q minimal 2 karakter, types opsional (database, schema, table, view, routine), lingkup opsional per database, hasil paginated (pageSize 50) berbentuk `ObjectRef` plus tipe dan konteksnya.
- [**AC-2**](test.md#ac-2): pencarian berjalan hanya pada koneksi tersambung milik user; input dipakai sebagai parameter query provider (tanpa penyambungan SQL, sudah dijamin spec 0023/0025 AC-6).
- [**AC-3**](test.md#ac-3): UI: kotak pencarian di panel explorer dengan debounce 300 ms, hasil dikelompokkan per tipe, keyboard penuh (panah, Enter), dan tombol muat halaman berikutnya;状态 kosong dan error yang jelas.
- [**AC-4**](test.md#ac-4): memilih hasil melompat ke node terkait di pohon (mengekspansi jalurnya secara malas) atau, lewat menu hasil, langsung ke aksi utama object itu (browse data untuk table, definisi untuk view) sesuai registry aksi spec 0031.
- [**AC-5**](test.md#ac-5): pencarian dibatalkan otomatis saat kueri berubah (request lama di abort) supaya hasil tidak balapan.
- [**AC-6**](test.md#ac-6): e2e: cari nama table pada fixture 2000 table, hasil datang paginated cepat, lompat ke node bekerja, di kedua engine.

## Options considered

### Option 1: Pencarian per koneksi aktif (dipilih)

**Pros**:

- Sesuai FR (pencarian pada metadata yang provider dukung); sederhana; hak akses mengikuti koneksi.

**Cons**:

- Tidak lintas semua koneksi sekaligus; bisa jadi V2 bila dibutuhkan.

### Option 2: Pencarian lintas semua koneksi tersambung

**Pros**:

- Satu kotak untuk semuanya.

**Cons**:

- Menggandakan beban ke banyak server sekaligus dan mencampur hasil beda hak akses; tidak diminta FR.

## Decision

**Chosen option**: Option 1: pencarian per koneksi aktif (pilihan koneksi mengikuti konteks explorer), paginated, dengan lompat ke node.

## Rationale

FR-EXP-03 berbicara tentang katalog satu provider; per koneksi menjaga model hak akses dan beban jelas. Abort pada perubahan kueri adalah keharusan UX pencarian, bukan hiasan, karena hasil balapan di alat database menyesatkan.

## Feature design

**Data model sketch**: tidak ada tabel baru.

**API surface**:

| Endpoint                | Method | Key inputs                 | Key outputs                               | Auth                | Key errors                      |
| ----------------------- | ------ | -------------------------- | ----------------------------------------- | ------------------- | ------------------------------- |
| /connections/:id/search | GET    | q, types?, database?, page | items (ObjectRef plus tipe), page, total? | pemilik, tersambung | 409 NOT_CONNECTED, 422 q pendek |

**Value sourcing**:

| Action         | Value produced / displayed | Source                                                         |
| -------------- | -------------------------- | -------------------------------------------------------------- |
| hasil          | ObjectRef plus tipe        | provider searchObjects                                         |
| lompat ke node | jalur ekspansi             | ObjectRef (database, schema?, name) dipetakan ke node explorer |
| aksi langsung  | daftar aksi                | registry aksi spec 0031                                        |

**Key invariants**:

- Tidak ada jalur yang mengambil katalog penuh; hasil selalu paginated.
- Request pencarian lama selalu dibatalkan saat kueri baru dikirim.

**Security model**: kepemilikan koneksi dan keadaan tersambung; hasil mengikuti hak credential.

**Configuration required**: tidak ada.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. [x] Tambah operasi search ke kontrak, endpoint server di modul explorer, contract test, memenuhi **AC-1**, **AC-2**.
2. [x] UI kotak pencarian plus daftar hasil berkelompok dengan debounce, abort, pagination, keyboard, memenuhi **AC-3**, **AC-5**.
3. [x] Lompat ke node (ekspansi malas berjalur) dan aksi langsung lewat registry, memenuhi **AC-4**.
4. [x] E2e dua engine pada fixture besar, memenuhi **AC-6**.

## Consequences

**Positive**:

- Navigasi server besar menjadi praktis; melengkapi janji explorer.

**Negative / tradeoffs**:

- Pencarian substring pada katalog sangat besar bisa lambat di sisi server database; pagination dan minimal 2 karakter menahannya.

**Neutral**:

- Pencarian lintas koneksi dicatat sebagai kandidat V2.

## Follow-up

- [ ] Tidak ada.

## References

**Project sources**:

- v1-feature-specification.md FR-EXP-03, NFR-01; spec 0023, 0025, 0031.

**Practices & standards**:

- Debounce plus abort untuk pencarian; hasil paginated.

**Links**: tidak ada yang diverifikasi untuk spec ini.
