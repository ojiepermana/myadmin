# 0024. Provider MySQL: koneksi, TLS, capability, error mapping

**Date**: 2026-08-28
**Status**: Proposed
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini membangun separuh pertama provider MySQL di `packages/database-mysql`, cermin dari spec 0022: koneksi lewat Bun.sql, TLS tegas tanpa downgrade, deteksi versi dan capability (termasuk semantik database as schema), pemetaan kode error MySQL ke `DbError`, dan cancel lewat `KILL QUERY` dari koneksi kontrol.

## Context

MySQL adalah provider kedua V1 dengan perbedaan hierarki yang dihormati kontrak: tidak ada schema terpisah, database adalah schema (FR-PROV-05); capability `schemas` bernilai false. Aturan yang sama dengan PostgreSQL berlaku: semua semantik MySQL tinggal di package ini, tanpa impor antar provider. Cancel query di MySQL memakai `KILL QUERY <connection_id>`, mekanisme yang tidak bergantung API driver.

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0021. Selaras dengan spec 0022 (pola yang sama; kedua spec bisa dikerjakan berurutan atau paralel oleh orang berbeda).

## Requirements

**User stories**:
- Sebagai pengguna, saya ingin koneksi MySQL dengan jaminan TLS dan pesan error yang sama jelasnya dengan PostgreSQL.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): `open(context)` membuka koneksi Bun.sql MySQL; `connection_id()` sesi tercatat pada handle; `close` bersih; connect timeout ditegakkan.
- [**AC-2**](test.md#ac-2): mode TLS `disable`, `require`, `verify-ca`, `verify-full` didukung dengan CA custom opsional; permintaan yang tidak terpenuhi gagal `tls_failed` tanpa downgrade (FR-CONN-05).
- [**AC-3**](test.md#ac-3): `test(context)` ternormalisasi: sukses (versi, latency) atau `DbError`; tanpa penyimpanan.
- [**AC-4**](test.md#ac-4): `describe` mengembalikan capability V1 MySQL: `schemas` false dengan reason "MySQL memakai database sebagai schema", `viewEditor` true, `explain` true, `cancelQuery` true, `principals` true, `grants` true, `tableComments` true, `generatedColumns` true, `identityColumns` true (auto_increment), `checkConstraints` sesuai versi (ditegakkan mulai 8.0.16; sebelumnya false dengan reason), kunci V2 (`events`, `binlog`, `optimize`, `repair`) false; `backupRestore`/`importExport` false sementara dengan reason sampai spec terkait.
- [**AC-5**](test.md#ac-5): pemetaan error: 1045 → `auth_failed`, 1044/1142 → `permission_denied`, 1049/1146 → `not_found`, 1062/1451/1452/3819 → `constraint_violation`, 1064 → `syntax_error` (posisi diekstrak dari pesan bila ada), 1317/3024 → `cancelled`/`timeout` sesuai konteks, kegagalan jaringan → `connection_failed`; pesan tanpa secret.
- [**AC-6**](test.md#ac-6): cancel: `cancel(handle)` menjalankan `KILL QUERY <connection_id>` lewat koneksi kontrol; sesi yang dibatalkan menerima error yang dipetakan `cancelled`; perilaku terbukti test integrasi.
- [**AC-7**](test.md#ac-7): suite kontrak generik (spec 0021) lulus pada MySQL nyata dua versi yang didukung (8.0 dan yang terbaru), di `tests/integration/mysql/`.
- [**AC-8**](test.md#ac-8): boundary: tanpa impor dari `database-postgresql`; semantik MySQL tidak bocor keluar package.

## Options considered

### Option 1: Bun.sql plus KILL QUERY (dipilih)

**Pros**:
- Konsisten dengan keputusan driver proyek; `KILL QUERY` bekerja apa pun drivernya.

**Cons**:
- Kematangan Bun.sql MySQL lebih muda lagi dibanding PostgreSQL nya; gerbang test integrasi yang sama diberlakukan.

### Option 2: mysql2

**Pros**:
- Driver MySQL paling teruji di ekosistem JS.

**Cons**:
- Menyimpang dari keputusan driver tunggal proyek; hanya diambil bila gerbang test Bun.sql gagal (lewat supersede /architect).

## Decision

**Chosen option**: Option 1: Bun.sql, cancel lewat `KILL QUERY` dari koneksi kontrol, dengan gerbang test integrasi TLS dan cancel yang sama seperti spec 0022.

## Rationale

Simetri dengan PostgreSQL disengaja: satu keputusan driver, satu pola cancel berbasis perintah server, satu bentuk capability; yang berbeda hanya isi tabel pemetaan dan capability, persis pemisahan yang diinginkan FR-PROV-02. Reason pada `schemas` false dipakai UI untuk menjelaskan, bukan menyembunyikan tanpa kabar (prinsip scope butir 4).

## Feature design

**Data model sketch**: state runtime `SessionHandle { id, connectionId, openedAt }`.

**API surface**: port spec 0021.

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| open | connection_id | `SELECT CONNECTION_ID()` saat sesi dibuka |
| describe | version | `SELECT VERSION()` |
| describe | checkConstraints | perbandingan versi server dengan 8.0.16 |
| cancel | target kill | connection_id handle yang dibatalkan |

**Key invariants**:
- Sama dengan spec 0022: secret sesaat, TLS fail closed, semua error keluar sebagai `DbError`.
- Koneksi kontrol untuk KILL memakai credential yang sama dengan koneksi target (tidak butuh hak lebih; user boleh membatalkan query nya sendiri).

**Security model**: identik pola spec 0022; pesan error dan log lewat redaction.

**Configuration required**: tidak ada baru.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. Lingkungan test MySQL dua versi di `tests/environments/`, memenuhi **AC-7**.
2. `driver/` adaptor Bun.sql MySQL plus registry sesi dengan connection_id, memenuhi **AC-1**.
3. Mode TLS lengkap plus test per mode, memenuhi **AC-2**.
4. `mappers/` kode error → `DbError` plus test tabel, memenuhi **AC-5**.
5. `capabilities/` deteksi versi dan tabel capability dengan reasons, memenuhi **AC-4**.
6. `test()` dan cancel `KILL QUERY`, memenuhi **AC-3**, **AC-6**.
7. Suite kontrak generik dan boundary check, memenuhi **AC-7**, **AC-8**.

## Consequences

**Positive**:
- Dua provider dengan kontrak terbukti sama; klaim capability driven UI bisa diuji nyata mulai sekarang.

**Negative / tradeoffs**:
- Risiko kematangan Bun.sql MySQL; eksplisit, bergerbang, dengan jalur mundur yang dinyatakan.

**Neutral**:
- MariaDB tidak diuji dan tidak diklaim didukung (di luar scope V1 sesuai daftar bagian 11).

## Follow-up

- [ ] Bila gerbang test Bun.sql MySQL gagal, kembali ke /architect untuk supersede keputusan driver.

## References

**Project sources**:
- v1-feature-specification.md FR-PROV-02, FR-PROV-05, FR-CONN-05; struktur.md packages/database-mysql; spec 0021, 0022.

**Practices & standards**:
- Fail closed TLS; cancel lewat perintah server; simetri kontrak antar provider.

**Links** (terverifikasi web 2026-08-28):
- Bun 1.4, Bun.sql MySQL: https://bun.com/blog
