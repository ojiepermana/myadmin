# Test dan acceptance criteria 0006. CLI runtime dan data directory

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Belum dijalankan
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0006.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

`myadmin serve` memulai HTTP server dan menyajikan SPA; default bind `127.0.0.1:8080`; `--host`, `--port`, `MYADMIN_HOST`, `MYADMIN_PORT` mengoverride tanpa rebuild; prioritas flag di atas environment variable.

### AC-2

data directory default per platform: macOS `~/Library/Application Support/myadmin`, Linux `$XDG_DATA_HOME/myadmin` (fallback `~/.local/share/myadmin`), Windows `%APPDATA%\myadmin`; `--data-dir` dan `MYADMIN_DATA_DIR` mengoverride.

### AC-3

saat boot, data directory dibuat bila belum ada berisi subfolder `config/`, `logs/`, `backups/`, `temp/`; kegagalan menulis membuat proses berhenti dengan pesan jelas dan exit code bukan nol, tanpa membocorkan isi file lain.

### AC-4

SIGINT dan SIGTERM memicu graceful shutdown: server berhenti menerima koneksi baru, koneksi berjalan diberi tenggat singkat, resource ditutup, proses keluar dengan kode 0; sinyal kedua memaksa keluar.

### AC-5

aset web disajikan dari aset yang di embed saat build release, atau dari `dist/web` saat pengembangan; route bukan `/api` dan bukan file nyata mendapat fallback `index.html` (SPA), sementara path `/api/*` yang tak dikenal tetap 404 `ApiError`.

### AC-6

`myadmin version` mencetak versi, commit hash bila tersedia, dan platform, tanpa membaca data directory.

### AC-7

`myadmin serve` mencetak ke terminal: alamat yang dilayani, lokasi data directory, dan cara berhenti; tanpa secret.

### AC-8

boot memanggil rangkaian bootstrap terurut (resolve data dir → siapkan folder → [migrasi, setelah spec 0008] → compose → listen) yang tiap tahapnya melaporkan kegagalan secara berbeda dan aman.

## Matriks cakupan

| AC | Unit | Integration | Contract | E2E | Security | Performance | Visual | Smoke | Manual atau external |
|---|---|---|---|---|---|---|---|---|---|
| [AC-1](#ac-1) | n/a | `IT-0006-AC1` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-2](#ac-2) | `UT-0006-AC2` | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-3](#ac-3) | n/a | `IT-0006-AC3` | n/a | n/a | `SEC-0006-AC3` | n/a | n/a | n/a | n/a |
| [AC-4](#ac-4) | n/a | `IT-0006-AC4` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-5](#ac-5) | n/a | `IT-0006-AC5` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-6](#ac-6) | n/a | `IT-0006-AC6` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-7](#ac-7) | n/a | `IT-0006-AC7` | n/a | n/a | `SEC-0006-AC7` | n/a | n/a | n/a | n/a |
| [AC-8](#ac-8) | `UT-0006-AC8` | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `UT-0006-AC2` | [AC-2](#ac-2) | data directory default per platform: macOS ~/Library/Application Support/myadmin, Linux $XDG_DATA_HOME/myadmin (fallback ~/.local/share/myadmin), Windows %AP... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `UT-0006-AC8` | [AC-8](#ac-8) | boot memanggil rangkaian bootstrap terurut (resolve data dir → siapkan folder → [migrasi, setelah spec 0008] → compose → listen) yang tiap tahapnya melaporka... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

## Integration test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `IT-0006-AC1` | [AC-1](#ac-1) | myadmin serve memulai HTTP server dan menyajikan SPA; default bind 127.0.0.1:8080; --host, --port, MYADMIN_HOST, MYADMIN_PORT mengoverride tanpa rebuild; pri... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `IT-0006-AC3` | [AC-3](#ac-3) | saat boot, data directory dibuat bila belum ada berisi subfolder config/, logs/, backups/, temp/; kegagalan menulis membuat proses berhenti dengan pesan jela... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `IT-0006-AC4` | [AC-4](#ac-4) | SIGINT dan SIGTERM memicu graceful shutdown: server berhenti menerima koneksi baru, koneksi berjalan diberi tenggat singkat, resource ditutup, proses keluar... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `IT-0006-AC5` | [AC-5](#ac-5) | aset web disajikan dari aset yang di embed saat build release, atau dari dist/web saat pengembangan; route bukan /api dan bukan file nyata mendapat fallback... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `IT-0006-AC6` | [AC-6](#ac-6) | myadmin version mencetak versi, commit hash bila tersedia, dan platform, tanpa membaca data directory. | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `IT-0006-AC7` | [AC-7](#ac-7) | myadmin serve mencetak ke terminal: alamat yang dilayani, lokasi data directory, dan cara berhenti; tanpa secret. | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

## Test tambahan

### Contract test

Tidak ada contract yang diwajibkan oleh acceptance criteria saat ini.

### E2E

Tidak ada e2e yang diwajibkan oleh acceptance criteria saat ini.

### Security

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `SEC-0006-AC3` | [AC-3](#ac-3) | saat boot, data directory dibuat bila belum ada berisi subfolder config/, logs/, backups/, temp/; kegagalan menulis membuat proses berhenti dengan pesan jela... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `SEC-0006-AC7` | [AC-7](#ac-7) | myadmin serve mencetak ke terminal: alamat yang dilayani, lokasi data directory, dan cara berhenti; tanpa secret. | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

### Performance

Tidak ada performance yang diwajibkan oleh acceptance criteria saat ini.

### Visual dan accessibility

Tidak ada visual dan accessibility yang diwajibkan oleh acceptance criteria saat ini.

### Smoke dan operational acceptance

Tidak ada smoke dan operational yang diwajibkan oleh acceptance criteria saat ini.

### Manual atau external proof

Tidak ada manual atau external yang diwajibkan oleh acceptance criteria saat ini.

## Critical test scenarios

- Happy path: serve di port kosong, health menjawab, SIGTERM keluar kode 0, verifikasi **AC-1**, **AC-4**.
- Failure case: data directory tidak bisa ditulis (permission) → exit bukan nol dengan pesan aman, verifikasi **AC-3**.
- SPA fallback: `GET /connections` (route klien) mengembalikan index.html; `GET /api/v1/tidak-ada` mengembalikan 404 `ApiError`, verifikasi **AC-5**.

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
