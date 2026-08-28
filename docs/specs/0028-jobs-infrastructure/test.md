# Test dan acceptance criteria 0028. Jobs infrastructure

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Belum dijalankan
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0028.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

model job terdefinisi: `Job { id, type, ownerUserId, state, progress { phase, current, total?, message? }, result?, error?, createdAt, startedAt?, endedAt?, cancellable }` dengan state `queued → running → (completed | failed | cancelling → cancelled)`; transisi ilegal ditolak di tipe/assert.

### AC-2

`JobManager.submit(definition)` menerima definisi job (type, executor async yang menerima `JobContext { reportProgress, signal }`) dan mengembalikan job id seketika; eksekusi berjalan asinkron dengan batas konkurensi global (default 4) dan antrean FIFO.

### AC-3

cancellation kooperatif: `cancel(jobId)` menyetel state `cancelling` dan membatalkan `AbortSignal`; executor yang menghormati signal berakhir `cancelled`; executor yang selesai duluan tetap `completed`; job yang tidak cancellable menolak cancel dengan jelas.

### AC-4

progress dilaporkan lewat `reportProgress` dengan throttle internal (maksimum 5 update per detik per job) dan tersimpan pada job; setiap perubahan state atau progress memancarkan event internal yang bisa disubscribe (hook untuk spec 0029).

### AC-5

API HTTP: `GET /jobs` (job milik sendiri, terbaru dulu, paginated), `GET /jobs/:id` (pemilik saja), `POST /jobs/:id/cancel` (pemilik saja); bentuk sesuai kontrak; job orang lain 404 bagi non pemilik (bukan 403, untuk tidak membocorkan keberadaan).

### AC-6

job selesai (completed, failed, cancelled) disimpan dalam memori selama 1 jam lalu dibersihkan; restart server menghilangkan semua job dan UI menampilkan job hilang sebagai "berakhir karena server dimulai ulang" bila referensinya masih dipegang klien (klien mendeteksi 404).

### AC-7

kegagalan executor tertangkap: error dinormalisasi aman (tanpa secret), state `failed`, tidak pernah merobohkan proses; error asli tercatat log dengan correlation.

### AC-8

unit test menutup: transisi state, konkurensi dan antrean, cancel kooperatif, throttle progress, pembersihan, dan kepemilikan.

## Matriks cakupan

| AC | Unit | Integration | Contract | E2E | Security | Performance | Visual | Smoke | Manual atau external |
|---|---|---|---|---|---|---|---|---|---|
| [AC-1](#ac-1) | `UT-0028-AC1` | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-2](#ac-2) | `UT-0028-AC2` | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-3](#ac-3) | `UT-0028-AC3` | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-4](#ac-4) | `UT-0028-AC4` | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-5](#ac-5) | n/a | `IT-0028-AC5` | `CT-0028-AC5` | n/a | `SEC-0028-AC5` | n/a | n/a | n/a | n/a |
| [AC-6](#ac-6) | `UT-0028-AC6` | n/a | n/a | `E2E-0028-AC6` | n/a | n/a | n/a | n/a | n/a |
| [AC-7](#ac-7) | `UT-0028-AC7` | n/a | n/a | n/a | `SEC-0028-AC7` | n/a | n/a | n/a | n/a |
| [AC-8](#ac-8) | `UT-0028-AC8` | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `UT-0028-AC1` | [AC-1](#ac-1) | model job terdefinisi: Job { id, type, ownerUserId, state, progress { phase, current, total?, message? }, result?, error?, createdAt, startedAt?, endedAt?, c... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `UT-0028-AC2` | [AC-2](#ac-2) | JobManager.submit(definition) menerima definisi job (type, executor async yang menerima JobContext { reportProgress, signal }) dan mengembalikan job id seket... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `UT-0028-AC3` | [AC-3](#ac-3) | cancellation kooperatif: cancel(jobId) menyetel state cancelling dan membatalkan AbortSignal; executor yang menghormati signal berakhir cancelled; executor y... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `UT-0028-AC4` | [AC-4](#ac-4) | progress dilaporkan lewat reportProgress dengan throttle internal (maksimum 5 update per detik per job) dan tersimpan pada job; setiap perubahan state atau p... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `UT-0028-AC6` | [AC-6](#ac-6) | job selesai (completed, failed, cancelled) disimpan dalam memori selama 1 jam lalu dibersihkan; restart server menghilangkan semua job dan UI menampilkan job... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `UT-0028-AC7` | [AC-7](#ac-7) | kegagalan executor tertangkap: error dinormalisasi aman (tanpa secret), state failed, tidak pernah merobohkan proses; error asli tercatat log dengan correlat... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |
| `UT-0028-AC8` | [AC-8](#ac-8) | unit test menutup: transisi state, konkurensi dan antrean, cancel kooperatif, throttle progress, pembersihan, dan kepemilikan. | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

## Integration test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `IT-0028-AC5` | [AC-5](#ac-5) | API HTTP: GET /jobs (job milik sendiri, terbaru dulu, paginated), GET /jobs/:id (pemilik saja), POST /jobs/:id/cancel (pemilik saja); bentuk sesuai kontrak;... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |

## Test tambahan

### Contract test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `CT-0028-AC5` | [AC-5](#ac-5) | API HTTP: GET /jobs (job milik sendiri, terbaru dulu, paginated), GET /jobs/:id (pemilik saja), POST /jobs/:id/cancel (pemilik saja); bentuk sesuai kontrak;... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |

### E2E

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `E2E-0028-AC6` | [AC-6](#ac-6) | job selesai (completed, failed, cancelled) disimpan dalam memori selama 1 jam lalu dibersihkan; restart server menghilangkan semua job dan UI menampilkan job... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

### Security

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `SEC-0028-AC5` | [AC-5](#ac-5) | API HTTP: GET /jobs (job milik sendiri, terbaru dulu, paginated), GET /jobs/:id (pemilik saja), POST /jobs/:id/cancel (pemilik saja); bentuk sesuai kontrak;... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `SEC-0028-AC7` | [AC-7](#ac-7) | kegagalan executor tertangkap: error dinormalisasi aman (tanpa secret), state failed, tidak pernah merobohkan proses; error asli tercatat log dengan correlat... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

### Performance

Tidak ada performance yang diwajibkan oleh acceptance criteria saat ini.

### Visual dan accessibility

Tidak ada visual dan accessibility yang diwajibkan oleh acceptance criteria saat ini.

### Smoke dan operational acceptance

Tidak ada smoke dan operational yang diwajibkan oleh acceptance criteria saat ini.

### Manual atau external proof

Tidak ada manual atau external yang diwajibkan oleh acceptance criteria saat ini.

## Critical test scenarios

- Konkurensi: 6 job masuk, maksimum 4 berjalan, sisanya antre, verifikasi **AC-2**.
- Cancel: job tidur panjang dibatalkan → cancelled dan resource executor dilepas, verifikasi **AC-3**.
- Crash executor: job failed, proses tetap hidup, error aman, verifikasi **AC-7**.

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
