# Test dan acceptance criteria 0052. Settings dan preferences

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Belum dijalankan
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0052.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

preferences API: `GET /preferences` (semua milik user), `PUT /preferences/:key` (nilai JSON tervalidasi terhadap daftar key dikenal dengan schema per key); key V1: `ui.theme`, `ui.pageSize` (default ukuran halaman data browser), `editor.fontSize`, `editor.wordWrap`; key tak dikenal ditolak 422.

### AC-2

theme store (spec 0014) membaca dan menulis `ui.theme` lewat preferences setelah login; sebelum login tetap localStorage; konflik diselesaikan dengan nilai server menang saat login, lalu perubahan berikutnya tersinkron.

### AC-3

settings API (admin only): `GET /settings`, `PUT /settings/:key` untuk key V1: `history.maxEntriesPerUser` (dipakai retensi spec 0009), `security.sessionNote` tidak ada... hanya key yang benar benar dipakai: `history.maxEntriesPerUser`; daftar ini kecil dengan sengaja dan bertambah hanya lewat spec fitur; nilai tervalidasi (angka positif berbatas).

### AC-4

perubahan settings diaudit (`settings.changed`: key, nilai lama dan baru bila tidak sensitif) sebelum sukses; preferences tidak diaudit (selera pribadi).

### AC-5

UI: halaman settings dengan dua bagian: Preferensi (semua user; theme, page size, editor) dan Pengaturan Aplikasi (tampil hanya untuk Admin; form per key dengan penjelasan dampak); perubahan langsung berlaku (store reaktif) tanpa reload.

### AC-6

nilai preferences dan settings dibaca lewat lapisan tunggal di server (SettingsService dengan cache dan invalidasi saat tulis) sehingga pemakai (retensi history) selalu melihat nilai kini.

### AC-7

e2e: ganti theme di satu browser, login di konteks lain, theme mengikuti; Admin mengubah retensi dan nilai efektif berubah (dibuktikan lewat perilaku retensi); user biasa tidak melihat bagian Admin dan API nya menolak 403.

## Matriks cakupan

