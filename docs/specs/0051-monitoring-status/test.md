# Test dan acceptance criteria 0051. Monitoring status dasar

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Belum dijalankan
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0051.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

halaman monitoring menampilkan kartu per koneksi milik user: label, engine dan versi, status kini (push dari `connections.status`), latency test terakhir dan grafik kecil riwayat latency sesi ini (data klien, tidak dipersist), waktu tersambung sejak, dan error terakhir (kategori plus waktu) bila ada.

### AC-2

`GET /connections/:id/status-info` (koneksi tersambung) mengembalikan info ringan dari `MonitoringPort.statusInfo`: versi lengkap, uptime server bila tersedia murah, nama database aktif; tanpa query berat, tanpa daftar sesi.

### AC-3

tombol "uji sekarang" per kartu menjalankan ping/test dan memperbarui latency (rate limited ringan); durasi operasi terakhir per koneksi (query, connect) tampil dari data yang sudah dilaporkan fitur lain.

### AC-4

tidak ada permintaan berkala berat: pembaruan lewat push status; latency diambil hanya saat connect, test manual, atau operasi berjalan (FR-OPS-01 tanpa dashboard polling).

### AC-5

tidak ada data sensitif: tanpa connection string, tanpa credential, tanpa isi query di halaman ini (FR-OPS-01).

### AC-6

halaman menyatakan batas V1 dengan kalimat kecil ("Monitor sesi dan query berjalan hadir di versi berikutnya") supaya ekspektasi jelas, sesuai prinsip menjelaskan ketidaktersediaan.

### AC-7

e2e: kartu mencerminkan connect/disconnect/error secara langsung; uji sekarang memperbarui latency; tanpa request berkala di network log selain push WS.

## Matriks cakupan

