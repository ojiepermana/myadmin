# 0012. Package config

**Date**: 2026-08-28
**Status**: Proposed
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini membangun `packages/config`: satu loader konfigurasi tervalidasi untuk seluruh runtime. Konfigurasi dibaca dengan prioritas flag CLI, lalu environment variable, lalu file config TOML, lalu default; divalidasi sekali saat startup dan gagal jelas bila tidak valid. Setelah spec ini, tidak ada pembacaan `process.env` yang tersebar di fitur.

## Context

Struktur.md menetapkan config sebagai package dengan schema, loaders, defaults, dan redaction, dan menegaskan validasi terjadi saat startup, bukan tersebar di fitur. Sampai sekarang flag dan env dibaca langsung oleh CLI (spec 0006); jumlah setelan akan bertambah cepat (session TTL, batas upload, batas result, log level), dan tanpa loader tunggal setiap fitur akan menciptakan cara bacanya sendiri.

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0006.

## Requirements

**User stories**:
- Sebagai operator, saya ingin semua setelan bisa diatur lewat file config atau environment variable dengan dokumentasi yang jelas.
- Sebagai developer, saya ingin mengambil config bertipe dari satu tempat tanpa parsing sendiri.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): schema config terdefinisi bertipe dengan default untuk V1: `server.host`, `server.port`, `dataDir`, `session.idleTimeoutMinutes`, `session.absoluteTimeoutHours`, `security.secureCookies`, `log.level`, `limits.uploadMaxBytes`, `limits.resultMaxRows`, `history.maxEntriesPerUser`; setiap penambahan setelan baru wajib lewat schema ini.
- [**AC-2**](test.md#ac-2): prioritas sumber: flag CLI → environment variable (prefix `MYADMIN_`, pemetaan `MYADMIN_SERVER_PORT` ke `server.port`) → file `<data-dir>/config/config.toml` → default; sumber pemenang tiap nilai bisa dilaporkan untuk doctor.
- [**AC-3**](test.md#ac-3): file config tidak wajib ada; bila ada namun tidak valid (kunci tak dikenal, tipe salah, nilai di luar rentang), startup gagal dengan daftar kesalahan per kunci.
- [**AC-4**](test.md#ac-4): config yang sudah dimuat immutable dan tersedia lewat injection ke composition root; fitur menerima potongan config yang dibutuhkannya, bukan objek global.
- [**AC-5**](test.md#ac-5): dump config (untuk doctor dan log startup) melewati redaction: nilai yang ditandai sensitif di schema tersensor; `MYADMIN_MASTER_KEY` tidak pernah menjadi bagian schema config (tetap milik key provider).
- [**AC-6**](test.md#ac-6): doctor mendaftarkan check config: valid atau tidak, path file yang dipakai, dan sumber pemenang per kunci penting, tanpa nilai sensitif.
- [**AC-7**](test.md#ac-7): unit test menutup prioritas sumber, kegagalan validasi, pemetaan env, dan redaction dump.

## Options considered

### Option 1: File TOML (dipilih)

**Pros**:
- Nyaman ditulis operator, mendukung komentar, dan Bun mengimpor TOML native; cocok dengan `config/` di data directory.

**Cons**:
- Satu format lagi selain env; pemetaan kunci harus didokumentasikan.

### Option 2: File JSON

**Pros**:
- Tanpa parser tambahan di mana pun.

**Cons**:
- Tanpa komentar; pengalaman operator lebih buruk untuk file yang justru dibaca manusia.

## Decision

**Chosen option**: Option 1: TOML di `<data-dir>/config/config.toml`, schema tervalidasi dengan TypeBox (pustaka schema yang sama dengan ekosistem Elysia, satu bahasa schema di server), prioritas flag → env → file → default.

## Rationale

Config file untuk binary self hosted adalah antarmuka operator, maka format berkomentar menang. TypeBox dipilih supaya bahasa validasi di proyek tunggal (Elysia memakai TypeBox untuk validasi transport), mengurangi konsep. Prinsip fail fast saat startup mengikuti mandat struktur.md; pelaporan sumber pemenang membuat "kenapa port nya 9090" bisa dijawab doctor, bukan ditebak.

## Feature design

**Data model sketch**: tidak ada tabel; artefak file TOML dan tipe `MyadminConfig`.

**API surface**: tidak ada endpoint; permukaan modul `loadConfig(argv, env, filePath): MyadminConfig`.

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| loadConfig | nilai tiap kunci | flag → env → file → default (AC-2) |
| doctor check | sumber pemenang per kunci | metadata hasil loader |
| session TTL default | idle 720 menit (12 jam), absolut 168 jam (7 hari) | default schema; dipakai spec 0017 |
| limits default | uploadMaxBytes 512 MB, resultMaxRows 1000 | default schema; dipakai spec 0033, 0048 |

**Key invariants**:
- Tidak ada `process.env` atau parsing flag di luar package config dan entry CLI; boundary/lint menegakkan.
- Kunci tak dikenal di file adalah error, bukan diabaikan (menangkap salah ketik).

**Security model**: file config bisa berisi nilai sensitif di masa depan; field schema punya flag `sensitive` yang mengaktifkan redaction pada dump. V1 tidak menaruh secret apa pun di config file.

**Configuration required**: mendokumentasikan semua env `MYADMIN_*` yang dipetakan schema; tidak menambah di luar itu.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. Definisikan schema TypeBox plus default dan flag sensitif di `config/schema/`, memenuhi **AC-1**.
2. Bangun loader (flag, env mapping, TOML, merge berprioritas, immutability, metadata sumber) di `config/loaders/`, memenuhi **AC-2**, **AC-3**, **AC-4**.
3. Integrasikan redaction (spec 0011) untuk dump, memenuhi **AC-5**.
4. Pindahkan pembacaan host/port/dataDir CLI (spec 0006) ke loader ini; daftarkan doctor check, memenuhi **AC-2**, **AC-6**.
5. Unit test lengkap, memenuhi **AC-7**.

## Consequences

**Positive**:
- Setiap setelan baru punya rumah, dokumentasi, dan validasi otomatis; drift konfigurasi antar fitur hilang.

**Negative / tradeoffs**:
- Fitur harus mendeklarasikan setelannya di schema pusat; sedikit gesekan yang disengaja.

**Neutral**:
- Nilai default TTL dan limits di sini menjadi kontrak untuk spec 0017, 0033, 0048; mengubahnya berarti mengubah schema, bukan konstanta lokal.

## Follow-up

- [ ] Dokumentasi operator (spec 0055) memuat referensi lengkap kunci config dan env.

## References

**Project sources**:
- struktur.md pohon packages/config dan catatan "validasi terjadi ketika startup"; spec 0006 (flag awal), 0011 (redaction).

**Practices & standards**:
- Fail fast pada konfigurasi tidak valid; dua belas faktor untuk env override; config file sebagai antarmuka operator.

**Links**: tidak ada yang diverifikasi untuk spec ini.
