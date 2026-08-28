# 0037. Data browser: jalur baca

**Date**: 2026-08-28
**Status**: Proposed
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini membangun sisi baca data browser: membuka table atau view sebagai tab data dengan pagination server side, sort multi kolom, filter terstruktur per kolom, pencarian teks, dan pemilihan kolom, semuanya diterjemahkan provider menjadi SQL berparameter. Tidak ada tabel besar yang pernah dimuat penuh ke klien. Penyuntingan data menyusul di spec 0038.

## Context

FR-DATA-01 dan FR-DATA-02: pagination server side (page/cursor, total atau estimate, limit, filter, sort, selected columns), semua parameter divalidasi dan diterjemahkan provider, tidak disusun dari input bebas yang bisa mengubah maksud query. NFR-01 menegaskan bukti test bahwa initial load tidak menarik tabel besar. ResultGrid siap dipakai ulang (spec 0034); metadata kolom tersedia (describeTable).

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0031 (pintu masuk explorer), 0034 (grid).

## Requirements

**User stories**:
- Sebagai pengguna, saya ingin membuka table jutaan baris dan menelusurinya per halaman dengan filter dan sort tanpa membekukan apa pun.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): `POST /data/read` menerima { connectionId, ref (ObjectRef table/view), page { limit, offset }, sort[] (kolom plus arah), filters[], search?, columns? } dan mengembalikan baris (bentuk sel berlabel tipe, spec 0033 AC-8), total atau estimate berlabel jenisnya, dan metadata kolom; limit maksimum 500, default 100.
- [**AC-2**](test.md#ac-2): filter terstruktur per kolom dengan operator sesuai tipe dari daftar tertutup: `= != > >= < <=` untuk angka dan tanggal, `contains startsWith endsWith` untuk teks, `is null / is not null` semua tipe, `in` daftar nilai; provider menerjemahkan ke SQL berparameter dengan quoting identifier terpusat; operator di luar daftar ditolak 422 (FR-DATA-02).
- [**AC-3**](test.md#ac-3): pencarian teks bebas diterapkan sebagai OR `contains` atas kolom teks yang dipilih (default semua kolom teks yang terlihat), tetap berparameter.
- [**AC-4**](test.md#ac-4): sort multi kolom stabil: sort pengguna selalu ditambah tie breaker primary key (bila ada) supaya pagination konsisten antar halaman.
- [**AC-5**](test.md#ac-5): total baris: COUNT tepat dijalankan hanya bila murah (di bawah ambang provider) atau diminta eksplisit; selain itu estimate katalog berlabel "perkiraan"; UI menampilkan jenisnya jujur.
- [**AC-6**](test.md#ac-6): tab data memakai ResultGrid mode data browser: header filter per kolom, panel filter aktif (chip yang bisa dihapus), pemilih kolom, navigasi halaman (nomor, ukuran halaman), indikator loading tanpa mengunci UI; konteks tab (koneksi, ref) eksplisit dan ikut workspace persistence.
- [**AC-7**](test.md#ac-7): view dibuka jalur yang sama secara read only (penyuntingan tidak ditawarkan untuk view di V1).
- [**AC-8**](test.md#ac-8): test NFR-01: membuka table fixture 1 juta baris hanya menghasilkan query berhalaman (dibuktikan log statement server test) dan waktu muat halaman pertama wajar; test injeksi: nilai filter berbahaya tidak mengubah bentuk query.
- [**AC-9**](test.md#ac-9): e2e kedua engine: buka dari explorer, filter, sort, pilih kolom, pindah halaman.

## Options considered

### Option 1: Pagination offset dengan tie breaker PK (dipilih)

**Pros**:
- Model halaman bernomor yang diminta FR (page, limit); sederhana untuk sort dan filter bebas; tie breaker menstabilkan.

**Cons**:
- Offset dalam jauh lambat di tabel raksasa; diterima untuk pola pemakaian browse, dan keyset menjadi optimasi V2 bila terbukti perlu.

### Option 2: Keyset pagination

**Pros**:
- Cepat konsisten di kedalaman mana pun.

**Cons**:
- Tidak cocok dengan lompat ke halaman N dan sort multi kolom bebas; kompleksitas tinggi untuk kebutuhan browse interaktif.

## Decision

**Chosen option**: Option 1: offset plus tie breaker PK, dengan batas limit dan total yang jujur (tepat atau perkiraan berlabel).

Endpoint `POST /data/read` (POST karena badan filter kompleks), penerjemahan filter sepenuhnya di provider `data/` (basis: FR-DATA-01, 02; NFR-01).

## Rationale

FR meminta model halaman eksplisit; offset dengan tie breaker memenuhi itu dengan perilaku yang bisa dijelaskan. Ancaman utama fitur ini adalah penyusunan SQL dari input klien; daftar operator tertutup plus penerjemahan provider berparameter membuat klien tidak pernah mengirim fragmen SQL, hanya struktur data. Kejujuran total (tepat vs perkiraan) mencegah COUNT jutaan baris diam diam yang membekukan server.

## Feature design

**Data model sketch**: tidak ada tabel internal; bentuk request/response di kontrak.

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| /data/read | POST | connectionId, ref, page, sort[], filters[], search?, columns? | rows, columnsMeta, total { value, kind: exact|estimate } | pemilik, tersambung | 409 NOT_CONNECTED, 422 filter/op tidak valid, DbError |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| rows | nilai sel berlabel tipe | provider DataPort.page |
| columnsMeta | tipe, nullable, pk | describeTable (cache metadata) |
| total | nilai plus jenis | COUNT bila murah/diminta; selain itu estimate katalog |
| operator tersedia per kolom | daftar | pemetaan tipe kolom → operator, di satu modul UI/kontrak |

**Key invariants**:
- Klien tidak pernah mengirim SQL untuk jalur ini; hanya struktur filter/sort dari daftar tertutup.
- Setiap query data berhalaman; tidak ada jalur tanpa limit (NFR-01).
- Sort selalu deterministik (tie breaker).

**Security model**: hak baca mengikuti credential koneksi; pemilik koneksi saja. Nilai filter bisa sensitif; tidak dicatat di log melebihi bentuk tersensor.

**Configuration required**: tidak ada baru (limit maksimum konstanta kontrak).

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. Definisikan bentuk read (filter, sort, page, total berlabel) di kontrak, regenerasi, contract test, memenuhi **AC-1**, **AC-2**.
2. Implementasikan penerjemah filter/sort/pagination di provider `data/` kedua engine (berparameter, quoting terpusat, tie breaker, strategi total) dengan test unit dan integrasi, memenuhi **AC-2** sampai **AC-5**.
3. Endpoint server plus validasi, memenuhi **AC-1**.
4. UI tab data: ResultGrid mode browser, filter per kolom, chip filter, pemilih kolom, pagination, konteks tab serializable, memenuhi **AC-6**, **AC-7**.
5. Test NFR-01, injeksi, dan e2e dua engine, memenuhi **AC-8**, **AC-9**.

## Consequences

**Positive**:
- Menelusuri data nyata menjadi aman dan responsif; fondasi jalur tulis (spec 0038) dan export selection (0047).

**Negative / tradeoffs**:
- Offset dalam lambat pada tabel raksasa; jujur ditampilkan lewat waktu muat, dengan keyset sebagai optimasi masa depan.

**Neutral**:
- Operator filter bisa bertambah di V2 tanpa mengubah arsitektur (daftar tertutup diperluas).

## Follow-up

- [ ] Spec 0038 menumpangkan penyuntingan pada tab data ini.

## References

**Project sources**:
- v1-feature-specification.md FR-DATA-01, FR-DATA-02, NFR-01; spec 0023, 0025, 0033 (bentuk sel), 0034.

**Practices & standards**:
- Filter sebagai struktur data, bukan SQL; pagination deterministik; kejujuran biaya COUNT.

**Links**: tidak ada yang diverifikasi untuk spec ini.
