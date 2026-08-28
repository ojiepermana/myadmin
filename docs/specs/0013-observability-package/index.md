# 0013. Package observability

**Date**: 2026-08-28
**Status**: In Progress
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini membangun `packages/observability`: structured logging JSON dengan level, correlation ID per request yang mengalir otomatis, redaction terpasang di jalur keluar, dan metric counter dasar dalam memori. Setelah spec ini, setiap log dan error di server punya bentuk seragam, punya correlation ID yang juga dikirim ke klien lewat `ApiError`, dan tidak pernah memuat secret.

## Context

NFR-07 menuntut error penting punya structured, redacted log dengan correlation data; FR-OPS-02 menuntut browser menerima correlation ID; bagian 8.2 butir 4 mewajibkan redaction di seluruh observability. Sampai sekarang server memakai console apa adanya. Keputusan yang diambil di sini: pustaka logging dan mekanisme pengaliran correlation ID.

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0011 (redaction), 0012 (log level dari config).

## Requirements

**User stories**:
- Sebagai operator, saya ingin log JSON yang bisa dikirim ke alat log apa pun dan aman dibaca siapa pun.
- Sebagai pengguna yang melapor masalah, saya ingin menyebut satu ID dari pesan error yang bisa dicari operator di log.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): logger menghasilkan JSON lines ke stdout dengan field baku: `time`, `level`, `msg`, `correlationId` bila ada, `module`, plus konteks terstruktur; level dari config (`log.level`).
- [**AC-2**](test.md#ac-2): setiap request HTTP dan koneksi WebSocket mendapat correlation ID (UUIDv7) di middleware paling luar; ID mengalir otomatis lewat AsyncLocalStorage sehingga log di lapisan mana pun selama request itu memuatnya tanpa dioper manual.
- [**AC-3**](test.md#ac-3): correlation ID yang sama dikirim ke klien pada setiap `ApiError` (field `correlationId`), menyambungkan laporan pengguna ke log server.
- [**AC-4**](test.md#ac-4): seluruh keluaran logger melewati `Redaction.redactObject` (spec 0011) sebelum ditulis; test membuktikan objek berisi field password tersensor di output.
- [**AC-5**](test.md#ac-5): error handler transport tunggal mengubah error tak tertangani menjadi `ApiError` 500 dengan pesan generik plus correlation ID, dan menulis log level error berisi stack (tersensor); stack tidak pernah dikirim ke klien (FR-OPS-02).
- [**AC-6**](test.md#ac-6): metric counter dasar tersedia dalam memori (jumlah request per status, durasi kasar) dan bisa dibaca lewat modul; tanpa endpoint metrics publik di V1.
- [**AC-7**](test.md#ac-7): log juga ditulis ke file `<data-dir>/logs/myadmin.log` dengan rotasi sederhana berdasar ukuran (potong saat melebihi batas, simpan satu file sebelumnya); kegagalan menulis file tidak mematikan proses (stdout tetap jalan).

## Options considered

### Option 1: Logger tipis milik sendiri (dipilih)

**Pros**:
- Kendali penuh titik redaction (wajib, bukan opsional), nol dependency di jalur binary, kebutuhan V1 (JSON lines, level, file sederhana) kecil.

**Cons**:
- Fitur logger matang (transport, sampling) harus ditulis sendiri bila kelak perlu.

### Option 2: pino

**Pros**:
- Cepat, ekosistem redaction dan transport luas, teruji produksi.

**Cons**:
- Fitur redaction nya berbasis path yang harus disinkronkan dengan modul redaction milik kami (dua sumber kebenaran sensor); transport worker menambah kerumitan pada binary Bun Compile.

## Decision

**Chosen option**: Option 1: logger tipis milik sendiri dengan redaction wajib di jalur keluar, correlation lewat AsyncLocalStorage.

## Rationale

Aturan proyek menempatkan redaction sebagai pemilik tunggal sensor (spec 0011); logger pihak ketiga akan menduplikasi kebijakan sensor di konfigurasi terpisah, persis kegagalan yang ingin dihindari bagian 8.2. Kebutuhan logging V1 sengaja kecil (JSON lines plus file lokal), sehingga biaya menulis sendiri lebih rendah daripada biaya integrasi yang salah. Correlation lewat AsyncLocalStorage dipilih supaya modul dalam (use case, provider) tidak perlu tahu tentang request.

## Feature design

**Data model sketch**: tidak ada tabel.

**API surface**: tidak ada endpoint; permukaan modul `createLogger(module)`, `withCorrelation(id, fn)`, `metrics.increment(name, tags)`.

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| log entry | correlationId | AsyncLocalStorage, di set middleware transport |
| ApiError | correlationId | nilai yang sama dari storage request itu |
| log level | ambang | config `log.level` (spec 0012) |
| rotasi file | batas ukuran | konstanta modul (50 MB), bukan config V1 |

**Key invariants**:
- Tidak ada `console.log` langsung di kode server dan package (lint menegakkan); semua lewat logger.
- Redaction tidak bisa dilewati: fungsi tulis internal satu satunya sudah menyensor.
- Correlation ID di response error selalu sama dengan yang tercatat di log request itu.

**Security model**: log adalah permukaan bocor utama; kontrolnya AC-4 dan larangan stack ke klien (AC-5). File log mewarisi permission data directory.

**Configuration required**: memakai `log.level` dari spec 0012; tidak menambah env baru.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. [x] Bangun logger inti (level, JSON lines, modul, penulis stdout plus file dengan rotasi), memenuhi **AC-1**, **AC-7**.
2. [x] Bangun correlation (AsyncLocalStorage, generator UUIDv7) dan middleware transport yang memasangnya, memenuhi **AC-2**.
3. [x] Pasang redaction wajib pada fungsi tulis, memenuhi **AC-4**.
4. [x] Bangun error handler transport tunggal yang memancarkan `ApiError` 500 generik plus log stack tersensor, memenuhi **AC-3**, **AC-5**.
5. [x] Bangun metric counter dasar, memenuhi **AC-6**.
6. [x] Tambahkan aturan lint larangan console langsung; unit test seluruh AC.

## Consequences

**Positive**:
- Setiap laporan bug pengguna bisa ditelusuri ke log lewat satu ID; syarat NFR-07 dan FR-OPS-02 selesai di fondasi, bukan per fitur.

**Negative / tradeoffs**:
- Logger sendiri berarti tanpa ekosistem transport siap pakai; ekspor ke sistem log eksternal menjadi urusan operator (membaca stdout/file).

**Neutral**:
- Metric belum diekspos keluar; V2 bisa menambah endpoint atau format ekspor bila dibutuhkan.

## Follow-up

- [ ] Spec 0019 (audit) memakai correlation ID yang sama supaya audit dan log saling terhubung.

## References

**Project sources**:
- v1-feature-specification.md NFR-07, FR-OPS-02, bagian 8.2 butir 4; struktur.md pohon packages/observability.
- Spec 0011 (redaction), 0012 (config).

**Practices & standards**:
- Structured logging JSON lines; correlation ID lintas lapisan lewat context implicit; pesan error generik ke klien, detail ke log.

**Links**: tidak ada yang diverifikasi untuk spec ini.
