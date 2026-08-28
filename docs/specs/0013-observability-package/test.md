# Test dan acceptance criteria 0013. Package observability

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Belum dijalankan
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0013.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

logger menghasilkan JSON lines ke stdout dengan field baku: `time`, `level`, `msg`, `correlationId` bila ada, `module`, plus konteks terstruktur; level dari config (`log.level`).

### AC-2

setiap request HTTP dan koneksi WebSocket mendapat correlation ID (UUIDv7) di middleware paling luar; ID mengalir otomatis lewat AsyncLocalStorage sehingga log di lapisan mana pun selama request itu memuatnya tanpa dioper manual.

### AC-3

correlation ID yang sama dikirim ke klien pada setiap `ApiError` (field `correlationId`), menyambungkan laporan pengguna ke log server.

### AC-4

seluruh keluaran logger melewati `Redaction.redactObject` (spec 0011) sebelum ditulis; test membuktikan objek berisi field password tersensor di output.

### AC-5

error handler transport tunggal mengubah error tak tertangani menjadi `ApiError` 500 dengan pesan generik plus correlation ID, dan menulis log level error berisi stack (tersensor); stack tidak pernah dikirim ke klien (FR-OPS-02).

### AC-6

metric counter dasar tersedia dalam memori (jumlah request per status, durasi kasar) dan bisa dibaca lewat modul; tanpa endpoint metrics publik di V1.

### AC-7

log juga ditulis ke file `<data-dir>/logs/myadmin.log` dengan rotasi sederhana berdasar ukuran (potong saat melebihi batas, simpan satu file sebelumnya); kegagalan menulis file tidak mematikan proses (stdout tetap jalan).

## Matriks cakupan

| AC | Unit | Integration | Contract | E2E | Security | Performance | Visual | Smoke | Manual atau external |
|---|---|---|---|---|---|---|---|---|---|
| [AC-1](#ac-1) | `UT-0013-AC1` | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-2](#ac-2) | n/a | `IT-0013-AC2` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-3](#ac-3) | n/a | `IT-0013-AC3` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-4](#ac-4) | n/a | n/a | n/a | n/a | `SEC-0013-AC4` | n/a | n/a | n/a | n/a |
| [AC-5](#ac-5) | n/a | `IT-0013-AC5` | n/a | n/a | `SEC-0013-AC5` | n/a | n/a | n/a | n/a |
| [AC-6](#ac-6) | `UT-0013-AC6` | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-7](#ac-7) | n/a | `IT-0013-AC7` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `UT-0013-AC1` | [AC-1](#ac-1) | logger menghasilkan JSON lines ke stdout dengan field baku: time, level, msg, correlationId bila ada, module, plus konteks terstruktur; level dari config (lo... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `UT-0013-AC6` | [AC-6](#ac-6) | metric counter dasar tersedia dalam memori (jumlah request per status, durasi kasar) dan bisa dibaca lewat modul; tanpa endpoint metrics publik di V1. | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

## Integration test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `IT-0013-AC2` | [AC-2](#ac-2) | setiap request HTTP dan koneksi WebSocket mendapat correlation ID (UUIDv7) di middleware paling luar; ID mengalir otomatis lewat AsyncLocalStorage sehingga l... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `IT-0013-AC3` | [AC-3](#ac-3) | correlation ID yang sama dikirim ke klien pada setiap ApiError (field correlationId), menyambungkan laporan pengguna ke log server. | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `IT-0013-AC5` | [AC-5](#ac-5) | error handler transport tunggal mengubah error tak tertangani menjadi ApiError 500 dengan pesan generik plus correlation ID, dan menulis log level error beri... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `IT-0013-AC7` | [AC-7](#ac-7) | log juga ditulis ke file <data-dir>/logs/myadmin.log dengan rotasi sederhana berdasar ukuran (potong saat melebihi batas, simpan satu file sebelumnya); kegag... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

## Test tambahan

### Contract test

Tidak ada contract yang diwajibkan oleh acceptance criteria saat ini.

### E2E

Tidak ada e2e yang diwajibkan oleh acceptance criteria saat ini.

### Security

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `SEC-0013-AC4` | [AC-4](#ac-4) | seluruh keluaran logger melewati Redaction.redactObject (spec 0011) sebelum ditulis; test membuktikan objek berisi field password tersensor di output. | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `SEC-0013-AC5` | [AC-5](#ac-5) | error handler transport tunggal mengubah error tak tertangani menjadi ApiError 500 dengan pesan generik plus correlation ID, dan menulis log level error beri... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |

### Performance

Tidak ada performance yang diwajibkan oleh acceptance criteria saat ini.

### Visual dan accessibility

Tidak ada visual dan accessibility yang diwajibkan oleh acceptance criteria saat ini.

### Smoke dan operational acceptance

Tidak ada smoke dan operational yang diwajibkan oleh acceptance criteria saat ini.

### Manual atau external proof

Tidak ada manual atau external yang diwajibkan oleh acceptance criteria saat ini.

## Critical test scenarios

- Happy path: request → log request dan response dengan correlation sama → error 500 buatan mengirim `ApiError` dengan correlation itu, verifikasi **AC-2**, **AC-3**, **AC-5**.
- Redaksi: log objek koneksi berisi password → output tersensor, verifikasi **AC-4**.
- Rotasi: file melewati batas → file lama dipindah, proses tetap hidup, verifikasi **AC-7**.

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
