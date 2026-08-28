# 0035. Query cancel dan EXPLAIN

**Date**: 2026-08-28
**Status**: Proposed
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini menambah dua kemampuan pada model eksekusi query: membatalkan eksekusi yang sedang berjalan lewat mekanisme cancel provider (pg_cancel_backend, KILL QUERY), dengan status akhir yang jujur; dan EXPLAIN dasar yang menampilkan rencana eksekusi berbentuk teks untuk statement yang dipilih, digerbangi capability.

## Context

FR-QRY-04: cancel diarahkan ke provider dan koneksi yang tepat; UI menyatakan cancelled, failed, atau completed tanpa mengganti hasil tab lain. FR-QRY-07: EXPLAIN dasar bila capability mendukung, tanpa mengklaim graphical explain (V2). Infrastruktur cancel per provider sudah dibangun (spec 0022 AC-7, 0024 AC-6); model eksekusi asinkron dengan executionId dan sesi per tab sudah ada (spec 0033); tombol cancel digerbangi capability `cancelQuery` (bagian 10).

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0033.

## Requirements

**User stories**:
- Sebagai pengguna, saya ingin menghentikan query yang terlanjur berat tanpa menutup aplikasi.
- Sebagai pengguna, saya ingin melihat rencana eksekusi query sebelum menjalankannya pada data besar.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): `POST /query/executions/:id/cancel` (pemilik saja) memicu cancel provider pada sesi tab eksekusi itu; state menjadi `cancelling` lalu `cancelled` saat provider mengonfirmasi (statement berakhir dengan kategori `cancelled`); statement yang keburu selesai sebelum cancel tiba tetap `completed` dan dilaporkan apa adanya (FR-QRY-04).
- [**AC-2**](test.md#ac-2): cancel menarget tepat: hanya statement aktif eksekusi itu; eksekusi dan tab lain tidak terpengaruh; hasil statement yang sudah selesai pada eksekusi yang sama tetap utuh.
- [**AC-3**](test.md#ac-3): tombol cancel di UI hanya aktif saat ada eksekusi berjalan dan `capabilities.cancelQuery` true (bagian 10); state akhir tampil eksplisit: cancelled (dengan statement ke berapa), failed, atau completed.
- [**AC-4**](test.md#ac-4): race tertangani: cancel pada eksekusi yang sudah selesai menjawab state final tanpa error; dua cancel beruntun idempotent.
- [**AC-5**](test.md#ac-5): EXPLAIN: aksi "Explain" menjalankan rencana untuk statement terpilih (atau statement di kursor) lewat `POST /query/explain` { connectionId, database, schema?, sql }: PostgreSQL memakai `EXPLAIN (FORMAT TEXT)`, MySQL memakai `EXPLAIN FORMAT=TRADITIONAL` (detail per engine hidup di provider); hasil tampil sebagai panel teks monospace di area hasil, tanpa klaim visual plan (FR-QRY-07).
- [**AC-6**](test.md#ac-6): EXPLAIN digerbangi `capabilities.explain`; statement non EXPLAINable (DDL tertentu) mengembalikan error ternormalisasi yang dijelaskan UI; EXPLAIN tidak mengeksekusi datanya (tanpa ANALYZE di V1).
- [**AC-7**](test.md#ac-7): cancel dan explain melalui sesi tab yang sama (konsisten dengan konteks transaksi); explain tidak merusak transaksi aktif.
- [**AC-8**](test.md#ac-8): integration test kedua engine: query tidur panjang dibatalkan cepat dan status akhir benar; explain menghasilkan teks rencana; e2e tombol cancel dan explain.

## Options considered

### Option 1: Cancel lewat perintah server dari koneksi kontrol (dipilih)

**Pros**:
- Sudah dibangun dan terbukti di provider (spec 0022, 0024); tidak bergantung API driver.

**Cons**:
- Butuh koneksi kontrol singkat; biaya kecil dan hanya saat cancel.

### Option 2: Menutup paksa sesi tab

**Pros**:
- Selalu menghentikan.

**Cons**:
- Membunuh session state (transaksi, temp table) padahal pengguna hanya ingin menghentikan satu statement; jadi jalur darurat saja bila cancel gagal (ditawarkan UI sebagai "putuskan sesi" terpisah dengan konfirmasi).

## Decision

**Chosen option**: Option 1 sebagai jalur utama, dengan "putuskan sesi tab" sebagai aksi darurat terpisah dan eksplisit.

EXPLAIN dasar berbentuk teks per engine di provider `query/` (basis: FR-QRY-07; graphical explain dinyatakan V2 di feature.md dan bagian 11).

## Rationale

Cancel yang mempertahankan sesi adalah perilaku yang diharapkan dari alat kelas ini; menutup sesi sebagai jalan utama akan menghukum pengguna yang sedang bertransaksi. Race antara selesai dan cancel tidak bisa dihilangkan, maka kontraknya dibuat jujur: state akhir yang dilaporkan adalah yang benar benar terjadi di server, sesuai FR-QRY-04 yang meminta pernyataan status tanpa ambigu. EXPLAIN teks dipilih karena bernilai tinggi dengan biaya kecil; ANALYZE ditunda karena mengeksekusi query sungguhan dan pantas dirancang sendiri di V2.

## Feature design

**Data model sketch**: tidak ada tabel baru; menambah state `cancelling` pada model eksekusi (spec 0033).

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| /query/executions/:id/cancel | POST | tidak ada | state | pemilik | 404 |
| /query/explain | POST | connectionId, database, schema?, sql | planText, engine, durasi | pemilik, tersambung | 409 NOT_CONNECTED, unsupported |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| cancel | target backend | backendPid / connectionId sesi tab (spec 0022, 0024) |
| state akhir | cancelled/failed/completed | hasil nyata statement dari provider |
| explain | planText | provider menjalankan bentuk EXPLAIN engine nya |
| gerbang UI | cancelQuery, explain | capability koneksi |

**Key invariants**:
- Cancel tidak pernah menutup sesi tab (kecuali aksi darurat eksplisit); transaksi aktif tetap milik pengguna.
- State yang dilaporkan selalu hasil konfirmasi provider, bukan asumsi optimis klien.
- EXPLAIN tidak pernah menjalankan varian ANALYZE di V1.

**Security model**: cancel dan explain hanya pemilik eksekusi/koneksi; explain berjalan dengan hak credential koneksi.

**Configuration required**: tidak ada.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. Tambah operasi cancel dan explain ke kontrak, regenerasi, contract test.
2. Implementasi cancel di use case query (state cancelling, konfirmasi provider, idempotensi) plus event WS state, memenuhi **AC-1**, **AC-2**, **AC-4**.
3. Implementasi explain di provider `query/` masing masing engine plus endpoint, memenuhi **AC-5**, **AC-6**, **AC-7**.
4. UI: tombol cancel bergerbang capability dengan state jelas, aksi darurat putuskan sesi (konfirmasi), panel explain teks, memenuhi **AC-3**, **AC-5**.
5. Integration dan e2e dua engine, memenuhi **AC-8**.

## Consequences

**Positive**:
- Dua FR query tersisa (04, 07) selesai; pengguna aman bereksperimen pada data besar.

**Negative / tradeoffs**:
- Cancel kooperatif tidak instan pada operasi tertentu; jalur darurat menutup celah dengan biaya sesi.

**Neutral**:
- EXPLAIN ANALYZE dan visual plan tercatat V2.

## Follow-up

- [ ] Tidak ada.

## References

**Project sources**:
- v1-feature-specification.md FR-QRY-04, FR-QRY-07, bagian 10 (cancelQuery), bagian 11; spec 0022, 0024, 0033.

**Practices & standards**:
- Cancel berbasis protokol server; pelaporan state berbasis konfirmasi.

**Links**: tidak ada yang diverifikasi untuk spec ini.
