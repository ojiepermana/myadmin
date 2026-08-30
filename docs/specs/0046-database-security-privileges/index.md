# 0046. Security database target: privilege (grant dan revoke)

**Date**: 2026-08-28
**Status**: In Progress
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini membangun grant dan revoke privilege pada level database dan table (batas V1 yang dikunci di sesi desain): melihat grant efektif sebuah principal, memberi dan mencabut privilege umum lewat matriks yang digerbangi capability, dengan pratinjau DDL, konfirmasi untuk revoke, dan audit. Column level dan object khusus lain adalah V2.

## Context

FR-SEC-03: basic GRANT/REVOKE dengan UI yang membatasi pilihan pada capability dan object yang provider dukung, dan kegagalan yang jelas bila credential koneksi tidak berhak. Keputusan sesi desain menutup ambiguitas "basic": level database dan table saja di V1. Privilege set berbeda per engine dan per level; deklarasinya milik provider, pola yang sama dengan form principal (spec 0045).

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0045.

## Requirements

**User stories**:

- Sebagai DBA, saya ingin memberi user akses baca tulis ke database atau table tertentu dan mencabutnya lagi, tanpa menghafal sintaks GRANT tiap engine.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): `GET /security/principals/:name/grants` mengembalikan grant efektif principal pada level database dan table, dari introspeksi provider (PostgreSQL: pg catalog ACL; MySQL: SHOW GRANTS di parse atau information_schema), berbentuk engine netral: scope (database atau table plus ref), privilege, grantable.
- [**AC-2**](test.md#ac-2): `GET /security/privileges/catalog` mendeklarasikan privilege yang tersedia per level untuk engine koneksi (PostgreSQL database: CONNECT, CREATE, TEMP; table: SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER; MySQL sesuai daftarnya per level), dari modul provider; UI tidak menghardcode daftar privilege.
- [**AC-3**](test.md#ac-3): UI matriks grant: pilih principal, pilih scope (database dari daftar; table lewat pencari object), centang privilege; perubahan dikumpulkan sebagai change set → pratinjau statement GRANT/REVOKE → terapkan; revoke di dalam change set memakai konfirmasi destructive yang menyebut principal, scope, dan privilege yang dicabut (FR-SAFE-01; revoke termasuk destructive per definisi bagian 2).
- [**AC-4**](test.md#ac-4): `POST /security/grants/apply` menjalankan change set; kegagalan hak dari engine tiba sebagai `permission_denied` dengan pesan yang menyebut operasi mana yang gagal; sebagian sukses dilaporkan per statement (tanpa transaksi lintas statement di MySQL; PostgreSQL dalam transaksi).
- [**AC-5**](test.md#ac-5): seluruh perubahan privilege diaudit (`security.privilege_granted`, `security.privilege_revoked` dengan principal, scope, privilege) sebelum response sukses (FR-SAFE-02).
- [**AC-6**](test.md#ac-6): fitur digerbangi `capabilities.grants`; opsi WITH GRANT OPTION tidak ditawarkan di V1 (dicatat sebagai batas); column privileges dan object lain tidak muncul (V2 sesuai keputusan dan feature.md).
- [**AC-7**](test.md#ac-7): e2e kedua engine: beri SELECT pada table ke principal test, buktikan efeknya (login sebagai principal itu bisa SELECT dan tidak bisa INSERT), cabut kembali, audit tercatat.

## Options considered

### Option 1: Change set matriks dengan pratinjau (dipilih)

**Pros**:

- Konsisten dengan pola designer dan principal; beberapa perubahan sekaligus ditinjau utuh; revoke tersaring jelas untuk konfirmasi.

**Cons**:

- Matriks butuh introspeksi grant yang akurat; itulah bagian tersulit dan diberi test nyata.

### Option 2: Aksi grant/revoke satuan langsung

**Pros**:

- Sederhana per aksi.

**Cons**:

- Pengaturan akses nyata hampir selalu beberapa privilege sekaligus; satu satu melelahkan dan memperbanyak audit noise.

## Decision

**Chosen option**: Option 1: matriks berbasis change set, katalog privilege dari provider, introspeksi grant efektif, pratinjau, konfirmasi revoke, audit.

## Rationale

Grant adalah fitur yang kesalahannya berdampak keamanan langsung pada database orang; karena itu tiga penjaga dipasang serentak: pratinjau DDL (tahu persis yang dijalankan), introspeksi efektif (melihat keadaan nyata, bukan asumsi), dan audit. Batas level database dan table mengikuti keputusan sesi desain yang menutup kontradiksi dokumen, dan WITH GRANT OPTION ditunda karena melipatgandakan kompleksitas model tanpa diminta scope.

## Feature design

**Data model sketch**: tidak ada tabel internal; model `GrantEntry { principal, scope, privilege, grantable }` dan `GrantChangeSet` di kontrak.

**API surface**:

| Endpoint                          | Method | Key inputs                | Key outputs         | Auth                        | Key errors                     |
| --------------------------------- | ------ | ------------------------- | ------------------- | --------------------------- | ------------------------------ |
| /security/principals/:name/grants | GET    | connectionId              | daftar GrantEntry   | pemilik, tersambung, grants | unsupported                    |
| /security/privileges/catalog      | GET    | connectionId              | privilege per level | sama                        |                                |
| /security/grants/preview          | POST   | changeSet                 | statements[]        | sama                        | 422                            |
| /security/grants/apply            | POST   | changeSet, confirmRevoke? | hasil per statement | sama                        | 409 confirm, permission_denied |

**Value sourcing**:

| Action            | Value produced / displayed | Source                                             |
| ----------------- | -------------------------- | -------------------------------------------------- |
| grant efektif     | daftar                     | introspeksi provider                               |
| katalog privilege | daftar per level           | modul provider `security/`                         |
| statement         | GRANT/REVOKE               | kompilator provider (quoting principal dan object) |
| konfirmasi revoke | ringkasan pencabutan       | change set tersaring jenis revoke                  |

**Key invariants**:

- UI hanya menawarkan privilege dari katalog provider; server memvalidasi ulang terhadap katalog (pertahanan ganda).
- Revoke tidak pernah diterapkan tanpa flag konfirmasi terverifikasi.
- Matriks selalu dirender dari grant efektif hasil introspeksi segar, bukan state klien lama.

**Security model**: hak nyata milik credential koneksi; kegagalan hak jelas (AC-4); semua perubahan diaudit; pemilik koneksi saja.

**Configuration required**: tidak ada.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. [x] Perluas kontrak (GrantEntry, katalog, change set, preview/apply), regenerasi, contract test.
2. [x] Implementasikan introspeksi grant efektif, katalog privilege, dan kompilator GRANT/REVOKE di kedua provider plus test integrasi nyata, memenuhi **AC-1**, **AC-2**, **AC-4**.
3. [x] Endpoint server bergerbang capability, konfirmasi revoke, audit, memenuhi **AC-4**, **AC-5**, **AC-6**.
4. [x] UI matriks privilege (principal, scope picker, centang per privilege, pratinjau, konfirmasi revoke), memenuhi **AC-3**.
5. [x] E2e efek nyata dua engine, memenuhi **AC-7**.

## Consequences

**Positive**:

- FR-SEC-03 selesai pada batas yang terdefinisi tegas; pengaturan akses harian tidak butuh SQL manual.

**Negative / tradeoffs**:

- Introspeksi grant akurat itu kerja keras per engine; dibayar test efek nyata.

**Neutral**:

- WITH GRANT OPTION, column privileges, default privileges: V2, tercatat.

## Follow-up

- [ ] V2: object privileges lanjutan sesuai feature.md.

## References

**Project sources**:

- v1-feature-specification.md FR-SEC-03, FR-SAFE-01, FR-SAFE-02, bagian 2 (revoke destructive); keputusan level database dan table, sesi desain 2026-08-28; spec 0045.

**Practices & standards**:

- Keadaan akses dari introspeksi, bukan asumsi; pratinjau perubahan keamanan; pertahanan ganda katalog.

**Links**: tidak ada yang diverifikasi untuk spec ini.
