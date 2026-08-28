# 0051. Monitoring status dasar

**Date**: 2026-08-28
**Status**: In Progress
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini membangun halaman monitoring V1 sesuai scope yang dikunci di sesi desain: status dasar saja. Isinya panel per koneksi berisi status sambungan, versi dan info server, latency terkini dan riwayat singkat sesi ini, durasi operasi terakhir, dan error terakhir yang ternormalisasi. Active sessions, running queries, lock, dan dashboard adalah V2 dan tidak dibangun di sini.

## Context

Kontradiksi scope monitoring antara tiga dokumen diputuskan pemilik proyek 2026-08-28: mengikuti v1-feature-specification (FR-OPS-01), bukan struktur.md yang menyebut sessions/query/lock. Sumber datanya sudah ada semua: registry status dan server info (spec 0027), push status (spec 0029), durasi operasi dari eksekusi (spec 0033), error ternormalisasi di seluruh jalur. `MonitoringPort.statusInfo` (spec 0021) melengkapi info ringan yang belum diambil saat connect (uptime bila murah).

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0027.

## Requirements

**User stories**:

- Sebagai pengguna, saya ingin satu tempat melihat kesehatan semua koneksi saya: tersambung atau tidak, versi apa, seberapa responsif.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): halaman monitoring menampilkan kartu per koneksi milik user: label, engine dan versi, status kini (push dari `connections.status`), latency test terakhir dan grafik kecil riwayat latency sesi ini (data klien, tidak dipersist), waktu tersambung sejak, dan error terakhir (kategori plus waktu) bila ada.
- [**AC-2**](test.md#ac-2): `GET /connections/:id/status-info` (koneksi tersambung) mengembalikan info ringan dari `MonitoringPort.statusInfo`: versi lengkap, uptime server bila tersedia murah, nama database aktif; tanpa query berat, tanpa daftar sesi.
- [**AC-3**](test.md#ac-3): tombol "uji sekarang" per kartu menjalankan ping/test dan memperbarui latency (rate limited ringan); durasi operasi terakhir per koneksi (query, connect) tampil dari data yang sudah dilaporkan fitur lain.
- [**AC-4**](test.md#ac-4): tidak ada permintaan berkala berat: pembaruan lewat push status; latency diambil hanya saat connect, test manual, atau operasi berjalan (FR-OPS-01 tanpa dashboard polling).
- [**AC-5**](test.md#ac-5): tidak ada data sensitif: tanpa connection string, tanpa credential, tanpa isi query di halaman ini (FR-OPS-01).
- [**AC-6**](test.md#ac-6): halaman menyatakan batas V1 dengan kalimat kecil ("Monitor sesi dan query berjalan hadir di versi berikutnya") supaya ekspektasi jelas, sesuai prinsip menjelaskan ketidaktersediaan.
- [**AC-7**](test.md#ac-7): e2e: kartu mencerminkan connect/disconnect/error secara langsung; uji sekarang memperbarui latency; tanpa request berkala di network log selain push WS.

## Options considered

### Option 1: Kartu status berbasis data yang sudah ada (dipilih)

**Pros**:

- Nol beban baru ke server target; memenuhi FR-OPS-01 persis; cepat dibangun di atas spec 0027/0029.

**Cons**:

- Halaman sederhana; memang itu scope nya.

### Option 2: Menambah sebagian data sesi/aktivitas

**Pros**:

- Lebih kaya.

**Cons**:

- Persis yang diputuskan V2; menambah query katalog aktivitas dan izin yang belum dirancang.

## Decision

**Chosen option**: Option 1: halaman status dasar dari sumber yang ada plus `statusInfo` ringan; batas V1 dinyatakan di UI.

## Rationale

Keputusan scope monitoring sudah final; nilai spec ini adalah merangkum kesehatan koneksi di satu tempat tanpa membuka pintu beban monitoring yang belum dirancang. Riwayat latency disimpan hanya di memori klien karena mempersistnya berarti time series, kelas fitur V2 (metric history dinyatakan V2 di bagian 11).

## Feature design

**Data model sketch**: tidak ada tabel; riwayat latency array kecil per koneksi di store klien.

**API surface**:

| Endpoint                     | Method | Key inputs | Key outputs                    | Auth                | Key errors        |
| ---------------------------- | ------ | ---------- | ------------------------------ | ------------------- | ----------------- |
| /connections/:id/status-info | GET    | tidak ada  | versi, uptime?, database aktif | pemilik, tersambung | 409 NOT_CONNECTED |

**Value sourcing**:

| Action         | Value produced / displayed | Source                                         |
| -------------- | -------------------------- | ---------------------------------------------- |
| status kini    | state                      | push `connections.status` (spec 0029)          |
| versi, uptime  | nilai                      | MonitoringPort.statusInfo provider             |
| latency        | ms                         | hasil test/connect (spec 0027) plus uji manual |
| error terakhir | kategori, waktu            | registry status                                |

**Key invariants**:

- Halaman tidak memicu polling berkala; semua pembaruan event driven atau atas aksi pengguna.
- Tanpa data sensitif (AC-5).

**Security model**: hanya koneksi milik user; statusInfo lewat hak credential koneksi.

**Configuration required**: tidak ada.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. [x] Implementasikan `MonitoringPort.statusInfo` ringan di kedua provider plus endpoint, kontrak, contract test, memenuhi **AC-2**.
2. [x] UI halaman monitoring (kartu, grafik latency kecil, uji sekarang, pernyataan batas V1), memenuhi **AC-1**, **AC-3**, **AC-6**.
3. [x] E2e reaktivitas dan kebersihan network membuktikan tidak ada polling berat, memenuhi **AC-4**, **AC-7**; review data sensitif memenuhi **AC-5**.

## Consequences

**Positive**:

- FR-OPS-01 selesai; kontradiksi monitoring tertutup dengan implementasi yang eksplisit batasnya.

**Negative / tradeoffs**:

- Pengguna yang mengharapkan process watcher belum mendapatkannya; kalimat batas V1 mengelola ekspektasi.

**Neutral**:

- Struktur folder monitoring siap menampung V2 tanpa mengubah halaman ini.

## Follow-up

- [ ] Perbarui struktur.md tabel fitur: deskripsi monitoring V1 dikoreksi menjadi status dasar (kontradiksi yang diputuskan 2026-08-28).

## References

**Project sources**:

- Keputusan monitoring V1 sesi desain 2026-08-28; v1-feature-specification.md FR-OPS-01, bagian 11; spec 0021, 0027, 0029.

**Practices & standards**:

- Event driven daripada polling; batas fitur dinyatakan di UI.

**Links**: tidak ada yang diverifikasi untuk spec ini.
