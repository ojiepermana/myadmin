# Test dan acceptance criteria 0012. Package config

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Belum dijalankan
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0012.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

schema config terdefinisi bertipe dengan default untuk V1: `server.host`, `server.port`, `dataDir`, `session.idleTimeoutMinutes`, `session.absoluteTimeoutHours`, `security.secureCookies`, `log.level`, `limits.uploadMaxBytes`, `limits.resultMaxRows`, `history.maxEntriesPerUser`; setiap penambahan setelan baru wajib lewat schema ini.

### AC-2

prioritas sumber: flag CLI → environment variable (prefix `MYADMIN_`, pemetaan `MYADMIN_SERVER_PORT` ke `server.port`) → file `<data-dir>/config/config.toml` → default; sumber pemenang tiap nilai bisa dilaporkan untuk doctor.

### AC-3

file config tidak wajib ada; bila ada namun tidak valid (kunci tak dikenal, tipe salah, nilai di luar rentang), startup gagal dengan daftar kesalahan per kunci.

### AC-4

config yang sudah dimuat immutable dan tersedia lewat injection ke composition root; fitur menerima potongan config yang dibutuhkannya, bukan objek global.

### AC-5

dump config (untuk doctor dan log startup) melewati redaction: nilai yang ditandai sensitif di schema tersensor; `MYADMIN_MASTER_KEY` tidak pernah menjadi bagian schema config (tetap milik key provider).

### AC-6

doctor mendaftarkan check config: valid atau tidak, path file yang dipakai, dan sumber pemenang per kunci penting, tanpa nilai sensitif.

### AC-7

unit test menutup prioritas sumber, kegagalan validasi, pemetaan env, dan redaction dump.

## Matriks cakupan

| AC | Unit | Integration | Contract | E2E | Security | Performance | Visual | Smoke | Manual atau external |
|---|---|---|---|---|---|---|---|---|---|
| [AC-1](#ac-1) | `UT-0012-AC1` | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-2](#ac-2) | `UT-0012-AC2` | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-3](#ac-3) | n/a | `IT-0012-AC3` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-4](#ac-4) | `UT-0012-AC4` | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-5](#ac-5) | n/a | n/a | n/a | n/a | `SEC-0012-AC5` | n/a | n/a | n/a | n/a |
| [AC-6](#ac-6) | n/a | `IT-0012-AC6` | n/a | n/a | `SEC-0012-AC6` | n/a | n/a | n/a | n/a |
| [AC-7](#ac-7) | `UT-0012-AC7` | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `UT-0012-AC1` | [AC-1](#ac-1) | schema config terdefinisi bertipe dengan default untuk V1: server.host, server.port, dataDir, session.idleTimeoutMinutes, session.absoluteTimeoutHours, secur... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `UT-0012-AC2` | [AC-2](#ac-2) | prioritas sumber: flag CLI → environment variable (prefix MYADMIN_, pemetaan MYADMIN_SERVER_PORT ke server.port) → file <data-dir>/config/config.toml → defau... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `UT-0012-AC4` | [AC-4](#ac-4) | config yang sudah dimuat immutable dan tersedia lewat injection ke composition root; fitur menerima potongan config yang dibutuhkannya, bukan objek global. | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `UT-0012-AC7` | [AC-7](#ac-7) | unit test menutup prioritas sumber, kegagalan validasi, pemetaan env, dan redaction dump. | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

## Integration test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `IT-0012-AC3` | [AC-3](#ac-3) | file config tidak wajib ada; bila ada namun tidak valid (kunci tak dikenal, tipe salah, nilai di luar rentang), startup gagal dengan daftar kesalahan per kunci. | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `IT-0012-AC6` | [AC-6](#ac-6) | doctor mendaftarkan check config: valid atau tidak, path file yang dipakai, dan sumber pemenang per kunci penting, tanpa nilai sensitif. | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

## Test tambahan

### Contract test

Tidak ada contract yang diwajibkan oleh acceptance criteria saat ini.

### E2E

Tidak ada e2e yang diwajibkan oleh acceptance criteria saat ini.

### Security

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `SEC-0012-AC5` | [AC-5](#ac-5) | dump config (untuk doctor dan log startup) melewati redaction: nilai yang ditandai sensitif di schema tersensor; MYADMIN_MASTER_KEY tidak pernah menjadi bagi... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `SEC-0012-AC6` | [AC-6](#ac-6) | doctor mendaftarkan check config: valid atau tidak, path file yang dipakai, dan sumber pemenang per kunci penting, tanpa nilai sensitif. | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

### Performance

Tidak ada performance yang diwajibkan oleh acceptance criteria saat ini.

### Visual dan accessibility

Tidak ada visual dan accessibility yang diwajibkan oleh acceptance criteria saat ini.

### Smoke dan operational acceptance

Tidak ada smoke dan operational yang diwajibkan oleh acceptance criteria saat ini.

### Manual atau external proof

Tidak ada manual atau external yang diwajibkan oleh acceptance criteria saat ini.

## Critical test scenarios

- Happy path: tanpa file, env mengoverride default, flag mengoverride env, verifikasi **AC-2**.
- Failure case: `config.toml` berisi `server.port = "delapan"` → startup gagal menyebut kunci dan tipe yang diharapkan, verifikasi **AC-3**.
- Redaksi: dump config tidak memuat nilai field sensitif, verifikasi **AC-5**.

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
