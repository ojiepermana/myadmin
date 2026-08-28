# Test dan acceptance criteria 0010. Key provider dan password hashing

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Belum dijalankan
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0010.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

pada first run, key provider menghasilkan master key acak 32 byte (CSPRNG) dan menyimpannya ke `<data-dir>/config/master.key` dengan permission `0600` (Windows: ACL setara, hanya user pemilik); pembuatan atomik (tulis ke file sementara lalu rename).

### AC-2

`MYADMIN_MASTER_KEY` (base64 atau hex, 32 byte setelah decode) mengoverride keyfile; `MYADMIN_KEY_FILE` mengoverride lokasi file; prioritas: env key → env path → path default.

### AC-3

key yang berhasil dimuat mendapat `key_id` (turunan pendek dari hash key, bukan key nya) yang direkam di metadata credential (spec 0008 kolom `key_id`); key yang tidak cocok dengan `key_id` ciphertext menghasilkan error jelas "key salah", bukan kegagalan dekripsi misterius.

### AC-4

keyfile dengan permission longgar (group/world readable) membuat boot menolak start dengan instruksi perbaikan; doctor (spec 0007) mendaftarkan check yang sama sebagai pemeriksaan.

### AC-5

isi key tidak pernah tampil di log, error, doctor, atau proses list (tidak lewat argumen CLI); redaction menutup pola nilai key.

### AC-6

password hashing memakai argon2id lewat `Bun.password` dengan konfigurasi eksplisit (memoryCost dan timeCost dinyatakan di kode, bukan mengandalkan default diam diam); verify konstan waktu lewat API yang sama.

### AC-7

kebijakan password terdefinisi di `password-policy.ts`: panjang minimum 10, tanpa aturan komposisi rumit, cek terhadap username sama; batas maksimum 256; pesan pelanggaran jelas.

### AC-8

hash lama dengan parameter usang terdeteksi saat login (needsRehash) dan di rehash transparan setelah verifikasi sukses.

### AC-9

unit test menutup: first run membuat keyfile benar, override env, permission longgar ditolak, hash dan verify round trip, rehash.

## Matriks cakupan

| AC | Unit | Integration | Contract | E2E | Security | Performance | Visual | Smoke | Manual atau external |
|---|---|---|---|---|---|---|---|---|---|
| [AC-1](#ac-1) | n/a | `IT-0010-AC1` | n/a | n/a | `SEC-0010-AC1` | n/a | n/a | n/a | n/a |
| [AC-2](#ac-2) | `UT-0010-AC2` | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-3](#ac-3) | n/a | n/a | n/a | n/a | `SEC-0010-AC3` | n/a | n/a | n/a | n/a |
| [AC-4](#ac-4) | n/a | `IT-0010-AC4` | n/a | n/a | `SEC-0010-AC4` | n/a | n/a | n/a | n/a |
| [AC-5](#ac-5) | n/a | n/a | n/a | n/a | `SEC-0010-AC5` | n/a | n/a | n/a | n/a |
| [AC-6](#ac-6) | n/a | n/a | n/a | n/a | `SEC-0010-AC6` | `PERF-0010-AC6` | n/a | n/a | n/a |
| [AC-7](#ac-7) | `UT-0010-AC7` | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-8](#ac-8) | n/a | n/a | n/a | n/a | `SEC-0010-AC8` | n/a | n/a | n/a | n/a |
| [AC-9](#ac-9) | `UT-0010-AC9` | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `UT-0010-AC2` | [AC-2](#ac-2) | MYADMIN_MASTER_KEY (base64 atau hex, 32 byte setelah decode) mengoverride keyfile; MYADMIN_KEY_FILE mengoverride lokasi file; prioritas: env key → env path →... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `UT-0010-AC7` | [AC-7](#ac-7) | kebijakan password terdefinisi di password-policy.ts: panjang minimum 10, tanpa aturan komposisi rumit, cek terhadap username sama; batas maksimum 256; pesan... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |
| `UT-0010-AC9` | [AC-9](#ac-9) | unit test menutup: first run membuat keyfile benar, override env, permission longgar ditolak, hash dan verify round trip, rehash. | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-9 terpenuhi. |

## Integration test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `IT-0010-AC1` | [AC-1](#ac-1) | pada first run, key provider menghasilkan master key acak 32 byte (CSPRNG) dan menyimpannya ke <data-dir>/config/master.key dengan permission 0600 (Windows:... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `IT-0010-AC4` | [AC-4](#ac-4) | keyfile dengan permission longgar (group/world readable) membuat boot menolak start dengan instruksi perbaikan; doctor (spec 0007) mendaftarkan check yang sa... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |

## Test tambahan

### Contract test

Tidak ada contract yang diwajibkan oleh acceptance criteria saat ini.

### E2E

Tidak ada e2e yang diwajibkan oleh acceptance criteria saat ini.

### Security

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `SEC-0010-AC1` | [AC-1](#ac-1) | pada first run, key provider menghasilkan master key acak 32 byte (CSPRNG) dan menyimpannya ke <data-dir>/config/master.key dengan permission 0600 (Windows:... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `SEC-0010-AC3` | [AC-3](#ac-3) | key yang berhasil dimuat mendapat key_id (turunan pendek dari hash key, bukan key nya) yang direkam di metadata credential (spec 0008 kolom key_id); key yang... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `SEC-0010-AC4` | [AC-4](#ac-4) | keyfile dengan permission longgar (group/world readable) membuat boot menolak start dengan instruksi perbaikan; doctor (spec 0007) mendaftarkan check yang sa... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `SEC-0010-AC5` | [AC-5](#ac-5) | isi key tidak pernah tampil di log, error, doctor, atau proses list (tidak lewat argumen CLI); redaction menutup pola nilai key. | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `SEC-0010-AC6` | [AC-6](#ac-6) | password hashing memakai argon2id lewat Bun.password dengan konfigurasi eksplisit (memoryCost dan timeCost dinyatakan di kode, bukan mengandalkan default dia... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `SEC-0010-AC8` | [AC-8](#ac-8) | hash lama dengan parameter usang terdeteksi saat login (needsRehash) dan di rehash transparan setelah verifikasi sukses. | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

### Performance

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `PERF-0010-AC6` | [AC-6](#ac-6) | password hashing memakai argon2id lewat Bun.password dengan konfigurasi eksplisit (memoryCost dan timeCost dinyatakan di kode, bukan mengandalkan default dia... | Tetapkan dataset, baseline, ambang, pengulangan, dan toleransi sebelum eksekusi. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

### Visual dan accessibility

Tidak ada visual dan accessibility yang diwajibkan oleh acceptance criteria saat ini.

### Smoke dan operational acceptance

Tidak ada smoke dan operational yang diwajibkan oleh acceptance criteria saat ini.

### Manual atau external proof

Tidak ada manual atau external yang diwajibkan oleh acceptance criteria saat ini.

## Critical test scenarios

- Happy path: first run membuat keyfile 0600, load menghasilkan keyId stabil, verifikasi **AC-1**, **AC-3**.
- Failure case: keyfile 0644 → boot menolak dengan instruksi, verifikasi **AC-4**.
- Password: hash lalu verify benar dan salah; parameter lama memicu needsRehash, verifikasi **AC-6**, **AC-8**.

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
