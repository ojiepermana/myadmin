# 0018. User management dan change password

**Date**: 2026-08-28
**Status**: In Progress
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini melengkapi auth lokal: pengguna bisa mengganti password sendiri, dan Admin bisa membuat user, mengatur role Admin atau User, menonaktifkan dan mengaktifkan, serta menyetel ulang password user. Semua route admin dilindungi role, semua mutasi diaudit, dan instance tidak pernah bisa kehilangan Admin terakhirnya.

## Context

FR-AUTH-04 (change password memverifikasi password saat ini dan diaudit) dan FR-AUTH-06 (Admin membuat dan mengelola user dasar, role Admin/User, user tidak bisa akses route admin) adalah sisa P0/P1 auth. Model role V1 sengaja dua tingkat (bagian 6); custom role adalah V2. Keputusan kecil yang diambil di sini: reset password oleh Admin berbentuk Admin menyetel password baru langsung, tanpa alur force change (tidak ada mekanisme itu di scope V1).

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0017.

## Requirements

**User stories**:

- Sebagai pengguna, saya ingin mengganti password saya sendiri dengan aman.
- Sebagai Admin, saya ingin menambahkan rekan kerja sebagai user dan mencabut aksesnya saat tidak diperlukan.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): `POST /auth/change-password` menerima password saat ini dan password baru; password saat ini diverifikasi; password baru melewati policy (spec 0010); sukses mengganti hash, mencabut semua sesi user itu kecuali sesi yang sedang dipakai, dan mencatat audit.
- [**AC-2**](test.md#ac-2): endpoint admin: `GET /users` (list dengan pagination), `POST /users` (buat user: username, password awal, role), `PATCH /users/:id` (role, is_active), `POST /users/:id/reset-password` (password baru); semuanya hanya untuk role admin; role user menjawab 403 `FORBIDDEN`.
- [**AC-3**](test.md#ac-3): menonaktifkan user mencabut seluruh sesinya seketika dan menolak login berikutnya; mengaktifkan kembali memulihkan login tanpa mengubah password.
- [**AC-4**](test.md#ac-4): invariant Admin terakhir: menonaktifkan atau menurunkan role Admin aktif terakhir ditolak dengan 409 `LAST_ADMIN`; ditegakkan dalam transaksi.
- [**AC-5**](test.md#ac-5): reset password oleh Admin mengganti hash, mencabut semua sesi user target, dan tercatat audit dengan actor Admin; password baru tidak pernah tampil di response atau log.
- [**AC-6**](test.md#ac-6): Admin tidak dapat mengubah role atau status dirinya lewat endpoint pengelolaan bila hal itu melanggar AC-4; menonaktifkan diri sendiri diperbolehkan hanya bila masih ada Admin aktif lain.
- [**AC-7**](test.md#ac-7): UI: halaman ganti password di menu user; halaman manajemen user (daftar, buat, ubah role, aktif nonaktif, reset password) di area admin; route admin dijaga guard role di web dan otorisasi di server (dua lapis); semua aksi memakai dialog konfirmasi foundation.
- [**AC-8**](test.md#ac-8): audit event: `user.created`, `user.role_changed`, `user.deactivated`, `user.activated`, `user.password_changed` (self), `user.password_reset` (admin), semuanya tanpa material rahasia.
- [**AC-9**](test.md#ac-9): e2e: user biasa tidak melihat menu admin dan mendapat 403 saat memaksa akses API; alur buat user, login sebagai user baru, nonaktifkan, login ditolak.

## Options considered

### Option 1: Reset password admin menyetel password baru langsung (dipilih)

**Pros**:

- Tanpa mekanisme tambahan (email, token reset) yang tidak ada di scope V1; cocok untuk alat internal self hosted.

**Cons**:

- Admin mengetahui password sementara user; dimitigasi kebiasaan user mengganti sendiri setelahnya (dianjurkan di UI).

### Option 2: Alur force change at next login

**Pros**:

- Password sementara berumur pendek secara paksa.

**Cons**:

- Menambah state dan alur login bersyarat yang tidak diminta scope V1; ditunda.

## Decision

**Chosen option**: Option 1, dengan anjuran ganti password di UI setelah reset.

Otorisasi role ditegakkan middleware server per route admin dan guard di web; invariant Admin terakhir hidup di use case dalam transaksi (basis: FR-AUTH-06; bagian 6 v1-feature-specification).

## Rationale

Scope V1 menyebut manajemen user "dasar" dengan sengaja; setiap tambahan alur (undangan, force change) menunda fondasi lain tanpa diminta. Yang tidak boleh dikompromikan justru dua hal yang sering terlewat: pencabutan sesi pada perubahan kredensial dan status (kalau tidak, deactivate hanyalah kosmetik), dan invariant Admin terakhir (kalau tidak, instance bisa mengunci dirinya sendiri).

## Feature design

**Data model sketch**: memakai tabel `users` dan `sessions` (spec 0008); tidak ada tabel baru.

**State transitions** (user): active ⇄ inactive; role user ⇄ admin (dibatasi AC-4).

**API surface**:

| Endpoint                  | Method | Key inputs                   | Key outputs  | Auth          | Key errors                     |
| ------------------------- | ------ | ---------------------------- | ------------ | ------------- | ------------------------------ |
| /auth/change-password     | POST   | currentPassword, newPassword | kosong       | sessionCookie | 401 password salah, 422 policy |
| /users                    | GET    | page, pageSize               | items, total | admin         | 403                            |
| /users                    | POST   | username, password, role     | user         | admin         | 409 username dipakai, 422      |
| /users/:id                | PATCH  | role?, isActive?             | user         | admin         | 404, 409 LAST_ADMIN            |
| /users/:id/reset-password | POST   | newPassword                  | kosong       | admin         | 404, 422                       |

**Value sourcing**:

| Action          | Value produced / displayed        | Source                                            |
| --------------- | --------------------------------- | ------------------------------------------------- |
| change password | keputusan sesi mana dipertahankan | id sesi dari cookie request itu                   |
| list users      | status aktif, role                | kolom users                                       |
| LAST_ADMIN      | jumlah admin aktif                | hitungan dalam transaksi yang sama dengan mutasi  |
| reset password  | password baru                     | input Admin; hanya di body request, tidak dicatat |

**Key invariants**:

- Selalu ada minimal satu Admin aktif (AC-4).
- Setiap perubahan kredensial atau status mencabut sesi yang terdampak (AC-1, AC-3, AC-5).
- Response user tidak pernah memuat `password_hash`.

**Security model**: role admin untuk semua endpoint `/users*`; change password milik pemilik sesi; otorisasi selalu di server, guard web hanya kenyamanan (bagian 8.2 butir 5).

**Configuration required**: tidak ada baru.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. Use case di `packages/auth`: changePassword, createUser, updateUserRoleStatus (dengan LAST_ADMIN dalam transaksi), resetPassword; unit test fake repo, memenuhi **AC-1**, **AC-3**, **AC-4**, **AC-5**, **AC-6**.
2. Tambahkan operasi ke kontrak OpenAPI plus regenerasi tipe dan SDK, daftarkan ke contract test.
3. Endpoint server plus middleware role admin, memenuhi **AC-2**.
4. Web: halaman ganti password dan halaman admin users (daftar, form, konfirmasi), guard role, memenuhi **AC-7**.
5. Audit event lengkap, memenuhi **AC-8**.
6. E2e dua peran dan test keamanan otorisasi di `tests/security/authorization/`, memenuhi **AC-9**.

## Consequences

**Positive**:

- Model dua peran V1 selesai; fitur berikutnya tinggal memakai `admin`/`user` yang sudah ditegakkan.

**Negative / tradeoffs**:

- Tanpa force change, kebersihan password pasca reset bergantung pada user; dicatat sebagai kandidat V2.

**Neutral**:

- Kepemilikan koneksi per user (spec 0026) akan menumpang model user ini.

## Follow-up

- [ ] V2: alur force change password dan kebijakan password yang bisa dikonfigurasi.

## References

**Project sources**:

- v1-feature-specification.md FR-AUTH-04, FR-AUTH-06, bagian 6; spec 0010, 0017.

**Practices & standards**:

- Pencabutan sesi pada perubahan kredensial; invariant di transaksi; otorisasi server side dua lapis dengan UI.

**Links**: tidak ada yang diverifikasi untuk spec ini.
