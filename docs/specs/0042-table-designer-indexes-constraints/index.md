# 0042. Table designer: index dan constraint

**Date**: 2026-08-28
**Status**: In Progress
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini memperluas table designer dengan pengelolaan index dan constraint: primary key, foreign key (dengan aturan ON DELETE dan ON UPDATE), unique, check, dan index biasa termasuk komposit, memakai mesin change set, pratinjau DDL, dan konfirmasi destructive yang sama dengan spec 0041.

## Context

FR-TBL-02: PK, FK, unique, check, dan composite index dapat dibuat, diubah, dan dihapus sejauh capability provider mendukung. describeTable sudah memaparkan semuanya (spec 0023, 0025); kompilator change set sudah ada (spec 0041). Perbedaan engine yang harus diserap provider: check MySQL hanya ditegakkan mulai 8.0.16 (capability `checkConstraints`), "mengubah" constraint umumnya berarti drop lalu add, dan FK menuntut index pendukung di MySQL.

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0041.

## Requirements

**User stories**:

- Sebagai pengguna, saya ingin mengatur kunci, relasi, dan index table dari satu tempat dengan SQL yang terlihat.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): tab Index dan tab Constraint di table designer memuat keadaan kini dari describeTable: daftar index (nama, kolom terurut, unik, metode bila ada) dan constraint (PK, FK dengan referensi dan aturan ON, unique, check dengan ekspresi).
- [**AC-2**](test.md#ac-2): change set diperluas: addIndex, dropIndex, addConstraint, dropConstraint; "ubah" dimodelkan drop plus add dan pratinjau menampilkannya jujur sebagai dua statement.
- [**AC-3**](test.md#ac-3): editor FK: memilih kolom lokal, table target (pencari object dari metadata), kolom target, ON DELETE dan ON UPDATE dari daftar aturan engine; provider memvalidasi kecocokan tipe kolom dan (MySQL) memastikan index pendukung ada atau menambahkannya ke change set dengan pemberitahuan.
- [**AC-4**](test.md#ac-4): editor check dengan ekspresi bebas divalidasi provider saat preview (engine yang mem parse saat DDL); pada MySQL versi tanpa penegakan, UI menonaktifkan check dengan alasan dari capability `checkConstraints`.
- [**AC-5**](test.md#ac-5): composite index dan composite PK/unique didukung dengan pengurutan kolom drag; batas jumlah kolom mengikuti engine (dinyatakan provider).
- [**AC-6**](test.md#ac-6): drop index atau constraint memakai konfirmasi destructive; drop PK dan drop FK menampilkan peringatan dampak khusus (identitas baris data browser, integritas relasi); semua penerapan diaudit (`table.altered` dengan ringkasan) sebelum sukses.
- [**AC-7**](test.md#ac-7): setelah terapkan, invalidasi metadata (pola spec 0041 AC-7); data browser menyegarkan rowIdentity bila PK berubah.
- [**AC-8**](test.md#ac-8): test snapshot kompilasi untuk semua jenis index dan constraint di kedua engine; e2e: buat FK antar table fixture dengan aturan ON, buat composite unique, drop index, semuanya lewat pratinjau.

## Options considered

### Option 1: Perluasan change set spec 0041 (dipilih)

**Pros**:

- Satu mesin, satu pratinjau, satu pola konfirmasi; ubah sebagai drop plus add tampil jujur.

**Cons**:

- Change set semakin kaya; ditangani dengan tipe diskriminatif per operasi.

### Option 2: Endpoint terpisah per jenis constraint

**Pros**:

- Permukaan kecil per operasi.

**Cons**:

- Kehilangan pratinjau gabungan dan atomisitas PostgreSQL untuk beberapa perubahan sekaligus; duplikasi pola.

## Decision

**Chosen option**: Option 1: memperluas `TableChangeSet` dengan operasi index dan constraint, dikompilasi dan diterapkan mesin yang sama.

## Rationale

Perubahan struktur yang saling terkait (drop PK lama, add PK baru, index pendukung FK) paling aman ditinjau dan diterapkan sebagai satu change set dengan pratinjau utuh; itu persis kekuatan desain spec 0041, tinggal diperluas. Menyatakan "ubah = drop + add" secara jujur di pratinjau lebih baik daripada menyembunyikannya di balik kata edit, karena konsekuensi lock dan penulisan ulang nyata bagi operator.

## Feature design

**Data model sketch**: perluasan tipe `TableChangeSet` di kontrak (operasi index/constraint).

**API surface**: memakai preview/apply spec 0041 tanpa endpoint baru.

**Value sourcing**:

| Action             | Value produced / displayed      | Source                |
| ------------------ | ------------------------------- | --------------------- |
| keadaan kini       | index dan constraint            | describeTable         |
| aturan ON tersedia | daftar per engine               | modul aturan provider |
| validasi FK        | kecocokan tipe, index pendukung | provider saat preview |
| gerbang check      | checkConstraints                | capability koneksi    |

**Key invariants**:

- Sama dengan spec 0041 (kompilasi tunggal, konfirmasi destructive di server, audit sebelum sukses).
- Nama constraint dan index hasil generate mengikuti pola konsisten bila pengguna tidak menamai (`fk_<table>_<kolom>` dan sejenisnya, didokumentasikan).

**Security model**: sama dengan spec 0041.

**Configuration required**: tidak ada.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. [x] Perluas `TableChangeSet` di kontrak dan kompilator kedua provider (index, PK, FK, unique, check; drop plus add untuk ubah) dengan test snapshot, memenuhi **AC-2** sampai **AC-5**.
2. [x] UI tab Index dan Constraint (daftar, editor FK dengan pencari target, composite dengan pengurutan, check ekspresi), memenuhi **AC-1**, **AC-3**, **AC-5**.
3. [x] Konfirmasi destructive dan peringatan dampak PK/FK, audit, invalidasi plus refresh rowIdentity, memenuhi **AC-6**, **AC-7**.
4. [x] E2e dua engine, memenuhi **AC-8** (fixture PostgreSQL dan MySQL disposable telah dijalankan).

## Consequences

**Positive**:

- Table designer lengkap untuk struktur; FR-TBL-02 selesai dengan transparansi yang sama.

**Negative / tradeoffs**:

- Drop plus add untuk ubah berarti jendela tanpa constraint di engine non transaksional; pratinjau memperingatkan.

**Neutral**:

- Tipe index khusus engine (GIN, HASH, FULLTEXT) adalah V2 sesuai feature.md; V1 memakai default engine.

## Follow-up

- [ ] Tidak ada.

## References

**Project sources**:

- v1-feature-specification.md FR-TBL-02; feature.md baris index dan constraint; spec 0023, 0025, 0041.

**Practices & standards**:

- Perubahan struktur sebagai change set utuh; kejujuran drop plus add.

**Links**: tidak ada yang diverifikasi untuk spec ini.
