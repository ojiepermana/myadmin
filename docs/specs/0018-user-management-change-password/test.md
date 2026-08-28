# Test dan acceptance criteria 0018. User management dan change password

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Belum dijalankan
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0018.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

`POST /auth/change-password` menerima password saat ini dan password baru; password saat ini diverifikasi; password baru melewati policy (spec 0010); sukses mengganti hash, mencabut semua sesi user itu kecuali sesi yang sedang dipakai, dan mencatat audit.

### AC-2

endpoint admin: `GET /users` (list dengan pagination), `POST /users` (buat user: username, password awal, role), `PATCH /users/:id` (role, is_active), `POST /users/:id/reset-password` (password baru); semuanya hanya untuk role admin; role user menjawab 403 `FORBIDDEN`.

### AC-3

menonaktifkan user mencabut seluruh sesinya seketika dan menolak login berikutnya; mengaktifkan kembali memulihkan login tanpa mengubah password.

### AC-4

invariant Admin terakhir: menonaktifkan atau menurunkan role Admin aktif terakhir ditolak dengan 409 `LAST_ADMIN`; ditegakkan dalam transaksi.

### AC-5

reset password oleh Admin mengganti hash, mencabut semua sesi user target, dan tercatat audit dengan actor Admin; password baru tidak pernah tampil di response atau log.

### AC-6

Admin tidak dapat mengubah role atau status dirinya lewat endpoint pengelolaan bila hal itu melanggar AC-4; menonaktifkan diri sendiri diperbolehkan hanya bila masih ada Admin aktif lain.

### AC-7

UI: halaman ganti password di menu user; halaman manajemen user (daftar, buat, ubah role, aktif nonaktif, reset password) di area admin; route admin dijaga guard role di web dan otorisasi di server (dua lapis); semua aksi memakai dialog konfirmasi foundation.

### AC-8

audit event: `user.created`, `user.role_changed`, `user.deactivated`, `user.activated`, `user.password_changed` (self), `user.password_reset` (admin), semuanya tanpa material rahasia.

### AC-9

e2e: user biasa tidak melihat menu admin dan mendapat 403 saat memaksa akses API; alur buat user, login sebagai user baru, nonaktifkan, login ditolak.

## Matriks cakupan

