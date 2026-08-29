# 0038. Data browser: jalur tulis

**Date**: 2026-08-28
**Status**: In Progress
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini menambah penyuntingan data pada tab data browser: insert baris, edit sel dengan editor bertipe (termasuk NULL dan JSON), delete dan bulk delete dengan konfirmasi berjumlah, semua lewat identitas baris yang aman (primary key atau unique index NOT NULL). Table tanpa identitas baris yang aman tetap read only dengan penjelasan.

## Context

FR-DATA-03: type conversion, NULL, JSON, perilaku binary safe, dan identitas baris ditangani provider; edit dan delete hanya bila identitas baris aman; delete perlu confirmation, jumlah affected rows, dan audit. Ini fitur pertama yang menulis ke data pengguna, jadi pola safety nya (identitas, konfirmasi, affected count, audit) menjadi contoh untuk designer dan operasi destructive lain.

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0037, 0019 (audit).

## Requirements

**User stories**:

- Sebagai pengguna, saya ingin memperbaiki beberapa baris data langsung dari browser dengan aman, dan tahu persis berapa baris yang berubah.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): kelayakan edit ditentukan server per table: `rowIdentity` = primary key, atau unique index semua kolomnya NOT NULL; tanpa itu, response read (spec 0037) menandai read only dengan alasan, dan UI menonaktifkan penyuntingan dengan penjelasan (FR-DATA-03).
- [**AC-2**](test.md#ac-2): `POST /data/rows` insert satu baris: nilai per kolom bertipe (bentuk sel berlabel tipe), kolom default/identity bisa dibiarkan; sukses mengembalikan baris hasil (nilai default terisi) dan grid menampilkannya.
- [**AC-3**](test.md#ac-3): `PATCH /data/rows` update: identitas baris (nilai kolom identity saat dibaca) plus perubahan kolom; provider membangun UPDATE berparameter dengan WHERE identitas penuh; affected rows wajib tepat 1, selain itu operasi dibatalkan (0 berarti baris berubah/hilang: konflik 409 dengan saran muat ulang; lebih dari 1 mustahil oleh identitas dan menjadi error internal yang membatalkan).
- [**AC-4**](test.md#ac-4): `POST /data/rows/delete` menerima daftar identitas baris; UI meminta konfirmasi menyebut jumlah dan target (table, koneksi); response memuat affected rows; bulk delete dari seleksi grid memakai jalur yang sama (FR-DATA-03, FR-SAFE-01).
- [**AC-5**](test.md#ac-5): editor sel bertipe: teks multiline, angka dengan validasi, boolean, tanggal/waktu dengan input terstruktur, enum dari tipe bila diketahui, JSON lewat editor JSON dengan validasi sintaks, set NULL eksplisit (berbeda dari string kosong); nilai biner tidak bisa diedit di V1 (ditampilkan read only, sesuai BLOB viewer V2).
- [**AC-6**](test.md#ac-6): konversi tipe dan binary safety milik provider: nilai dikirim bertipe dan di bind sebagai parameter; kegagalan konversi menghasilkan 422 dengan pesan kolom spesifik.
- [**AC-7**](test.md#ac-7): delete dan bulk delete diaudit (`data.rows_deleted`: table, jumlah, tanpa isi baris); insert dan update tidak diaudit default (bukan destructive; bagian 4.4 butir 6), namun tercatat di history? tidak, history khusus query editor; keputusan: insert/update tidak diaudit V1, konsisten definisi destructive bagian 2.
- [**AC-8**](test.md#ac-8): seluruh mutasi berjalan pada sesi khusus singkat (bukan sesi tab query) dalam transaksi per operasi; bulk delete satu transaksi (semua atau tidak sama sekali) dengan laporan jumlah.
- [**AC-9**](test.md#ac-9): e2e kedua engine: insert, edit sel (termasuk set NULL dan JSON), delete satu baris, bulk delete dengan konfirmasi; table tanpa PK terbukti read only dengan penjelasan; test konflik update baris yang sudah berubah.

## Options considered

### Option 1: Optimistic concurrency lewat identitas plus affected count (dipilih)

**Pros**:

- Tanpa kolom versi yang tidak kita miliki di table orang; konflik terdeteksi lewat affected 0 dan WHERE identitas.

**Cons**:

- Perubahan kolom non identitas oleh pihak lain di antara baca dan tulis tidak terdeteksi (last write wins pada kolom yang diubah); dinyatakan di UI lewat saran muat ulang saat konflik identitas.

### Option 2: WHERE atas seluruh nilai lama baris

**Pros**:

- Mendeteksi semua perubahan pihak lain.

**Cons**:

- Rapuh pada tipe pembanding (float, JSON, timezone) lintas engine; kegagalan palsu membingungkan; kompleksitas tinggi.

## Decision

**Chosen option**: Option 1: WHERE identitas penuh plus kewajiban affected tepat 1, transaksi per operasi, konfirmasi berjumlah untuk delete.

## Rationale

Kita menyunting table milik pengguna yang bentuknya tidak kita kendalikan; identitas kuat (PK/unique NOT NULL) adalah satu satunya dasar aman, dan FR menyebutnya eksplisit. Pembandingan seluruh baris (Option 2) terlihat lebih aman tapi gagal palsu lintas tipe engine akan mengajari pengguna mengabaikan peringatan. Insert dan update tidak diaudit mengikuti definisi destructive dokumen; delete diaudit karena menghapus data.

## Feature design

**Data model sketch**: tidak ada tabel internal baru.

**API surface**:

| Endpoint          | Method | Key inputs                           | Key outputs   | Auth                | Key errors                                               |
| ----------------- | ------ | ------------------------------------ | ------------- | ------------------- | -------------------------------------------------------- |
| /data/rows        | POST   | connectionId, ref, values            | row           | pemilik, tersambung | 422 konversi/constraint, DbError                         |
| /data/rows        | PATCH  | connectionId, ref, identity, changes | row, affected | pemilik             | 409 konflik (affected 0), 422                            |
| /data/rows/delete | POST   | connectionId, ref, identities[]      | affected      | pemilik             | 409 sebagian tidak ditemukan (transaksi dibatalkan), 422 |

**Value sourcing**:

| Action         | Value produced / displayed | Source                                            |
| -------------- | -------------------------- | ------------------------------------------------- |
| kelayakan edit | rowIdentity                | describeTable (PK/unique NOT NULL) di server      |
| update WHERE   | nilai identitas            | nilai baris saat dibaca (dibawa klien apa adanya) |
| affected       | jumlah                     | hasil eksekusi provider                           |
| editor enum    | pilihan                    | metadata tipe kolom bila tersedia                 |

**Key invariants**:

- Tidak ada mutasi tanpa identitas baris aman (AC-1).
- Update selalu affected tepat 1 atau dibatalkan (AC-3); bulk delete atomik (AC-8).
- Semua nilai lewat parameter bind; konstruksi SQL milik provider.

**Security model**: hak tulis mengikuti credential koneksi; konfirmasi destructive menyebut target spesifik (FR-SAFE-01); delete diaudit tanpa isi baris (bagian 8.2 butir 8).

**Configuration required**: tidak ada.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. [x] Tambahkan penentuan rowIdentity ke response read dan kontrak, memenuhi **AC-1**.
2. [x] Implementasikan insert/update/delete berparameter di provider `data/` kedua engine plus affected semantics dan transaksi, test integrasi, memenuhi **AC-2**, **AC-3**, **AC-4**, **AC-6**, **AC-8**.
3. [x] Endpoint server plus audit delete lewat `withAudit`, memenuhi **AC-4**, **AC-7**.
4. [x] UI: mode edit grid (editor sel bertipe, baris baru, seleksi dan hapus dengan konfirmasi berjumlah, banner read only dengan alasan), memenuhi **AC-1**, **AC-2**, **AC-4**, **AC-5**.
5. E2e dua engine plus test konflik, memenuhi **AC-9**.

## Consequences

**Positive**:

- Perbaikan data harian tanpa menulis SQL; pola mutasi aman terbentuk untuk fitur destructive lain.

**Negative / tradeoffs**:

- Last write wins pada kolom saat identitas tetap; jujur dan sepadan dibanding kegagalan palsu Option 2.

**Neutral**:

- Penyuntingan view dan BLOB ditunda (V2) sesuai scope.

## Follow-up

- [ ] Tidak ada.

## References

**Project sources**:

- v1-feature-specification.md FR-DATA-03, FR-SAFE-01, bagian 2 (definisi destructive), 8.2 butir 8; spec 0019, 0037.

**Practices & standards**:

- Mutasi hanya lewat identitas kuat; affected count sebagai deteksi konflik; konfirmasi menyebut jumlah dan target.

**Links**: tidak ada yang diverifikasi untuk spec ini.
