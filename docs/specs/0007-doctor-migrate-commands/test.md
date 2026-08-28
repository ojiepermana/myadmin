# Test dan acceptance criteria 0007. Perintah doctor dan migrate

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Belum dijalankan
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0007.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

`myadmin doctor` menjalankan pemeriksaan terdaftar dan menyajikan hasil per pemeriksaan: ok, warning, atau fail, dengan pesan tindakan; exit code 0 bila tanpa fail, bukan nol bila ada fail.

### AC-2

pemeriksaan awal mencakup: data directory ada dan bisa ditulis; subfolder lengkap; SQLite internal bisa dibuka dan versi migrasinya sesuai (atau menyatakan butuh migrasi); aset web ditemukan; config valid (setelah spec 0012); keyfile ada dengan permission benar (setelah spec 0010).

### AC-3

doctor tidak pernah mencetak secret, isi config sensitif, connection string, atau isi database; output nya aman ditempel ke issue publik.

### AC-4

subsistem lain dapat mendaftarkan pemeriksaan lewat antarmuka `DoctorCheck { id, title, run(): CheckResult }` tanpa mengubah kode doctor; pemeriksaan native tools backup (spec 0049) memakai jalur ini.

### AC-5

`myadmin migrate` menjalankan migrasi tertunda dan melaporkan versi awal, versi akhir, dan daftar migrasi yang dijalankan; tanpa migrasi tertunda ia menyatakan sudah mutakhir; kegagalan menghentikan proses dengan pesan aman dan exit code bukan nol.

### AC-6

`myadmin migrate --status` menampilkan versi skema saat ini dan migrasi tertunda tanpa menjalankan apa pun.

### AC-7

`doctor --json` mengeluarkan hasil terstruktur untuk otomasi, dengan bentuk yang stabil.

## Matriks cakupan

| AC | Unit | Integration | Contract | E2E | Security | Performance | Visual | Smoke | Manual atau external |
|---|---|---|---|---|---|---|---|---|---|
| [AC-1](#ac-1) | n/a | `IT-0007-AC1` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-2](#ac-2) | n/a | `IT-0007-AC2` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-3](#ac-3) | n/a | n/a | n/a | n/a | `SEC-0007-AC3` | n/a | n/a | n/a | n/a |
| [AC-4](#ac-4) | `UT-0007-AC4` | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-5](#ac-5) | n/a | `IT-0007-AC5` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-6](#ac-6) | n/a | `IT-0007-AC6` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-7](#ac-7) | n/a | n/a | `CT-0007-AC7` | n/a | n/a | n/a | n/a | n/a | n/a |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `UT-0007-AC4` | [AC-4](#ac-4) | subsistem lain dapat mendaftarkan pemeriksaan lewat antarmuka DoctorCheck { id, title, run(): CheckResult } tanpa mengubah kode doctor; pemeriksaan native to... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |

## Integration test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `IT-0007-AC1` | [AC-1](#ac-1) | myadmin doctor menjalankan pemeriksaan terdaftar dan menyajikan hasil per pemeriksaan: ok, warning, atau fail, dengan pesan tindakan; exit code 0 bila tanpa... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `IT-0007-AC2` | [AC-2](#ac-2) | pemeriksaan awal mencakup: data directory ada dan bisa ditulis; subfolder lengkap; SQLite internal bisa dibuka dan versi migrasinya sesuai (atau menyatakan b... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `IT-0007-AC5` | [AC-5](#ac-5) | myadmin migrate menjalankan migrasi tertunda dan melaporkan versi awal, versi akhir, dan daftar migrasi yang dijalankan; tanpa migrasi tertunda ia menyatakan... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `IT-0007-AC6` | [AC-6](#ac-6) | myadmin migrate --status menampilkan versi skema saat ini dan migrasi tertunda tanpa menjalankan apa pun. | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

## Test tambahan

### Contract test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `CT-0007-AC7` | [AC-7](#ac-7) | doctor --json mengeluarkan hasil terstruktur untuk otomasi, dengan bentuk yang stabil. | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

### E2E

Tidak ada e2e yang diwajibkan oleh acceptance criteria saat ini.

### Security

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `SEC-0007-AC3` | [AC-3](#ac-3) | doctor tidak pernah mencetak secret, isi config sensitif, connection string, atau isi database; output nya aman ditempel ke issue publik. | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |

### Performance

Tidak ada performance yang diwajibkan oleh acceptance criteria saat ini.

### Visual dan accessibility

Tidak ada visual dan accessibility yang diwajibkan oleh acceptance criteria saat ini.

### Smoke dan operational acceptance

Tidak ada smoke dan operational yang diwajibkan oleh acceptance criteria saat ini.

### Manual atau external proof

Tidak ada manual atau external yang diwajibkan oleh acceptance criteria saat ini.

## Critical test scenarios

- Happy path: instalasi sehat → doctor exit 0, semua ok, verifikasi **AC-1**, **AC-2**.
- Failure case: keyfile permission longgar (setelah spec 0010) → warning dengan instruksi chmod, tanpa isi key, verifikasi **AC-2**, **AC-3**.
- Migrasi: database versi lama → `migrate --status` menyebut tertunda, `migrate` menjalankan dan idempotent saat diulang, verifikasi **AC-5**, **AC-6**.

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
