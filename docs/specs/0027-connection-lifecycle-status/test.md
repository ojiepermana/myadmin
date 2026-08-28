# Test dan acceptance criteria 0027. Connection manager: lifecycle dan status

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Belum dijalankan
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0027.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

`POST /connections/:id/connect` membuka sesi provider untuk pemilik koneksi; credential dari vault, atau dari `secret` transient di body bila tidak tersimpan (tidak dicatat, tidak dipersist); sukses mengembalikan status `connected` plus serverInfo (engine, versi) dan capability (FR-PROV-04).

### AC-2

registry sesi aktif di server memetakan (userId, connectionId) → sesi provider; connect ulang saat sudah tersambung adalah no op yang mengembalikan status kini; dua koneksi berbeda punya state independen (FR-CONN-04).

### AC-3

`POST /connections/:id/disconnect` menutup sesi provider dan membebaskan resource; `POST /connections/:id/reconnect` menutup lalu membuka lagi dengan credential yang sama (vault) atau meminta transient lagi bila tidak tersimpan.

### AC-4

`GET /connections/status` mengembalikan status seluruh koneksi milik user: `disconnected` | `connecting` | `connected` | `error` dengan detail aman (kategori error, waktu perubahan, versi server, latency test terakhir); UI mem poll ringan (10 detik) sampai spec 0029 menggantinya dengan push.

### AC-5

kegagalan sesi di tengah jalan (server database mati) terdeteksi saat operasi berikutnya gagal; status koneksi menjadi `error` dengan kategori, dan reconnect memulihkannya; tidak ada retry otomatis diam diam di V1 (pengguna memutuskan).

### AC-6

logout, kadaluarsa sesi aplikasi, atau penghapusan koneksi menutup sesi provider terkait; shutdown server menutup semua sesi provider dengan rapi.

### AC-7

sidebar menampilkan indikator status per koneksi (warna plus ikon dan teks yang bisa diakses screen reader); status bar menampilkan koneksi aktif konteks kini: label, engine, versi, latency (FR-CONN-06, FR-OPS-01); tidak ada credential atau connection string di tampilan mana pun.

### AC-8

connect dan disconnect tercatat audit (`connection.opened`, `connection.closed`) tanpa secret; kegagalan connect tercatat dengan kategori.

### AC-9

idle timeout sesi provider: sesi tanpa aktivitas 30 menit ditutup otomatis dan status kembali `disconnected` dengan alasan `idle_closed` yang terlihat pengguna; nilai dari config `provider.idleTimeoutMinutes`.

## Matriks cakupan

