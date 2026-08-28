# 0007. Perintah doctor dan migrate

**Date**: 2026-08-28
**Status**: In Progress
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini menambah dua perintah diagnostik dan pemeliharaan pada CLI: `myadmin doctor` yang memeriksa kesehatan instalasi tanpa mencetak secret, dan `myadmin migrate` yang menjalankan migrasi SQLite internal secara eksplisit. Doctor dirancang sebagai kerangka pemeriksaan yang bertambah seiring fitur (keyfile, native tools backup) sehingga spec lain tinggal mendaftarkan pemeriksaan baru.

## Context

FR-RUN-05 menuntut diagnostic command yang memeriksa data directory, internal storage, aset web, config penting, dan capability backup tool tanpa mencetak secret. FR-BKR-02 menuntut ketersediaan native tool dinyatakan sebelum user memulai operasi. Pola yang tepat adalah registry pemeriksaan: setiap subsistem mendaftarkan check nya sendiri, doctor tinggal menjalankan dan menyajikan. `migrate` dibutuhkan operator yang ingin menjalankan migrasi terpisah dari serve, misalnya saat upgrade.

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0006 dan 0008 (runner migrasi yang dipanggil `migrate`).

## Requirements

**User stories**:
- Sebagai operator, saya ingin satu perintah yang memberi tahu kondisi instalasi dan apa yang harus diperbaiki.
- Sebagai operator, saya ingin menjalankan migrasi secara sadar saat upgrade sebelum menyalakan server.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): `myadmin doctor` menjalankan pemeriksaan terdaftar dan menyajikan hasil per pemeriksaan: ok, warning, atau fail, dengan pesan tindakan; exit code 0 bila tanpa fail, bukan nol bila ada fail.
- [**AC-2**](test.md#ac-2): pemeriksaan awal mencakup: data directory ada dan bisa ditulis; subfolder lengkap; SQLite internal bisa dibuka dan versi migrasinya sesuai (atau menyatakan butuh migrasi); aset web ditemukan; config valid (setelah spec 0012); keyfile ada dengan permission benar (setelah spec 0010).
- [**AC-3**](test.md#ac-3): doctor tidak pernah mencetak secret, isi config sensitif, connection string, atau isi database; output nya aman ditempel ke issue publik.
- [**AC-4**](test.md#ac-4): subsistem lain dapat mendaftarkan pemeriksaan lewat antarmuka `DoctorCheck { id, title, run(): CheckResult }` tanpa mengubah kode doctor; pemeriksaan native tools backup (spec 0049) memakai jalur ini.
- [**AC-5**](test.md#ac-5): `myadmin migrate` menjalankan migrasi tertunda dan melaporkan versi awal, versi akhir, dan daftar migrasi yang dijalankan; tanpa migrasi tertunda ia menyatakan sudah mutakhir; kegagalan menghentikan proses dengan pesan aman dan exit code bukan nol.
- [**AC-6**](test.md#ac-6): `myadmin migrate --status` menampilkan versi skema saat ini dan migrasi tertunda tanpa menjalankan apa pun.
- [**AC-7**](test.md#ac-7): `doctor --json` mengeluarkan hasil terstruktur untuk otomasi, dengan bentuk yang stabil.

## Options considered

### Option 1: Registry pemeriksaan (dipilih)

**Pros**:
- Doctor tumbuh bersama fitur tanpa membengkakkan satu file; spec lain punya kontrak jelas untuk menambah check.

**Cons**:
- Sedikit abstraksi di depan untuk kebutuhan yang awalnya kecil.

### Option 2: Doctor monolitik berisi semua pemeriksaan

**Pros**:
- Paling sederhana hari pertama.

**Cons**:
- Setiap fitur baru mengedit file yang sama; pemeriksaan native tools dan keyfile akan menumpuk di satu tempat yang tidak memilikinya.

## Decision

**Chosen option**: Option 1: registry pemeriksaan.

`doctor` dan `migrate` sebagai perintah CLI di `apps/cli/src/commands/`, dengan antarmuka `DoctorCheck` di kernel/CLI runtime dan pendaftaran check oleh subsistem pemiliknya (basis: FR-RUN-05; FR-BKR-02 menuntut doctor tahu soal native tools yang dimiliki subsistem backup).

## Rationale

Daftar hal yang doctor periksa menurut FR-RUN-05 dan FR-BKR-02 dimiliki oleh subsistem berbeda (storage, crypto, config, backup). Registry membuat kepemilikan pemeriksaan mengikuti kepemilikan kode, konsisten dengan arah dependency struktur.md. Exit code yang benar dan mode `--json` membuat doctor bisa dipakai skrip dan smoke test rilis, bukan hanya mata manusia.

## Feature design

**Data model sketch**: tidak ada entity baru; membaca tabel `migrations` milik spec 0008.

**API surface**: tidak ada endpoint HTTP; permukaan berupa perintah CLI.

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| doctor | daftar pemeriksaan | registry `DoctorCheck` yang diisi subsistem saat composition |
| doctor | status migrasi | tabel `migrations` SQLite (spec 0008) |
| migrate | daftar migrasi tertunda | runner migrasi (spec 0008) |
| doctor | status keyfile | key provider (spec 0010), hanya metadata: ada/tidak, permission |

**Key invariants**:
- Hasil check hanya memuat metadata (ada/tidak, versi, permission), tidak pernah nilai; redaction berlaku pada seluruh output doctor.
- `migrate` dan tahap migrasi `serve` memakai runner yang sama; tidak ada dua implementasi migrasi.

**Security model**: kedua perintah berjalan lokal tanpa auth aplikasi; perlindungannya adalah permission file OS dan larangan mencetak secret (AC-3).

**Configuration required**: tidak ada environment variable baru.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. [x] Definisikan antarmuka `DoctorCheck` dan registry nya di runtime CLI, memenuhi **AC-4**.
2. [x] Implementasikan pemeriksaan dasar: data directory, subfolder, SQLite terbuka plus versi migrasi, aset web, memenuhi **AC-2**.
3. [x] Bangun presenter hasil (tabel terminal dan `--json`) dengan exit code benar, memenuhi **AC-1**, **AC-7**.
4. [x] Implementasikan `migrate` dan `migrate --status` di atas runner spec 0008, memenuhi **AC-5**, **AC-6**.
5. [x] Test: doctor pada instalasi sehat, rusak sebagian, dan output json snapshot; migrate idempotent, memenuhi **AC-1** sampai **AC-7**.
6. [x] Audit output terhadap redaction (tinjau semua string yang dicetak), memenuhi **AC-3**.

## Consequences

**Positive**:
- Operator dan smoke test punya satu pintu diagnosa; janji FR-BKR-02 punya tempat mendarat.

**Negative / tradeoffs**:
- Registry menuntut disiplin: fitur baru yang lupa mendaftarkan check membuat doctor buta terhadapnya; ditangkap lewat review dan daftar check di spec fitur terkait.

**Neutral**:
- Check config dan keyfile baru aktif setelah spec 0010 dan 0012; doctor menampilkan "belum tersedia" sampai saat itu.

## Follow-up

- [ ] Spec 0010, 0012, 0049 wajib mendaftarkan check nya (keyfile, config, native tools) saat dibangun.

## References

**Project sources**:
- v1-feature-specification.md FR-RUN-05, FR-BKR-02, NFR-02; struktur.md pohon apps/cli.
- Spec 0006 (kerangka CLI), 0008 (runner migrasi).

**Practices & standards**:
- Diagnostik yang aman ditempel publik; exit code sebagai kontrak otomasi.

**Links**: tidak ada yang diverifikasi untuk spec ini.
