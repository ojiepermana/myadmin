# 0049. Backup

**Date**: 2026-08-28
**Status**: In Progress
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini membangun logical backup database target lewat native tool (pg_dump untuk PostgreSQL, mysqldump untuk MySQL) sebagai job dengan progress dan cancel, opsi structure only atau data only dan kompresi gzip, hasil tersimpan di folder backups data directory dan bisa diunduh. Ketersediaan tool dideteksi jujur: tanpa tool, fitur dinyatakan tidak tersedia lewat capability dan doctor, tanpa kegagalan diam diam.

## Context

FR-BKR-01: logical backup dengan progress, cancellation, validation, dan audit. FR-BKR-02: kebutuhan native tooling transparan; binary release menyediakan tool atau doctor menyatakan fitur tidak tersedia sebelum user memulai. feature.md mengunci opsi structure/data only dan compression sebagai V1. Keputusan yang diambil di sini: V1 memakai native tool yang ditemukan di sistem (PATH atau path config), tidak membundel tool ke dalam binary; pembundelan menjadi keputusan distribusi (spec 0055) bila layak.

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0028 (jobs), 0007 (doctor).

## Requirements

**User stories**:

- Sebagai pengguna, saya ingin membuat backup database sebelum operasi berisiko dan tahu pasti apakah kemampuan backup tersedia di instalasi saya.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): deteksi tool saat startup dan saat diminta: mencari `pg_dump`/`pg_restore` dan `mysqldump`/`mysql` di config path (`tools.pgDumpPath` dan sebagainya) lalu PATH; versi tool dibaca dan dicocokkan kompatibilitasnya dengan versi server (mayor pg_dump >= mayor server untuk PostgreSQL; ketidakcocokan menjadi peringatan atau penolakan sesuai aturan provider); hasil deteksi menentukan capability `backupRestore` per koneksi dan check doctor (FR-BKR-02).
- [**AC-2**](test.md#ac-2): `POST /backup` membuat job: { connectionId, database, scope: structure|data|both, compress: boolean, catatan opsional }; job menjalankan native tool sebagai subprocess dengan argumen yang dibangun provider; password dialirkan lewat mekanisme aman engine (PGPASSWORD env / file option MySQL yang dibuat sementara dengan permission ketat dan dihapus), tidak pernah lewat argumen command line (terlihat di process list).
- [**AC-3**](test.md#ac-3): keluaran tool dialirkan ke file `<data-dir>/backups/<label>-<timestamp>.sql[.gz]` (gzip streaming bila compress); progress dilaporkan dari byte tertulis dan keluaran stderr tool yang di parse ringan; cancel membunuh subprocess dengan rapi dan menghapus artefak parsial.
- [**AC-4**](test.md#ac-4): validasi hasil: exit code nol, file tidak kosong, dan sniff header format benar; kegagalan menyertakan potongan stderr yang sudah melalui redaction (stderr tool bisa memuat detail koneksi).
- [**AC-5**](test.md#ac-5): daftar backup: `GET /backups` menampilkan artefak di folder backups milik user pembuat (metadata manifest kecil per artefak: koneksi, database, scope, ukuran, waktu, versi tool); unduh dan hapus (dengan konfirmasi) tersedia; artefak tidak dihapus otomatis.
- [**AC-6**](test.md#ac-6): backup selesai/gagal diaudit (`backup.completed`/`backup.failed`: koneksi, database, scope; tanpa isi); UI: dialog backup dari context menu database plus halaman backup-restore berisi daftar artefak dan panel jobs (FR-BKR-01).
- [**AC-7**](test.md#ac-7): tanpa tool terdeteksi: UI menonaktifkan backup dengan penjelasan dan tautan ke doctor; endpoint menjawab `unsupported` dengan reason; tidak ada percobaan setengah jalan (FR-BKR-02).
- [**AC-8**](test.md#ac-8): e2e kedua engine (lingkungan test menyediakan tool): backup both compress, file valid dan bisa dibuka; structure only tanpa data; cancel membersihkan; tanpa tool (disimulasikan) fitur nonaktif dengan penjelasan.

## Options considered

### Option 1: Native tool dari sistem/config, tanpa bundel di V1 (dipilih)

**Pros**:

- pg_dump dan mysqldump adalah standar emas kebenaran dump; deteksi jujur sesuai FR-BKR-02; binary Myadmin tetap ramping dan bebas urusan lisensi/penandatanganan tool pihak lain.

**Cons**:

- Pengguna tanpa tool harus memasangnya; doctor dan dokumentasi memandu.

### Option 2: Membundel tool ke distribusi

**Pros**:

- Bekerja langsung di mana saja.

**Cons**:

- Ukuran distribusi bengkak per platform, kewajiban keamanan atas binary pihak lain, dan kecocokan versi server tetap masalah; FR-BKR-02 mengizinkan jalur "doctor menyatakan tidak tersedia". Dapat dipertimbangkan ulang di spec 0055.

### Option 3: Implementasi dump sendiri lewat SQL

**Pros**:

- Tanpa dependency eksternal.

**Cons**:

- Menandingi kebenaran pg_dump adalah proyek bertahun tahun; risiko dump yang tidak bisa direstore adalah risiko terburuk produk ini.

## Decision

**Chosen option**: Option 1: native tool dideteksi (config lalu PATH), argumen dibangun provider `import-export`/`backup` nya, password tidak pernah di argv, hasil ke folder backups dengan manifest.

## Rationale

Backup yang tidak bisa direstore lebih buruk daripada tidak ada backup; karena itu kebenaran format diserahkan ke tool resmi engine dan energi spec ini dihabiskan pada kejujuran ketersediaan (deteksi, capability, doctor) dan keamanan penanganan credential subprocess, dua tempat produk sejenis paling sering gagal. Manifest per artefak membuat daftar backup informatif tanpa membaca isi file.

## Feature design

**Data model sketch**: artefak file plus manifest JSON per artefak di folder backups (bukan tabel; folder adalah sumber kebenaran, manifest berdampingan).

**API surface**:

| Endpoint              | Method | Key inputs                              | Key outputs               | Auth                            | Key errors       |
| --------------------- | ------ | --------------------------------------- | ------------------------- | ------------------------------- | ---------------- |
| /backup               | POST   | connectionId, database, scope, compress | jobId                     | pemilik, tersambung, capability | unsupported, 422 |
| /backups              | GET    | tidak ada                               | daftar artefak milik user | sesi                            |                  |
| /backups/:id/download | GET    | tidak ada                               | file                      | pemilik artefak                 | 404              |
| /backups/:id          | DELETE | confirmName                             | kosong                    | pemilik                         | 409              |

**Value sourcing**:

| Action                   | Value produced / displayed | Source                                                         |
| ------------------------ | -------------------------- | -------------------------------------------------------------- |
| capability backupRestore | boolean plus reason        | deteksi tool plus kecocokan versi                              |
| argumen tool             | argv                       | pembangun provider (scope, format, host, user; tanpa password) |
| password subprocess      | env/option file sementara  | vault lewat ConnectionContext, umur sesaat                     |
| progress                 | byte, fase                 | ukuran file tumbuh plus parse stderr                           |

**Key invariants**:

- Password tidak pernah muncul di argv, log, manifest, atau stderr yang diteruskan (redaction pada semua keluaran subprocess).
- Artefak parsial tidak pernah tersisa (cancel/gagal membersihkan).
- Fitur hanya aktif bila deteksi tool lulus; tidak ada fallback diam diam ke metode lain (FR-BKR-02).

**Security model**: pemilik koneksi membuat backup; artefak dimiliki pembuatnya; isi backup adalah data pengguna dan tinggal di data directory yang dilindungi permission OS.

**Configuration required**:

- `tools.pgDumpPath`, `tools.pgRestorePath`, `tools.mysqldumpPath`, `tools.mysqlPath` (baru di schema config): path eksplisit opsional.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. [x] Bangun modul deteksi tool (config, PATH, versi, kecocokan) plus doctor check plus penentuan capability, memenuhi **AC-1**, **AC-7**.
2. [x] Bangun pembangun argumen dan penanganan credential subprocess per engine di provider, memenuhi **AC-2**.
3. [x] Executor job backup (subprocess, streaming ke file, gzip, progress, cancel, validasi, manifest), memenuhi **AC-2**, **AC-3**, **AC-4**.
4. [x] Kontrak, endpoint (backup, daftar, unduh, hapus), audit, regenerasi, contract test, memenuhi **AC-5**, **AC-6**.
5. [x] UI dialog backup dan halaman backup-restore (daftar artefak plus panel jobs), memenuhi **AC-6**, **AC-7**.
6. [x] E2e dua engine plus simulasi tanpa tool, memenuhi **AC-8**.

## Consequences

**Positive**:

- Backup yang benar formatnya dengan kejujuran ketersediaan; fondasi restore (spec 0050).

**Negative / tradeoffs**:

- Bergantung tool eksternal; jalur pemasangan didokumentasikan dan dipandu doctor.

**Neutral**:

- Scheduled backup V2; pembundelan tool dievaluasi di spec 0055.

## Follow-up

- [x] Spec 0055 mengevaluasi pembundelan atau pemaketan tool per platform.

## References

**Project sources**:

- v1-feature-specification.md FR-BKR-01, FR-BKR-02, FR-JOB-01; feature.md baris backup (structure/data, compression V1); spec 0007, 0011, 0028.

**Practices & standards**:

- Dump lewat tool resmi engine; credential subprocess lewat env/file sementara, bukan argv; validasi artefak sebelum diklaim sukses.

**Links**: tidak ada yang diverifikasi untuk spec ini.