| AC | Unit | Integration | Contract | E2E | Security | Performance | Visual | Smoke | Manual atau external |
|---|---|---|---|---|---|---|---|---|---|
| [AC-1](#ac-1) | n/a | `IT-0027-AC1` | n/a | n/a | `SEC-0027-AC1` | n/a | n/a | n/a | n/a |
| [AC-2](#ac-2) | `UT-0027-AC2` | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-3](#ac-3) | n/a | `IT-0027-AC3` | n/a | n/a | `SEC-0027-AC3` | n/a | n/a | n/a | n/a |
| [AC-4](#ac-4) | n/a | `IT-0027-AC4` | n/a | `E2E-0027-AC4` | n/a | n/a | n/a | n/a | n/a |
| [AC-5](#ac-5) | n/a | `IT-0027-AC5` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-6](#ac-6) | n/a | `IT-0027-AC6` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-7](#ac-7) | n/a | n/a | n/a | `E2E-0027-AC7` | `SEC-0027-AC7` | n/a | `VIS-0027-AC7` | n/a | n/a |
| [AC-8](#ac-8) | n/a | `IT-0027-AC8` | n/a | n/a | `SEC-0027-AC8` | n/a | n/a | n/a | n/a |
| [AC-9](#ac-9) | `UT-0027-AC9` | `IT-0027-AC9` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `UT-0027-AC2` | [AC-2](#ac-2) | registry sesi aktif di server memetakan (userId, connectionId) → sesi provider; connect ulang saat sudah tersambung adalah no op yang mengembalikan status ki... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `UT-0027-AC9` | [AC-9](#ac-9) | idle timeout sesi provider: sesi tanpa aktivitas 30 menit ditutup otomatis dan status kembali disconnected dengan alasan idle_closed yang terlihat pengguna;... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-9 terpenuhi. |

## Integration test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `IT-0027-AC1` | [AC-1](#ac-1) | POST /connections/:id/connect membuka sesi provider untuk pemilik koneksi; credential dari vault, atau dari secret transient di body bila tidak tersimpan (ti... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `IT-0027-AC3` | [AC-3](#ac-3) | POST /connections/:id/disconnect menutup sesi provider dan membebaskan resource; POST /connections/:id/reconnect menutup lalu membuka lagi dengan credential... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `IT-0027-AC4` | [AC-4](#ac-4) | GET /connections/status mengembalikan status seluruh koneksi milik user: disconnected \| connecting \| connected \| error dengan detail aman (kategori error,... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `IT-0027-AC5` | [AC-5](#ac-5) | kegagalan sesi di tengah jalan (server database mati) terdeteksi saat operasi berikutnya gagal; status koneksi menjadi error dengan kategori, dan reconnect m... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `IT-0027-AC6` | [AC-6](#ac-6) | logout, kadaluarsa sesi aplikasi, atau penghapusan koneksi menutup sesi provider terkait; shutdown server menutup semua sesi provider dengan rapi. | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `IT-0027-AC8` | [AC-8](#ac-8) | connect dan disconnect tercatat audit (connection.opened, connection.closed) tanpa secret; kegagalan connect tercatat dengan kategori. | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |
| `IT-0027-AC9` | [AC-9](#ac-9) | idle timeout sesi provider: sesi tanpa aktivitas 30 menit ditutup otomatis dan status kembali disconnected dengan alasan idle_closed yang terlihat pengguna;... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-9 terpenuhi. |

## Test tambahan

### Contract test

Tidak ada contract yang diwajibkan oleh acceptance criteria saat ini.

### E2E

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `E2E-0027-AC4` | [AC-4](#ac-4) | GET /connections/status mengembalikan status seluruh koneksi milik user: disconnected \| connecting \| connected \| error dengan detail aman (kategori error,... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `E2E-0027-AC7` | [AC-7](#ac-7) | sidebar menampilkan indikator status per koneksi (warna plus ikon dan teks yang bisa diakses screen reader); status bar menampilkan koneksi aktif konteks kin... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

### Security

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `SEC-0027-AC1` | [AC-1](#ac-1) | POST /connections/:id/connect membuka sesi provider untuk pemilik koneksi; credential dari vault, atau dari secret transient di body bila tidak tersimpan (ti... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `SEC-0027-AC3` | [AC-3](#ac-3) | POST /connections/:id/disconnect menutup sesi provider dan membebaskan resource; POST /connections/:id/reconnect menutup lalu membuka lagi dengan credential... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `SEC-0027-AC7` | [AC-7](#ac-7) | sidebar menampilkan indikator status per koneksi (warna plus ikon dan teks yang bisa diakses screen reader); status bar menampilkan koneksi aktif konteks kin... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |
| `SEC-0027-AC8` | [AC-8](#ac-8) | connect dan disconnect tercatat audit (connection.opened, connection.closed) tanpa secret; kegagalan connect tercatat dengan kategori. | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

### Performance

Tidak ada performance yang diwajibkan oleh acceptance criteria saat ini.

### Visual dan accessibility

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `VIS-0027-AC7` | [AC-7](#ac-7) | sidebar menampilkan indikator status per koneksi (warna plus ikon dan teks yang bisa diakses screen reader); status bar menampilkan koneksi aktif konteks kin... | Kunci viewport, mode warna, state komponen, interaksi keyboard, dan bukti screenshot. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

### Smoke dan operational acceptance

Tidak ada smoke dan operational yang diwajibkan oleh acceptance criteria saat ini.

### Manual atau external proof

Tidak ada manual atau external yang diwajibkan oleh acceptance criteria saat ini.

## Critical test scenarios

- Happy path: connect (vault) → status connected dengan versi → disconnect, verifikasi **AC-1**, **AC-3**.
- Transient: koneksi tanpa saved secret → connect tanpa secret gagal dengan penanda butuh password → connect dengan secret sukses, verifikasi **AC-1**.
- Putus tengah jalan: matikan server test → operasi gagal → status error → reconnect pulih, verifikasi **AC-5**.
- Kebersihan: logout menutup sesi provider (dibuktikan dari sisi server database test), verifikasi **AC-6**.

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