| AC | Unit | Integration | Contract | E2E | Security | Performance | Visual | Smoke | Manual atau external |
|---|---|---|---|---|---|---|---|---|---|
| [AC-1](#ac-1) | `UT-0051-AC1` | `IT-0051-AC1` | n/a | `E2E-0051-AC1` | n/a | n/a | `VIS-0051-AC1` | n/a | n/a |
| [AC-2](#ac-2) | n/a | `IT-0051-AC2` | `CT-0051-AC2` | n/a | n/a | `PERF-0051-AC2` | n/a | n/a | n/a |
| [AC-3](#ac-3) | `UT-0051-AC3` | `IT-0051-AC3` | n/a | `E2E-0051-AC3` | `SEC-0051-AC3` | n/a | n/a | n/a | n/a |
| [AC-4](#ac-4) | n/a | n/a | n/a | `E2E-0051-AC4` | n/a | `PERF-0051-AC4` | n/a | n/a | n/a |
| [AC-5](#ac-5) | n/a | `IT-0051-AC5` | n/a | `E2E-0051-AC5` | `SEC-0051-AC5` | n/a | n/a | n/a | n/a |
| [AC-6](#ac-6) | n/a | n/a | n/a | `E2E-0051-AC6` | n/a | n/a | n/a | n/a | n/a |
| [AC-7](#ac-7) | n/a | `IT-0051-AC7` | n/a | `E2E-0051-AC7` | n/a | `PERF-0051-AC7` | n/a | n/a | n/a |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `UT-0051-AC1` | [AC-1](#ac-1) | halaman monitoring menampilkan kartu per koneksi milik user: label, engine dan versi, status kini (push dari connections.status), latency test terakhir dan g... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `UT-0051-AC3` | [AC-3](#ac-3) | tombol "uji sekarang" per kartu menjalankan ping/test dan memperbarui latency (rate limited ringan); durasi operasi terakhir per koneksi (query, connect) tam... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |

## Integration test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `IT-0051-AC1` | [AC-1](#ac-1) | halaman monitoring menampilkan kartu per koneksi milik user: label, engine dan versi, status kini (push dari connections.status), latency test terakhir dan g... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `IT-0051-AC2` | [AC-2](#ac-2) | GET /connections/:id/status-info (koneksi tersambung) mengembalikan info ringan dari MonitoringPort.statusInfo: versi lengkap, uptime server bila tersedia mu... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `IT-0051-AC3` | [AC-3](#ac-3) | tombol "uji sekarang" per kartu menjalankan ping/test dan memperbarui latency (rate limited ringan); durasi operasi terakhir per koneksi (query, connect) tam... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `IT-0051-AC5` | [AC-5](#ac-5) | tidak ada data sensitif: tanpa connection string, tanpa credential, tanpa isi query di halaman ini (FR-OPS-01). | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `IT-0051-AC7` | [AC-7](#ac-7) | e2e: kartu mencerminkan connect/disconnect/error secara langsung; uji sekarang memperbarui latency; tanpa request berkala di network log selain push WS. | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

## Test tambahan

### Contract test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `CT-0051-AC2` | [AC-2](#ac-2) | GET /connections/:id/status-info (koneksi tersambung) mengembalikan info ringan dari MonitoringPort.statusInfo: versi lengkap, uptime server bila tersedia mu... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |

### E2E

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `E2E-0051-AC1` | [AC-1](#ac-1) | halaman monitoring menampilkan kartu per koneksi milik user: label, engine dan versi, status kini (push dari connections.status), latency test terakhir dan g... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `E2E-0051-AC3` | [AC-3](#ac-3) | tombol "uji sekarang" per kartu menjalankan ping/test dan memperbarui latency (rate limited ringan); durasi operasi terakhir per koneksi (query, connect) tam... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `E2E-0051-AC4` | [AC-4](#ac-4) | tidak ada permintaan berkala berat: pembaruan lewat push status; latency diambil hanya saat connect, test manual, atau operasi berjalan (FR-OPS-01 tanpa dash... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `E2E-0051-AC5` | [AC-5](#ac-5) | tidak ada data sensitif: tanpa connection string, tanpa credential, tanpa isi query di halaman ini (FR-OPS-01). | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `E2E-0051-AC6` | [AC-6](#ac-6) | halaman menyatakan batas V1 dengan kalimat kecil ("Monitor sesi dan query berjalan hadir di versi berikutnya") supaya ekspektasi jelas, sesuai prinsip menjel... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `E2E-0051-AC7` | [AC-7](#ac-7) | e2e: kartu mencerminkan connect/disconnect/error secara langsung; uji sekarang memperbarui latency; tanpa request berkala di network log selain push WS. | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

### Security

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `SEC-0051-AC3` | [AC-3](#ac-3) | tombol "uji sekarang" per kartu menjalankan ping/test dan memperbarui latency (rate limited ringan); durasi operasi terakhir per koneksi (query, connect) tam... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `SEC-0051-AC5` | [AC-5](#ac-5) | tidak ada data sensitif: tanpa connection string, tanpa credential, tanpa isi query di halaman ini (FR-OPS-01). | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |

### Performance

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `PERF-0051-AC2` | [AC-2](#ac-2) | GET /connections/:id/status-info (koneksi tersambung) mengembalikan info ringan dari MonitoringPort.statusInfo: versi lengkap, uptime server bila tersedia mu... | Tetapkan dataset, baseline, ambang, pengulangan, dan toleransi sebelum eksekusi. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `PERF-0051-AC4` | [AC-4](#ac-4) | tidak ada permintaan berkala berat: pembaruan lewat push status; latency diambil hanya saat connect, test manual, atau operasi berjalan (FR-OPS-01 tanpa dash... | Tetapkan dataset, baseline, ambang, pengulangan, dan toleransi sebelum eksekusi. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `PERF-0051-AC7` | [AC-7](#ac-7) | e2e: kartu mencerminkan connect/disconnect/error secara langsung; uji sekarang memperbarui latency; tanpa request berkala di network log selain push WS. | Tetapkan dataset, baseline, ambang, pengulangan, dan toleransi sebelum eksekusi. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

### Visual dan accessibility

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `VIS-0051-AC1` | [AC-1](#ac-1) | halaman monitoring menampilkan kartu per koneksi milik user: label, engine dan versi, status kini (push dari connections.status), latency test terakhir dan g... | Kunci viewport, mode warna, state komponen, interaksi keyboard, dan bukti screenshot. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |

### Smoke dan operational acceptance

Tidak ada smoke dan operational yang diwajibkan oleh acceptance criteria saat ini.

### Manual atau external proof

Tidak ada manual atau external yang diwajibkan oleh acceptance criteria saat ini.

## Critical test scenarios

- Reaktif: disconnect dari tempat lain → kartu berubah lewat push, verifikasi **AC-1**, **AC-4**.
- Ringan: network log bersih dari polling, verifikasi **AC-4**.

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