| AC | Unit | Integration | Contract | E2E | Security | Performance | Visual | Smoke | Manual atau external |
|---|---|---|---|---|---|---|---|---|---|
| [AC-1](#ac-1) | n/a | `IT-0018-AC1` | n/a | n/a | `SEC-0018-AC1` | n/a | n/a | n/a | n/a |
| [AC-2](#ac-2) | n/a | n/a | `CT-0018-AC2` | n/a | `SEC-0018-AC2` | n/a | n/a | n/a | n/a |
| [AC-3](#ac-3) | n/a | `IT-0018-AC3` | n/a | n/a | `SEC-0018-AC3` | n/a | n/a | n/a | n/a |
| [AC-4](#ac-4) | n/a | `IT-0018-AC4` | n/a | n/a | `SEC-0018-AC4` | n/a | n/a | n/a | n/a |
| [AC-5](#ac-5) | n/a | `IT-0018-AC5` | n/a | n/a | `SEC-0018-AC5` | n/a | n/a | n/a | n/a |
| [AC-6](#ac-6) | n/a | `IT-0018-AC6` | n/a | n/a | `SEC-0018-AC6` | n/a | n/a | n/a | n/a |
| [AC-7](#ac-7) | n/a | n/a | n/a | `E2E-0018-AC7` | n/a | n/a | `VIS-0018-AC7` | n/a | n/a |
| [AC-8](#ac-8) | n/a | `IT-0018-AC8` | n/a | n/a | `SEC-0018-AC8` | n/a | n/a | n/a | n/a |
| [AC-9](#ac-9) | n/a | n/a | n/a | `E2E-0018-AC9` | `SEC-0018-AC9` | n/a | n/a | n/a | n/a |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

Tidak ada unit yang diwajibkan oleh acceptance criteria saat ini.

## Integration test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `IT-0018-AC1` | [AC-1](#ac-1) | POST /auth/change-password menerima password saat ini dan password baru; password saat ini diverifikasi; password baru melewati policy (spec 0010); sukses me... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `IT-0018-AC3` | [AC-3](#ac-3) | menonaktifkan user mencabut seluruh sesinya seketika dan menolak login berikutnya; mengaktifkan kembali memulihkan login tanpa mengubah password. | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `IT-0018-AC4` | [AC-4](#ac-4) | invariant Admin terakhir: menonaktifkan atau menurunkan role Admin aktif terakhir ditolak dengan 409 LAST_ADMIN; ditegakkan dalam transaksi. | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `IT-0018-AC5` | [AC-5](#ac-5) | reset password oleh Admin mengganti hash, mencabut semua sesi user target, dan tercatat audit dengan actor Admin; password baru tidak pernah tampil di respon... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `IT-0018-AC6` | [AC-6](#ac-6) | Admin tidak dapat mengubah role atau status dirinya lewat endpoint pengelolaan bila hal itu melanggar AC-4; menonaktifkan diri sendiri diperbolehkan hanya bi... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `IT-0018-AC8` | [AC-8](#ac-8) | audit event: user.created, user.role_changed, user.deactivated, user.activated, user.password_changed (self), user.password_reset (admin), semuanya tanpa mat... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

## Test tambahan

### Contract test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `CT-0018-AC2` | [AC-2](#ac-2) | endpoint admin: GET /users (list dengan pagination), POST /users (buat user: username, password awal, role), PATCH /users/:id (role, is_active), POST /users/... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |

### E2E

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `E2E-0018-AC7` | [AC-7](#ac-7) | UI: halaman ganti password di menu user; halaman manajemen user (daftar, buat, ubah role, aktif nonaktif, reset password) di area admin; route admin dijaga g... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |
| `E2E-0018-AC9` | [AC-9](#ac-9) | e2e: user biasa tidak melihat menu admin dan mendapat 403 saat memaksa akses API; alur buat user, login sebagai user baru, nonaktifkan, login ditolak. | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-9 terpenuhi. |

### Security

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `SEC-0018-AC1` | [AC-1](#ac-1) | POST /auth/change-password menerima password saat ini dan password baru; password saat ini diverifikasi; password baru melewati policy (spec 0010); sukses me... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `SEC-0018-AC2` | [AC-2](#ac-2) | endpoint admin: GET /users (list dengan pagination), POST /users (buat user: username, password awal, role), PATCH /users/:id (role, is_active), POST /users/... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `SEC-0018-AC3` | [AC-3](#ac-3) | menonaktifkan user mencabut seluruh sesinya seketika dan menolak login berikutnya; mengaktifkan kembali memulihkan login tanpa mengubah password. | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `SEC-0018-AC4` | [AC-4](#ac-4) | invariant Admin terakhir: menonaktifkan atau menurunkan role Admin aktif terakhir ditolak dengan 409 LAST_ADMIN; ditegakkan dalam transaksi. | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `SEC-0018-AC5` | [AC-5](#ac-5) | reset password oleh Admin mengganti hash, mencabut semua sesi user target, dan tercatat audit dengan actor Admin; password baru tidak pernah tampil di respon... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `SEC-0018-AC6` | [AC-6](#ac-6) | Admin tidak dapat mengubah role atau status dirinya lewat endpoint pengelolaan bila hal itu melanggar AC-4; menonaktifkan diri sendiri diperbolehkan hanya bi... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `SEC-0018-AC8` | [AC-8](#ac-8) | audit event: user.created, user.role_changed, user.deactivated, user.activated, user.password_changed (self), user.password_reset (admin), semuanya tanpa mat... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |
| `SEC-0018-AC9` | [AC-9](#ac-9) | e2e: user biasa tidak melihat menu admin dan mendapat 403 saat memaksa akses API; alur buat user, login sebagai user baru, nonaktifkan, login ditolak. | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-9 terpenuhi. |

### Performance

Tidak ada performance yang diwajibkan oleh acceptance criteria saat ini.

### Visual dan accessibility

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `VIS-0018-AC7` | [AC-7](#ac-7) | UI: halaman ganti password di menu user; halaman manajemen user (daftar, buat, ubah role, aktif nonaktif, reset password) di area admin; route admin dijaga g... | Kunci viewport, mode warna, state komponen, interaksi keyboard, dan bukti screenshot. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

### Smoke dan operational acceptance

Tidak ada smoke dan operational yang diwajibkan oleh acceptance criteria saat ini.

### Manual atau external proof

Tidak ada manual atau external yang diwajibkan oleh acceptance criteria saat ini.

## Critical test scenarios

- Happy path: buat user → login user → nonaktifkan → sesi putus dan login ditolak, verifikasi **AC-2**, **AC-3**, **AC-9**.
- Invariant: turunkan role admin satu satunya → 409 LAST_ADMIN, verifikasi **AC-4**.
- Auth: change password dengan current salah → 401 dan tanpa perubahan; sukses mencabut sesi lain, verifikasi **AC-1**.

## Staged, environment, dan external proof

Tidak ada staged, environment, atau external proof khusus yang sudah diidentifikasi.

## Fixture dan environment

| Area | Aturan |
|---|---|
| Data | Gunakan data sintetis atau tersanitasi. Jangan memakai credential, token, atau data produksi nyata. |
| Resource | Database, file, port, process, dan container harus disposable serta memiliki cleanup deterministik. |
| Version | Pin versi environment yang dibuktikan. Jangan memakai label dinamis seperti `latest` sebagai bukti acceptance. |
| Root command | Instalasi dan command test selalu dimulai dari akar repo dan satu `package.json`. |

## Exit criteria test

- Setiap AC memiliki test ID atau jalur proof yang eksplisit pada [verify.md](verify.md).
- Unit dan integration test yang relevan diimplementasikan, lulus, dan dapat diulang dari checkout bersih.
- Test yang tidak relevan ditandai `n/a` dengan alasan yang tetap benar setelah implementasi.
- External proof tidak boleh diganti local smoke test. Staged proof tidak boleh ditutup sebelum dependency yang disebut tersedia.
- Tidak ada test yang dianggap lulus hanya karena file atau placeholder tersedia.
