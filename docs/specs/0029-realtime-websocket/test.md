# Test dan acceptance criteria 0029. Realtime WebSocket dan klien SDK

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Belum dijalankan
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0029.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

endpoint `GET /ws` (upgrade) menerima hanya pemegang sesi valid (cookie yang sama dengan HTTP); tanpa sesi → upgrade ditolak; sesi kadaluarsa atau dicabut memutus koneksi dengan close code khusus paling lambat 60 detik (spec 0017 AC-5).

### AC-2

protokol pesan sesuai `websocket-protocol.yaml`: klien mengirim `{ type: 'subscribe' | 'unsubscribe', channel }` dan menerima `{ type: 'event', channel, payload, correlationId? }` plus `{ type: 'error' }` untuk pelanggaran; pesan tidak dikenal dijawab error tanpa memutus.

### AC-3

otorisasi channel: `jobs.<jobId>` hanya untuk pemilik job; `connections.status` mengalirkan hanya status koneksi milik user sesi itu; `query.<executionId>` hanya pemilik eksekusi; subscribe channel yang bukan haknya ditolak dengan error, tanpa membocorkan keberadaan resource.

### AC-4

event internal JobManager diteruskan ke channel `jobs.<id>` (progress dan perubahan state); perubahan registry status koneksi diteruskan ke `connections.status`; UI status (spec 0027) beralih dari polling ke push dengan polling tersisa sebagai fallback saat WS tidak tersambung.

### AC-5

heartbeat ping pong tiap 30 detik; koneksi tanpa pong dua interval ditutup; server membatasi maksimal 4 koneksi WS per user dan 200 subscription per koneksi.

### AC-6

klien SDK `RealtimeClient`: connect saat login, reconnect otomatis dengan backoff (1, 2, 5, 10 detik, maksimum 30), resubscribe otomatis semua channel aktif setelah reconnect, API `subscribe(channel, handler): Unsubscribe` bertipe payload sesuai kontrak; event `connectionState` untuk UI menampilkan indikator realtime.

### AC-7

payload event melewati redaction jalur keluar yang sama dengan HTTP (tidak ada secret di event, FR-INT-04); dibuktikan test.

### AC-8

integration test: subscribe job → progress mengalir berurutan; putus jaringan disimulasikan → reconnect dan resubscribe; sesi dicabut → WS tertutup dengan kode yang benar.

## Matriks cakupan

