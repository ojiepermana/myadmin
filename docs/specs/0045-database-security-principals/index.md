# 0045. Security database target: principal

**Date**: 2026-08-28
**Status**: Proposed
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini membangun pengelolaan principal database target: menelusuri role PostgreSQL dan account MySQL (user@host), membuat, mengubah atribut, menghapus, dan menyetel ulang password principal, semuanya lewat kontrak `SecurityPort` yang engine netral, digerbangi capability, dengan konfirmasi destructive dan audit. Ini mengelola user milik database target, bukan user Myadmin (dua dunia yang dokumen pisahkan tegas).

## Context

FR-SEC-01 dan FR-SEC-02: browse principal sesuai capability dengan model aman (tanpa password lama), create/edit/delete plus reset credential bila capability tersedia, dengan validasi provider, konfirmasi untuk destructive, dan audit. Model principal berbeda tajam antar engine (role PostgreSQL dengan atribut LOGIN/CREATEDB dan sebagainya; account MySQL sebagai pasangan user dan host dengan plugin auth); kontrak menyatukan bentuknya, provider menyerap semantiknya.

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0031, 0019.

## Requirements

**User stories**:
- Sebagai DBA, saya ingin melihat dan mengelola user database dari GUI dengan batas yang jelas: yang bisa saya lakukan adalah yang hak credential koneksi saya izinkan.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): `GET /security/principals` (per koneksi) mengembalikan daftar principal paginated berbentuk engine netral: name (PostgreSQL: nama role; MySQL: `user@host` dengan komponen terpisah), atribut sebagai daftar kunci nilai yang provider deklarasikan (canLogin, superuser, createDb, createRole, connectionLimit, validUntil untuk PostgreSQL; host, authPlugin, accountLocked, passwordExpired untuk MySQL), dan tanda member of (PostgreSQL role membership; ditampilkan read only di V1).
- [**AC-2**](test.md#ac-2): create principal: form dinamis dari deklarasi atribut provider (`SecurityPort.describePrincipalForm`): nama (plus host untuk MySQL), password opsional sesuai engine, atribut boolean/nilai; provider memvalidasi dan mengkompilasi DDL (CREATE ROLE / CREATE USER) dengan pratinjau (pola spec 0041).
- [**AC-3**](test.md#ac-3): edit principal: ubah atribut yang provider izinkan lewat change set dengan pratinjau; rename principal tidak ada di V1 (drop dan create adalah keputusan sadar pengguna lewat SQL).
- [**AC-4**](test.md#ac-4): reset password: dialog khusus, password baru tidak pernah ditampilkan kembali, tidak masuk log/audit/history; kompilasi ALTER ROLE/ALTER USER di provider; diaudit sebagai `security.credential_reset` tanpa material rahasia (FR-SEC-02).
- [**AC-5**](test.md#ac-5): drop principal: konfirmasi ketik nama; kegagalan karena kepemilikan object atau grant tersisa diteruskan jelas dari engine (tanpa cascade otomatis); diaudit `security.principal_dropped`.
- [**AC-6**](test.md#ac-6): seluruh fitur digerbangi `capabilities.principals`; server menolak saat false; UI menonaktifkan dengan alasan; kegagalan hak (credential koneksi kurang privilege) tampil sebagai `permission_denied` yang jelas (FR-SEC-03 semangat).
- [**AC-7**](test.md#ac-7): semua mutasi principal diaudit sebelum sukses; browse tidak diaudit.
- [**AC-8**](test.md#ac-8): e2e kedua engine terhadap server test: list, create dengan atribut, edit atribut, reset password (dibuktikan bisa login dengan password baru), drop; test bahwa response tidak pernah memuat hash atau password.

## Options considered

### Option 1: Form dinamis dari deklarasi atribut provider (dipilih)

**Pros**:
- Satu UI untuk dua model principal yang berbeda tajam; atribut baru di masa depan tidak mengubah UI; sesuai larangan cabang engine di fitur.

**Cons**:
- Form generik butuh deklarasi metadata yang dirancang baik di kontrak.

### Option 2: Form khusus per engine di UI

**Pros**:
- Penataan paling presisi per engine.

**Cons**:
- Meletakkan pengetahuan engine di UI, melanggar FR-PROV-04 dan pola seluruh produk.

## Decision

**Chosen option**: Option 1: `SecurityPort.describePrincipalForm` mendeklarasikan field per engine, UI merender data driven, kompilasi DDL dengan pratinjau di provider.

## Rationale

Principal adalah titik perbedaan engine paling dalam di V1; deklarasi form dari provider adalah satu satunya cara mempertahankan aturan "UI tanpa nama engine" tanpa menyederhanakan berlebihan. Reset password dirancang sebagai jalur khusus dengan jaminan tanpa jejak karena ini satu satunya tempat V1 di mana pengguna mengetik rahasia milik database target di luar form koneksi.

## Feature design

**Data model sketch**: tidak ada tabel internal; model `Principal`, `PrincipalAttribute`, `PrincipalFormField` di kontrak (spec 0021 diperluas seperlunya).

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| /security/principals | GET | connectionId, page, q? | items, total | pemilik, tersambung, capability | unsupported |
| /security/principals/form | GET | connectionId | deklarasi field create/edit | sama | |
| /security/principals | POST | fields (dinamis), password? | principal | sama | 409 nama, 422, DbError |
| /security/principals/:name | PATCH | perubahan atribut | principal | sama | 422, DbError |
| /security/principals/:name/reset-password | POST | newPassword | kosong | sama | DbError |
| /security/principals/:name | DELETE | confirmName | kosong | sama | 409, DbError |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| daftar dan atribut | nilai | katalog engine (pg_roles; mysql.user lewat information_schema yang diizinkan) |
| deklarasi form | field per engine | modul provider `security/` |
| pratinjau | DDL | kompilator provider |
| hasil reset | tidak ada nilai dikembalikan | disengaja; hanya status sukses |

**Key invariants**:
- Response tidak pernah memuat password, hash, atau string auth (FR-SEC-01); test menyisir bentuk response.
- Semua mutasi lewat pratinjau DDL kecuali reset password (dialog khusus, tetap dikompilasi provider).
- Gerbang capability di server (AC-6).

**Security model**: seluruh hak nyata milik credential koneksi (bagian 8.2 butir 6); Myadmin hanya meneruskan. Password baru diregistrasikan ke redaction sesaat (spec 0011 AC-5c) selama request hidup.

**Configuration required**: tidak ada.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. Perluas kontrak model principal dan deklarasi form; regenerasi; contract test.
2. Implementasikan `SecurityPort` bagian principal di kedua provider (list, describe form, create, alter, reset, drop; kompilasi DDL) plus test integrasi, memenuhi **AC-1** sampai **AC-5**.
3. Endpoint server bergerbang capability plus audit, memenuhi **AC-6**, **AC-7**.
4. UI feature security: daftar principal, form dinamis, dialog reset, konfirmasi drop, memenuhi **AC-2** sampai **AC-5**.
5. E2e dua engine dan test kebersihan rahasia, memenuhi **AC-8**.

## Consequences

**Positive**:
- Pengelolaan user database dari GUI dengan model aman; fondasi untuk privilege (spec 0046).

**Negative / tradeoffs**:
- Form dinamis menuntut deklarasi yang dirawat provider; harga dari UI engine netral.

**Neutral**:
- Role membership PostgreSQL read only di V1; pengelolaannya bagian dari grants lanjutan V2.

## Follow-up

- [ ] Tidak ada.

## References

**Project sources**:
- v1-feature-specification.md FR-SEC-01, FR-SEC-02, bagian 8.2 butir 6; spec 0021, 0031, 0039 (pola konfirmasi), 0019.

**Practices & standards**:
- UI data driven dari deklarasi adapter; tidak ada rahasia di response; pratinjau DDL.

**Links**: tidak ada yang diverifikasi untuk spec ini.