| AC | Unit | Integration | Contract | E2E | Security | Performance | Visual | Smoke | Manual atau external |
|---|---|---|---|---|---|---|---|---|---|
| [AC-1](#ac-1) | `UT-0052-AC1` | `IT-0052-AC1` | `CT-0052-AC1` | n/a | `SEC-0052-AC1` | n/a | n/a | n/a | n/a |
| [AC-2](#ac-2) | `UT-0052-AC2` | `IT-0052-AC2` | n/a | `E2E-0052-AC2` | n/a | n/a | n/a | n/a | n/a |
| [AC-3](#ac-3) | `UT-0052-AC3` | `IT-0052-AC3` | `CT-0052-AC3` | n/a | `SEC-0052-AC3` | n/a | n/a | n/a | n/a |
| [AC-4](#ac-4) | n/a | `IT-0052-AC4` | n/a | n/a | `SEC-0052-AC4` | n/a | n/a | n/a | n/a |
| [AC-5](#ac-5) | `UT-0052-AC5` | n/a | n/a | `E2E-0052-AC5` | `SEC-0052-AC5` | n/a | n/a | n/a | n/a |
| [AC-6](#ac-6) | `UT-0052-AC6` | `IT-0052-AC6` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-7](#ac-7) | n/a | `IT-0052-AC7` | n/a | `E2E-0052-AC7` | `SEC-0052-AC7` | n/a | n/a | n/a | n/a |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `UT-0052-AC1` | [AC-1](#ac-1) | preferences API: GET /preferences (semua milik user), PUT /preferences/:key (nilai JSON tervalidasi terhadap daftar key dikenal dengan schema per key); key V... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `UT-0052-AC2` | [AC-2](#ac-2) | theme store (spec 0014) membaca dan menulis ui.theme lewat preferences setelah login; sebelum login tetap localStorage; konflik diselesaikan dengan nilai ser... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `UT-0052-AC3` | [AC-3](#ac-3) | settings API (admin only): GET /settings, PUT /settings/:key untuk key V1: history.maxEntriesPerUser (dipakai retensi spec 0009), security.sessionNote tidak... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `UT-0052-AC5` | [AC-5](#ac-5) | UI: halaman settings dengan dua bagian: Preferensi (semua user; theme, page size, editor) dan Pengaturan Aplikasi (tampil hanya untuk Admin; form per key den... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `UT-0052-AC6` | [AC-6](#ac-6) | nilai preferences dan settings dibaca lewat lapisan tunggal di server (SettingsService dengan cache dan invalidasi saat tulis) sehingga pemakai (retensi hist... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

## Integration test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `IT-0052-AC1` | [AC-1](#ac-1) | preferences API: GET /preferences (semua milik user), PUT /preferences/:key (nilai JSON tervalidasi terhadap daftar key dikenal dengan schema per key); key V... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `IT-0052-AC2` | [AC-2](#ac-2) | theme store (spec 0014) membaca dan menulis ui.theme lewat preferences setelah login; sebelum login tetap localStorage; konflik diselesaikan dengan nilai ser... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `IT-0052-AC3` | [AC-3](#ac-3) | settings API (admin only): GET /settings, PUT /settings/:key untuk key V1: history.maxEntriesPerUser (dipakai retensi spec 0009), security.sessionNote tidak... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `IT-0052-AC4` | [AC-4](#ac-4) | perubahan settings diaudit (settings.changed: key, nilai lama dan baru bila tidak sensitif) sebelum sukses; preferences tidak diaudit (selera pribadi). | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `IT-0052-AC6` | [AC-6](#ac-6) | nilai preferences dan settings dibaca lewat lapisan tunggal di server (SettingsService dengan cache dan invalidasi saat tulis) sehingga pemakai (retensi hist... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `IT-0052-AC7` | [AC-7](#ac-7) | e2e: ganti theme di satu browser, login di konteks lain, theme mengikuti; Admin mengubah retensi dan nilai efektif berubah (dibuktikan lewat perilaku retensi... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

## Test tambahan

### Contract test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `CT-0052-AC1` | [AC-1](#ac-1) | preferences API: GET /preferences (semua milik user), PUT /preferences/:key (nilai JSON tervalidasi terhadap daftar key dikenal dengan schema per key); key V... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `CT-0052-AC3` | [AC-3](#ac-3) | settings API (admin only): GET /settings, PUT /settings/:key untuk key V1: history.maxEntriesPerUser (dipakai retensi spec 0009), security.sessionNote tidak... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |

### E2E

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `E2E-0052-AC2` | [AC-2](#ac-2) | theme store (spec 0014) membaca dan menulis ui.theme lewat preferences setelah login; sebelum login tetap localStorage; konflik diselesaikan dengan nilai ser... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `E2E-0052-AC5` | [AC-5](#ac-5) | UI: halaman settings dengan dua bagian: Preferensi (semua user; theme, page size, editor) dan Pengaturan Aplikasi (tampil hanya untuk Admin; form per key den... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `E2E-0052-AC7` | [AC-7](#ac-7) | e2e: ganti theme di satu browser, login di konteks lain, theme mengikuti; Admin mengubah retensi dan nilai efektif berubah (dibuktikan lewat perilaku retensi... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

### Security

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `SEC-0052-AC1` | [AC-1](#ac-1) | preferences API: GET /preferences (semua milik user), PUT /preferences/:key (nilai JSON tervalidasi terhadap daftar key dikenal dengan schema per key); key V... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `SEC-0052-AC3` | [AC-3](#ac-3) | settings API (admin only): GET /settings, PUT /settings/:key untuk key V1: history.maxEntriesPerUser (dipakai retensi spec 0009), security.sessionNote tidak... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `SEC-0052-AC4` | [AC-4](#ac-4) | perubahan settings diaudit (settings.changed: key, nilai lama dan baru bila tidak sensitif) sebelum sukses; preferences tidak diaudit (selera pribadi). | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `SEC-0052-AC5` | [AC-5](#ac-5) | UI: halaman settings dengan dua bagian: Preferensi (semua user; theme, page size, editor) dan Pengaturan Aplikasi (tampil hanya untuk Admin; form per key den... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `SEC-0052-AC7` | [AC-7](#ac-7) | e2e: ganti theme di satu browser, login di konteks lain, theme mengikuti; Admin mengubah retensi dan nilai efektif berubah (dibuktikan lewat perilaku retensi... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

### Performance

Tidak ada performance yang diwajibkan oleh acceptance criteria saat ini.

### Visual dan accessibility

Tidak ada visual dan accessibility yang diwajibkan oleh acceptance criteria saat ini.

### Smoke dan operational acceptance

Tidak ada smoke dan operational yang diwajibkan oleh acceptance criteria saat ini.

### Manual atau external proof

Tidak ada manual atau external yang diwajibkan oleh acceptance criteria saat ini.

## Critical test scenarios

- Sinkron theme lintas sesi, verifikasi **AC-2**, **AC-7**.
- Efek runtime: retensi diubah 1000 → 10, penulisan history berikutnya memangkas, verifikasi **AC-3**, **AC-6**.
- Otorisasi: user PUT settings → 403, verifikasi **AC-3**.

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
