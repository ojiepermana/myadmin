# 0041. Table designer: kolom dan properti

**Date**: 2026-08-28
**Status**: In Progress
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini membangun bagian pertama table designer: membuat table baru dan mengubah kolom table yang ada (tambah, ubah, hapus kolom, tipe, panjang dan presisi, nullability, default, identity atau auto increment, generated column, komentar) lewat editor visual yang selalu menampilkan pratinjau DDL sebelum menerapkan. Index dan constraint menyusul di spec 0042, operasi destructive table di spec 0043.

## Context

FR-TBL-01: column editor dengan name, type, length/precision/scale, nullability, default, identity/auto-increment, generated column, dan comment, semuanya divalidasi provider. describeTable sudah memberi model kolom lengkap (spec 0023 AC-3, 0025 AC-3). Keputusan penting di sini: designer bekerja sebagai kumpulan perubahan (change set) yang provider kompilasi menjadi DDL, dengan pratinjau SQL wajib sebelum eksekusi, karena ALTER punya konsekuensi berbeda per engine (penulisan ulang table, lock).

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0031, 0019.

## Requirements

**User stories**:

- Sebagai pengguna, saya ingin merancang table dan mengubah kolom tanpa menghafal sintaks ALTER masing masing engine, dan melihat SQL yang akan dijalankan.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): create table: editor kolom multi baris (nama, tipe dari daftar tipe engine dengan parameter panjang/presisi/skala sesuai tipe, nullability, default eksplisit atau ekspresi, identity/auto increment, generated dengan ekspresinya, komentar), nama table dan schema/database konteks; PK sederhana bisa ditandai di sini (detail constraint lain di spec 0042).
- [**AC-2**](test.md#ac-2): alter table: editor memuat kolom kini dari describeTable, perubahan dikumpulkan sebagai change set (add, modify per aspek, drop, rename kolom); aspek yang tidak bisa diubah engine untuk tipe itu dinonaktifkan dengan alasan dari provider (contoh: mengubah generated expression di MySQL berarti drop dan add, dinyatakan).
- [**AC-3**](test.md#ac-3): `POST /tables/ddl/preview` mengkompilasi change set menjadi DDL lewat provider dan mengembalikan daftar statement plus peringatan (contoh: MySQL mengubah tipe akan menulis ulang table; PostgreSQL default volatile pada add column); UI menampilkan SQL dan peringatan sebelum tombol terapkan aktif.
- [**AC-4**](test.md#ac-4): `POST /tables/ddl/apply` menjalankan statement hasil kompilasi berurutan dalam transaksi bila engine mendukung DDL transaksional (PostgreSQL), atau berurutan dengan berhenti pada error dan laporan posisi bila tidak (MySQL), dengan hasil per statement; drop kolom di dalam change set memakai konfirmasi destructive (menyebut kolom dan table).
- [**AC-5**](test.md#ac-5): validasi provider: nama valid dan tidak bentrok, tipe dikenal, parameter tipe masuk akal, default kompatibel tipe, generated dan identity sesuai dukungan versi (capability `generatedColumns`, `identityColumns`); pelanggaran tiba sebagai 422 per field.
- [**AC-6**](test.md#ac-6): penerapan perubahan diaudit (`table.created`, `table.altered` dengan ringkasan perubahan, `table.column_dropped` untuk drop kolom) sebelum response sukses; drop kolom termasuk destructive (FR-SAFE-01, FR-SAFE-02).
- [**AC-7**](test.md#ac-7): setelah terapkan, cache metadata node terkait di invalidate dan explorer serta tab data menyegarkan struktur.
- [**AC-8**](test.md#ac-8): e2e kedua engine: buat table dengan semua jenis kolom yang didukung, alter (tambah, ubah nullability, rename, drop kolom), pratinjau selalu tampil, audit tercatat; test integrasi kompilasi DDL per engine dengan snapshot SQL.

## Options considered

### Option 1: Change set dikompilasi provider dengan pratinjau wajib (dipilih)

**Pros**:

- SQL yang dijalankan selalu terlihat (kepercayaan dan pembelajaran); kompilasi per engine hidup di provider tempat semantiknya; change set bisa diuji snapshot.

**Cons**:

- Dua langkah (preview lalu apply); disengaja untuk operasi berdampak struktur.

### Option 2: Terapkan langsung per perubahan kecil

**Pros**:

- Terasa instan.

**Cons**:

- Banyak ALTER kecil beruntun lebih berisiko (lock berulang, penulisan ulang berkali kali di MySQL) dan tidak memberi kesempatan meninjau.

## Decision

**Chosen option**: Option 1: change set → preview DDL → apply, kompilasi di provider `table/`, konfirmasi destructive untuk drop kolom.

## Rationale

Alat GUI database yang baik tidak menyembunyikan DDL; pratinjau wajib membuat pengguna tahu persis apa yang terjadi dan menjadikan perbedaan semantik engine (peringatan penulisan ulang, lock) bagian dari alur, bukan kejutan. Change set sebagai data membuat kompilasi bisa diuji snapshot per engine, jenis test yang murah dan tajam untuk kode rawan ini.

## Feature design

**Data model sketch**: tidak ada tabel internal; bentuk `TableChangeSet { ref?, createDefinition? | alterations[] }` di kontrak.

**API surface**:

| Endpoint            | Method | Key inputs                                   | Key outputs              | Auth                | Key errors                                      |
| ------------------- | ------ | -------------------------------------------- | ------------------------ | ------------------- | ----------------------------------------------- |
| /tables/ddl/preview | POST   | connectionId, changeSet                      | statements[], warnings[] | pemilik, tersambung | 422 validasi                                    |
| /tables/ddl/apply   | POST   | connectionId, changeSet, confirmDestructive? | hasil per statement      | pemilik             | 409 confirm kurang, DbError berposisi statement |

**Value sourcing**:

| Action              | Value produced / displayed | Source                             |
| ------------------- | -------------------------- | ---------------------------------- |
| daftar tipe         | tipe engine plus parameter | modul tipe di provider (per versi) |
| kolom kini          | definisi                   | describeTable                      |
| peringatan          | konsekuensi per statement  | aturan kompilasi provider          |
| gerbang fitur kolom | generated/identity/comment | capability koneksi                 |

**Key invariants**:

- Apply hanya menjalankan statement hasil kompilasi server dari change set; klien tidak pernah mengirim DDL bebas lewat jalur ini.
- Perubahan destructive dalam change set membutuhkan flag konfirmasi yang diverifikasi server.
- Pratinjau dan apply memakai kompilasi yang sama (satu fungsi), sehingga yang tampil = yang dijalankan.

**Security model**: hak DDL mengikuti credential koneksi; audit destructive; pemilik koneksi saja.

**Configuration required**: tidak ada.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. [x] Definisikan `TableChangeSet` dan operasi preview/apply di kontrak, regenerasi, contract test.
2. [x] Bangun modul tipe engine dan kompilator change set → DDL di provider `table/` kedua engine, dengan test snapshot SQL menyeluruh, memenuhi **AC-1**, **AC-2**, **AC-3**, **AC-5**.
3. [x] Endpoint server (preview, apply dengan semantik transaksi per engine, konfirmasi destructive, audit), memenuhi **AC-4**, **AC-6**.
4. [x] UI feature table-designer: editor kolom (create dan alter), panel pratinjau SQL plus peringatan, konfirmasi drop kolom, invalidasi metadata, memenuhi **AC-1**, **AC-2**, **AC-3**, **AC-7**.
5. [x] E2e dua engine, memenuhi **AC-8** (fixture PostgreSQL dan MySQL disposable telah dijalankan).

## Consequences

**Positive**:

- Perancangan table tanpa hafalan dialek, dengan transparansi penuh; kompilator change set menjadi fondasi spec 0042.

**Negative / tradeoffs**:

- Dua langkah preview apply menambah klik; harga transparansi.

**Neutral**:

- Properti table level engine (storage engine MySQL, tablespace) hanya dipaparkan read only di V1; pengubahannya V2 (batas scope matriks).

## Follow-up

- [x] Spec 0042 memperluas change set dengan index dan constraint.

## References

**Project sources**:

- v1-feature-specification.md FR-TBL-01, FR-SAFE-01, FR-SAFE-02; spec 0023, 0025, 0031, 0039 (pola konfirmasi), 0019.

**Practices & standards**:

- Pratinjau DDL sebelum eksekusi; change set sebagai data teruji snapshot; satu kompilator untuk preview dan apply.

**Links**: tidak ada yang diverifikasi untuk spec ini.
