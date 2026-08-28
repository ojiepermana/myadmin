# 0026. Connection manager: CRUD dan vault

**Date**: 2026-08-28
**Status**: In Progress
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini membangun pengelolaan saved connection end to end: membuat, mengubah, menghapus, menduplikasi koneksi PostgreSQL dan MySQL beserta server group, menyimpan credential terenkripsi lewat vault, dan menguji koneksi tanpa harus menyimpan. Termasuk form UI lengkap dan keputusan batas akses Admin terhadap koneksi milik orang lain.

## Context

FR-CONN-01 sampai FR-CONN-04 mendefinisikan form, test, CRUD, dan group. Keamanan bagian 6 menyatakan koneksi privat bagi pemiliknya secara default dan Admin mengelola semua state aplikasi; kalimat itu ambigu untuk credential, jadi spec ini memutuskan batasnya: Admin dapat melihat descriptor semua koneksi dan menghapusnya, tapi tidak dapat membaca, memakai, atau mengedit credential koneksi milik orang lain. Fondasi siap: vault (0011), repositories (0009), provider test (0022, 0024), sesi dan role (0017, 0018).

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0011, 0017, 0022, 0024.

## Requirements

**User stories**:
- Sebagai user, saya ingin menyimpan koneksi dengan atau tanpa password nya, mengelompokkannya, dan mengujinya sebelum menyimpan.
- Sebagai Admin, saya ingin bisa membersihkan koneksi milik user yang sudah pergi tanpa bisa membaca rahasianya.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): `POST /connections` menerima descriptor lengkap (label, engine, host, port, database awal opsional, username, sslMode plus opsi TLS non rahasia, connectTimeoutMs, groupId opsional, tag, warna) plus `secret` opsional (password) dan `saveSecret` boolean; validasi server: label unik per pemilik, port 1 sampai 65535, engine dikenal, mode TLS valid (FR-CONN-01).
- [**AC-2**](test.md#ac-2): bila `saveSecret` true, secret dienkripsi vault dan disimpan di `connection_credentials`; bila false, koneksi tersimpan tanpa credential dan pemakaian nanti meminta password sesaat; secret tidak pernah muncul di response mana pun.
- [**AC-3**](test.md#ac-3): `POST /connections/test` menguji tanpa menyimpan: menerima descriptor plus secret transient, atau id koneksi tersimpan (memakai credential vault); hasil ternormalisasi: sukses dengan versi server dan latency, atau `DbError` kategori jelas; secret transient tidak dicatat di mana pun (FR-CONN-02).
- [**AC-4**](test.md#ac-4): `PATCH /connections/:id` mengubah descriptor dan opsional mengganti atau menghapus secret tersimpan; `GET /connections` mengembalikan daftar milik sendiri (semua koneksi bagi Admin, dengan penanda pemilik); response hanya descriptor, tidak pernah material rahasia.
- [**AC-5**](test.md#ac-5): `DELETE /connections/:id` meminta konfirmasi eksplisit di UI, menghapus descriptor dan credential nya (cascade), memutus sesi provider aktif koneksi itu, dan diaudit; setelah hapus, credential tidak mungkin dipakai lagi (FR-CONN-03).
- [**AC-6**](test.md#ac-6): `POST /connections/:id/duplicate` menyalin descriptor dengan label baru; credential ikut tersalin hanya bila pemilik yang menduplikasi dan memilih menyalin.
- [**AC-7**](test.md#ac-7): server group CRUD (`/server-groups`): nama unik per pemilik, warna, urutan; koneksi bisa dipindah group; menghapus group tidak menghapus koneksinya (koneksi menjadi tanpa group) dengan konfirmasi yang menjelaskan itu (FR-CONN-04).
- [**AC-8**](test.md#ac-8): otorisasi: pemilik penuh atas koneksinya; Admin dapat list semua descriptor dan menghapus koneksi siapa pun (diaudit dengan actor Admin), tapi tidak dapat membaca/mengubah/memakai credential milik orang lain; endpoint test dan duplicate atas koneksi orang lain ditolak 403 bagi Admin sekalipun.
- [**AC-9**](test.md#ac-9): mutasi koneksi (create, update, delete, ganti secret) menghasilkan audit event tanpa secret (FR-AUD-01).
- [**AC-10**](test.md#ac-10): UI: halaman connections berisi daftar per group, form buat dan ubah dengan bagian TLS dan timeout, aksi test dengan hasil inline, duplicate, delete dengan konfirmasi menyebut label dan host; form bisa diselesaikan keyboard; e2e menutup alur buat, test, ubah, hapus.

## Options considered

### Option 1: Admin melihat descriptor dan menghapus, tanpa akses credential (dipilih)

**Pros**:
- Memenuhi "Admin mengelola state aplikasi" untuk kebersihan data tanpa membuat Admin bisa menyamar memakai kredensial database orang; sesuai semangat privasi bagian 6.

**Cons**:
- Admin tidak bisa memperbaiki koneksi user secara langsung; harus lewat pemiliknya.

### Option 2: Admin penuh termasuk memakai credential

**Pros**:
- Operasional paling fleksibel.

**Cons**:
- Menjadikan akun Admin aplikasi setara pemegang semua kredensial database organisasi; memperbesar ledakan bila akun Admin bocor. Bertentangan dengan "private terhadap pemiliknya secara default".

## Decision

**Chosen option**: Option 1: pemisahan descriptor (Admin bisa kelola) dari credential (hanya pemilik).

Use case di modul server `connections` dengan policies; bentuk request test mendukung secret transient (basis: FR-CONN-01 sampai 04; bagian 6 dan 8.1 tentang pemisahan descriptor dan secret payload).

## Rationale

Pemisahan descriptor/credential sudah menjadi struktur data (spec 0008); spec ini meneruskannya menjadi model otorisasi, sehingga jawaban atas ambiguitas bagian 6 konsisten dengan arsitektur data. Test tanpa menyimpan adalah alur kepercayaan pertama pengguna terhadap produk ini; karena itu jaminan "secret transient tidak tercatat" diuji eksplisit, bukan diasumsikan.

## Feature design

**Data model sketch**: memakai `connections`, `connection_credentials`, `server_groups` (spec 0008).

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| /connections | GET | page? | daftar descriptor | sesi | |
| /connections | POST | descriptor, secret?, saveSecret | descriptor | sesi | 409 label, 422 |
| /connections/:id | PATCH | descriptor sebagian, secret?, clearSecret? | descriptor | pemilik | 403, 404, 409 |
| /connections/:id | DELETE | tidak ada | kosong | pemilik atau admin | 403, 404 |
| /connections/test | POST | descriptor plus secret transient, atau connectionId | hasil test | sesi (pemilik bila by id) | 403, kategori DbError |
| /connections/:id/duplicate | POST | newLabel, copySecret? | descriptor | pemilik | 403, 409 |
| /server-groups | GET/POST/PATCH/DELETE | name, color, sortOrder | group | pemilik | 409 nama |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| test | versi server, latency | provider `test()` (spec 0022, 0024) |
| simpan secret | ciphertext, nonce, key_id | vault (spec 0011) |
| daftar admin | penanda pemilik | kolom owner_user_id plus join username |
| delete | sesi provider yang diputus | registry koneksi aktif (spec 0027) |

**Key invariants**:
- Tidak ada response yang memuat secret, ciphertext, atau metadata enkripsi (hanya boolean `hasSavedSecret`).
- Hapus koneksi berarti credential ikut mati saat itu juga (cascade plus putus sesi aktif).
- Semua mutasi diaudit sebelum response sukses (jalur `withAudit`).

**Security model**: sesuai AC-8; penegakan di use case policies, bukan hanya route. Rate limit test connection per user (10 per menit) untuk mencegah pemakaian sebagai alat scan jaringan.

**Configuration required**: tidak ada baru.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. Tambahkan operasi connections dan server-groups ke kontrak, regenerasi tipe dan SDK, daftar ke contract test.
2. Use case connections di modul server (validasi, vault, policies otorisasi, audit) dengan unit test fake, memenuhi **AC-1**, **AC-2**, **AC-4** sampai **AC-9**.
3. Endpoint test dengan jalur transient dan by id plus rate limit, memenuhi **AC-3**.
4. UI: feature connections (daftar per group, form, test inline, duplicate, delete konfirmasi, group manager), memenuhi **AC-7**, **AC-10**.
5. Test keamanan: pemeriksaan tidak ada secret transient di log/audit (fixture sniffing), otorisasi lintas user, memenuhi **AC-2**, **AC-3**, **AC-8**.
6. E2e alur lengkap kedua engine terhadap server test, memenuhi **AC-10**.

## Consequences

**Positive**:
- Alur nilai inti produk (kelola banyak koneksi dengan aman) hidup end to end; pola secret transient terbentuk untuk dipakai fitur lain.

**Negative / tradeoffs**:
- Admin tidak bisa memperbaiki credential user; keputusan sadar demi batas kepercayaan yang jelas.

**Neutral**:
- Connect/disconnect dan status hidup di spec 0027; endpoint test di sini menjadi fondasinya.

## Follow-up

- [ ] Spec 0027 memakai registry sesi aktif untuk memutus sesi saat delete (AC-5) secara penuh.

## References

**Project sources**:
- v1-feature-specification.md FR-CONN-01 sampai FR-CONN-04, bagian 6, 8.1; spec 0011, 0022, 0024.

**Practices & standards**:
- Pemisahan descriptor dan secret; least privilege untuk Admin; konfirmasi destructive menyebut target.

**Links**: tidak ada yang diverifikasi untuk spec ini.
