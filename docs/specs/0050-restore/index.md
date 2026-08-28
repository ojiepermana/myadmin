# 0050. Restore

**Date**: 2026-08-28
**Status**: Proposed
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini membangun restore logical backup: memilih artefak dari folder backups atau mengunggah file dump, memvalidasi artefak, konfirmasi destructive paling ketat di produk (restore menimpa data), lalu menjalankan native tool (psql/pg_restore, mysql) sebagai job dengan progress, cancel, dan audit. Restore adalah pasangan dari spec 0049 dan memakai deteksi tool serta pola credential yang sama.

## Context

FR-BKR-01: restore dengan progress, error, confirmation, dan audit; validation artefak sebelum operasi. Restore adalah operasi destructive terbesar (menimpa isi database), maka konfirmasinya memakai standar tertinggi: ketik nama database target plus pernyataan dampak. Ketersediaan tool dan capability mengikuti spec 0049.

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0049.

## Requirements

**User stories**:
- Sebagai pengguna, saya ingin memulihkan database dari backup dengan kepastian file nya valid dan kesadaran penuh bahwa data kini akan tertimpa.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): sumber restore: artefak milik user dari folder backups, atau file yang diunggah (jalur upload spec 0048, tipe sql/sql.gz); validasi sebelum konfirmasi: sniff format (SQL dump plain atau gzip), deteksi engine asal dari header dump bila ada, dan penolakan dini dump yang engine nya tidak cocok dengan koneksi target (dengan pesan jelas).
- [**AC-2**](test.md#ac-2): target restore: koneksi plus database tujuan; opsi: restore ke database yang ada (menimpa object bentrok sesuai isi dump) atau buat database baru dulu lalu restore ke sana (jalur yang disarankan UI); tanpa opsi drop database otomatis di V1.
- [**AC-3**](test.md#ac-3): konfirmasi destructive maksimum: dialog menyebut koneksi, database target, sumber artefak, dan kalimat dampak; pengguna mengetik nama database target; server memverifikasi `confirmName` (FR-SAFE-01); tanpa jalur pintas API.
- [**AC-4**](test.md#ac-4): eksekusi: job menjalankan tool (PostgreSQL: psql untuk dump plain; MySQL: mysql client) membaca file streaming (gunzip bila perlu); password lewat mekanisme aman (pola spec 0049); progress dari byte terproses; error tool dihentikan pada kegagalan pertama dengan stderr tersensor dan posisi bila tersedia; cancel membunuh subprocess dan menyatakan keadaan database mungkin parsial dengan jelas.
- [**AC-5**](test.md#ac-5): hasil job memuat ringkasan (durasi, byte, exit code); restore sukses dan gagal diaudit (`restore.completed`/`restore.failed`: koneksi, database, sumber; tanpa isi) sebelum response sukses; percobaan restore juga diaudit saat dimulai (`restore.started`) supaya jejak ada meski proses mati.
- [**AC-6**](test.md#ac-6): UI: alur restore di halaman backup-restore (pilih artefak atau unggah, validasi tampil, pilih target, konfirmasi ketik nama, panel job); fitur digerbangi capability `backupRestore` dan nonaktif dengan penjelasan tanpa tool (FR-BKR-02).
- [**AC-7**](test.md#ac-7): e2e kedua engine: roundtrip penuh backup (spec 0049) lalu restore ke database baru menghasilkan data identik (perbandingan hitungan dan sampel); dump engine salah ditolak saat validasi; cancel di tengah menyatakan keadaan parsial; audit lengkap (started, completed).

## Options considered

### Option 1: Restore ke database baru sebagai jalur yang disarankan (dipilih)

**Pros**:
- Pemulihan tanpa menimpa data hidup; kegagalan restore tidak menghancurkan keadaan kini; pola paling aman untuk GUI.

**Cons**:
- Butuh ruang dua kali; pengguna memindahkan aplikasi ke database baru sendiri.

### Option 2: Restore menimpa di tempat sebagai default

**Pros**:
- Satu langkah.

**Cons**:
- Kegagalan setengah jalan meninggalkan campuran lama baru; sebagai default terlalu berbahaya. Tetap tersedia sebagai pilihan sadar dengan konfirmasi yang sama.

## Decision

**Chosen option**: Option 1 sebagai jalur disarankan di UI, Option 2 tersedia eksplisit; keduanya lewat konfirmasi ketik nama dan audit started/completed.

## Rationale

Restore gagal setengah jalan adalah skenario terburuk pengguna produk ini; jalur database baru mengubahnya dari bencana menjadi kegagalan yang bisa dibuang. Audit `restore.started` ditambahkan khusus operasi ini karena crash di tengah restore adalah persis momen ketika jejak paling dibutuhkan dan paling mungkin hilang. Validasi engine asal sebelum konfirmasi mencegah kesalahan paling umum (dump PostgreSQL ke MySQL) sebelum ada kerusakan.

## Feature design

**Data model sketch**: memakai artefak dan manifest spec 0049; tanpa tabel baru.

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| /restore/validate | POST | sumber (artifactId atau uploadId) | format, engine terdeteksi, ukuran | pemilik sumber | 422 format |
| /restore | POST | connectionId, targetDatabase, createNew?, sumber, confirmName | jobId | pemilik, tersambung, capability | 409 confirm/engine mismatch, unsupported |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| validasi | format dan engine dump | sniff header file (modul validasi) |
| target baru | pembuatan database | DatabasePort.create (spec 0039) di awal job |
| credential subprocess | env/file sementara | pola spec 0049 |
| keadaan parsial | pernyataan di hasil job | status cancel/gagal executor |

**Key invariants**:
- Tidak ada eksekusi restore tanpa validasi format lulus dan confirmName terverifikasi.
- Audit started selalu tertulis sebelum subprocess mulai; completed/failed sebelum response akhir.
- Password tidak pernah di argv; stderr tersensor.

**Security model**: pemilik koneksi dan pemilik artefak/upload; restore memakai hak credential koneksi; operasi diaudit ganda (started, hasil).

**Configuration required**: memakai `tools.*` (spec 0049).

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. Modul validasi artefak (sniff format, engine, gzip) plus endpoint validate, memenuhi **AC-1**.
2. Executor job restore (opsional create database dulu, subprocess streaming, progress, cancel dengan pernyataan parsial, ringkasan), memenuhi **AC-2**, **AC-4**.
3. Kontrak (confirmName wajib), endpoint restore, audit started/completed, regenerasi, contract test, memenuhi **AC-3**, **AC-5**.
4. UI alur restore lengkap dengan gerbang capability, memenuhi **AC-6**.
5. E2e roundtrip dan skenario gagal dua engine, memenuhi **AC-7**.

## Consequences

**Positive**:
- Lingkaran backup restore tertutup dan teruji roundtrip; janji Definition of Done butir 7 untuk backup restore punya jalannya.

**Negative / tradeoffs**:
- Restore dump custom format pg_restore (bukan plain) ditunda: V1 mendukung dump plain yang dihasilkan spec 0049; format custom dicatat V2.

**Neutral**:
- Restore lintas versi mengikuti aturan kompatibilitas tool; peringatan versi tampil dari deteksi spec 0049.

## Follow-up

- [ ] V2: dukungan pg_restore format custom/directory dan pemulihan terpilih (per table).

## References

**Project sources**:
- v1-feature-specification.md FR-BKR-01, FR-BKR-02, FR-SAFE-01, FR-SAFE-02; spec 0028, 0039, 0048 (upload), 0049.

**Practices & standards**:
- Restore ke lingkungan baru sebagai default aman; audit sebelum dan sesudah operasi tak terpulihkan; validasi artefak sebelum konfirmasi.

**Links**: tidak ada yang diverifikasi untuk spec ini.