| AC | Unit | Integration | Contract | E2E | Security | Performance | Visual | Smoke | Manual atau external |
|---|---|---|---|---|---|---|---|---|---|
| [AC-1](#ac-1) | n/a | `IT-0029-AC1` | n/a | n/a | `SEC-0029-AC1` | n/a | n/a | n/a | n/a |
| [AC-2](#ac-2) | n/a | `IT-0029-AC2` | `CT-0029-AC2` | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-3](#ac-3) | n/a | `IT-0029-AC3` | n/a | n/a | `SEC-0029-AC3` | n/a | n/a | n/a | n/a |
| [AC-4](#ac-4) | n/a | `IT-0029-AC4` | n/a | `E2E-0029-AC4` | n/a | n/a | n/a | n/a | n/a |
| [AC-5](#ac-5) | `UT-0029-AC5` | `IT-0029-AC5` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-6](#ac-6) | `UT-0029-AC6` | `IT-0029-AC6` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-7](#ac-7) | n/a | `IT-0029-AC7` | n/a | n/a | `SEC-0029-AC7` | n/a | n/a | n/a | n/a |
| [AC-8](#ac-8) | n/a | `IT-0029-AC8` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `UT-0029-AC5` | [AC-5](#ac-5) | heartbeat ping pong tiap 30 detik; koneksi tanpa pong dua interval ditutup; server membatasi maksimal 4 koneksi WS per user dan 200 subscription per koneksi. | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `UT-0029-AC6` | [AC-6](#ac-6) | klien SDK RealtimeClient: connect saat login, reconnect otomatis dengan backoff (1, 2, 5, 10 detik, maksimum 30), resubscribe otomatis semua channel aktif se... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

## Integration test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `IT-0029-AC1` | [AC-1](#ac-1) | endpoint GET /ws (upgrade) menerima hanya pemegang sesi valid (cookie yang sama dengan HTTP); tanpa sesi → upgrade ditolak; sesi kadaluarsa atau dicabut memu... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `IT-0029-AC2` | [AC-2](#ac-2) | protokol pesan sesuai websocket-protocol.yaml: klien mengirim { type: 'subscribe' \| 'unsubscribe', channel } dan menerima { type: 'event', channel, payload,... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `IT-0029-AC3` | [AC-3](#ac-3) | otorisasi channel: jobs.<jobId> hanya untuk pemilik job; connections.status mengalirkan hanya status koneksi milik user sesi itu; query.<executionId> hanya p... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `IT-0029-AC4` | [AC-4](#ac-4) | event internal JobManager diteruskan ke channel jobs.<id> (progress dan perubahan state); perubahan registry status koneksi diteruskan ke connections.status;... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `IT-0029-AC5` | [AC-5](#ac-5) | heartbeat ping pong tiap 30 detik; koneksi tanpa pong dua interval ditutup; server membatasi maksimal 4 koneksi WS per user dan 200 subscription per koneksi. | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `IT-0029-AC6` | [AC-6](#ac-6) | klien SDK RealtimeClient: connect saat login, reconnect otomatis dengan backoff (1, 2, 5, 10 detik, maksimum 30), resubscribe otomatis semua channel aktif se... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `IT-0029-AC7` | [AC-7](#ac-7) | payload event melewati redaction jalur keluar yang sama dengan HTTP (tidak ada secret di event, FR-INT-04); dibuktikan test. | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |
| `IT-0029-AC8` | [AC-8](#ac-8) | integration test: subscribe job → progress mengalir berurutan; putus jaringan disimulasikan → reconnect dan resubscribe; sesi dicabut → WS tertutup dengan ko... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

## Test tambahan

### Contract test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `CT-0029-AC2` | [AC-2](#ac-2) | protokol pesan sesuai websocket-protocol.yaml: klien mengirim { type: 'subscribe' \| 'unsubscribe', channel } dan menerima { type: 'event', channel, payload,... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |

### E2E

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `E2E-0029-AC4` | [AC-4](#ac-4) | event internal JobManager diteruskan ke channel jobs.<id> (progress dan perubahan state); perubahan registry status koneksi diteruskan ke connections.status;... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |

### Security

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `SEC-0029-AC1` | [AC-1](#ac-1) | endpoint GET /ws (upgrade) menerima hanya pemegang sesi valid (cookie yang sama dengan HTTP); tanpa sesi → upgrade ditolak; sesi kadaluarsa atau dicabut memu... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `SEC-0029-AC3` | [AC-3](#ac-3) | otorisasi channel: jobs.<jobId> hanya untuk pemilik job; connections.status mengalirkan hanya status koneksi milik user sesi itu; query.<executionId> hanya p... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `SEC-0029-AC7` | [AC-7](#ac-7) | payload event melewati redaction jalur keluar yang sama dengan HTTP (tidak ada secret di event, FR-INT-04); dibuktikan test. | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

### Performance

Tidak ada performance yang diwajibkan oleh acceptance criteria saat ini.

### Visual dan accessibility

Tidak ada visual dan accessibility yang diwajibkan oleh acceptance criteria saat ini.

### Smoke dan operational acceptance

Tidak ada smoke dan operational yang diwajibkan oleh acceptance criteria saat ini.

### Manual atau external proof

Tidak ada manual atau external yang diwajibkan oleh acceptance criteria saat ini.

## Critical test scenarios

- Otorisasi: user B subscribe `jobs.<idA>` → error, tanpa kebocoran, verifikasi **AC-3**.
- Pemulihan: putus WS di tengah job → reconnect → resubscribe → progress berlanjut, dan state akhir diambil ulang lewat HTTP, verifikasi **AC-6**, **AC-8**.
- Sesi: logout memutus WS dengan close code benar, verifikasi **AC-1**.

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
