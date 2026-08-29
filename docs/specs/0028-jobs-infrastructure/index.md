# 0028. Jobs infrastructure

**Date**: 2026-08-29
**Status**: Accepted
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini membangun `packages/jobs`: mesin pekerjaan panjang di dalam proses server dengan model job, progress, cancellation token, batas konkurensi, dan API HTTP untuk melihat serta membatalkan job. Import, export, backup, dan restore (spec 0047 sampai 0050) berjalan di atas mesin ini sehingga request HTTP tidak pernah menunggu operasi panjang (FR-JOB-01).

## Context

FR-JOB-01: pekerjaan import, export, backup, restore punya progress dan cancellation; request HTTP tidak menunggu selesai; user melihat state lewat UI atau event. Struktur.md menyediakan packages/jobs (cancellation, contracts, execution, progress, queue). Keputusan yang diambil di sini: job V1 hidup dalam memori proses (tanpa persistensi); restart server menghentikan job dan itu dinyatakan jujur ke pengguna. Event push realtime datang dari spec 0029; spec ini menyediakan hook nya.

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0017 (sesi, kepemilikan job).

## Requirements

**User stories**:

- Sebagai pengguna, saya ingin operasi besar berjalan di latar dengan progress yang terlihat dan bisa saya batalkan.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): model job terdefinisi: `Job { id, type, ownerUserId, state, progress { phase, current, total?, message? }, result?, error?, createdAt, startedAt?, endedAt?, cancellable }` dengan state `queued → running → (completed | failed | cancelling → cancelled)`; transisi ilegal ditolak di tipe/assert.
- [**AC-2**](test.md#ac-2): `JobManager.submit(definition)` menerima definisi job (type, executor async yang menerima `JobContext { reportProgress, signal }`) dan mengembalikan job id seketika; eksekusi berjalan asinkron dengan batas konkurensi global (default 4) dan antrean FIFO.
- [**AC-3**](test.md#ac-3): cancellation kooperatif: `cancel(jobId)` menyetel state `cancelling` dan membatalkan `AbortSignal`; executor yang menghormati signal berakhir `cancelled`; executor yang selesai duluan tetap `completed`; job yang tidak cancellable menolak cancel dengan jelas.
- [**AC-4**](test.md#ac-4): progress dilaporkan lewat `reportProgress` dengan throttle internal (maksimum 5 update per detik per job) dan tersimpan pada job; setiap perubahan state atau progress memancarkan event internal yang bisa disubscribe (hook untuk spec 0029).
- [**AC-5**](test.md#ac-5): API HTTP: `GET /jobs` (job milik sendiri, terbaru dulu, paginated), `GET /jobs/:id` (pemilik saja), `POST /jobs/:id/cancel` (pemilik saja); bentuk sesuai kontrak; job orang lain 404 bagi non pemilik (bukan 403, untuk tidak membocorkan keberadaan).
- [**AC-6**](test.md#ac-6): job selesai (completed, failed, cancelled) disimpan dalam memori selama 1 jam lalu dibersihkan; restart server menghilangkan semua job dan UI menampilkan job hilang sebagai "berakhir karena server dimulai ulang" bila referensinya masih dipegang klien (klien mendeteksi 404).
- [**AC-7**](test.md#ac-7): kegagalan executor tertangkap: error dinormalisasi aman (tanpa secret), state `failed`, tidak pernah merobohkan proses; error asli tercatat log dengan correlation.
- [**AC-8**](test.md#ac-8): unit test menutup: transisi state, konkurensi dan antrean, cancel kooperatif, throttle progress, pembersihan, dan kepemilikan.

## Options considered

### Option 1: Job dalam memori proses (dipilih)

**Pros**:

- Sederhana dan cukup: aplikasi satu proses, job terikat sesi kerja interaktif; tanpa tabel dan recovery logic.

**Cons**:

- Restart menghentikan dan melupakan job; dinyatakan jujur (AC-6) dan wajar untuk operasi interaktif V1.

### Option 2: Job dipersist di SQLite dengan recovery

**Pros**:

- Riwayat job dan ketahanan restart.

**Cons**:

- Recovery job database eksternal (import setengah jalan) tidak bisa dilanjutkan aman secara umum; kompleksitas besar untuk janji yang tetap tidak bisa dipenuhi; scheduled job memang V2.

## Decision

**Chosen option**: Option 1: JobManager dalam memori, cancellation lewat AbortSignal, konkurensi terbatas, API kepemilikan ketat.

## Rationale

Nilai job V1 adalah tidak memblokir HTTP, progress terlihat, dan bisa dibatalkan; ketiganya tidak butuh persistensi. Janji yang tidak bisa ditepati (melanjutkan restore setengah jalan setelah crash) tidak dibuat. AbortSignal dipilih sebagai mekanisme cancel karena menjadi bahasa yang sama dengan API fetch/driver dan memaksa executor menulis pembatalan kooperatif yang eksplisit.

## Feature design

**Data model sketch**: tidak ada tabel; struktur memori seperti pada AC-1.

**State transitions**: queued → running → completed | failed; running → cancelling → cancelled; queued → cancelled (cancel sebelum mulai).

**API surface**:

| Endpoint         | Method | Key inputs | Key outputs              | Auth    | Key errors                 |
| ---------------- | ------ | ---------- | ------------------------ | ------- | -------------------------- |
| /jobs            | GET    | page?      | daftar job milik sendiri | sesi    |                            |
| /jobs/:id        | GET    | tidak ada  | job                      | pemilik | 404                        |
| /jobs/:id/cancel | POST   | tidak ada  | job (state baru)         | pemilik | 404, 409 tidak cancellable |

**Value sourcing**:

| Action     | Value produced / displayed | Source                                                     |
| ---------- | -------------------------- | ---------------------------------------------------------- |
| progress   | phase, current, total      | executor lewat reportProgress; total boleh tidak diketahui |
| job error  | pesan aman                 | normalisasi dari `DbError` atau error executor, tersensor  |
| konkurensi | batas                      | konstanta 4; dapat dipindah ke config bila terbukti perlu  |

**Key invariants**:

- Tidak ada endpoint yang menunggu job selesai; submit selalu kembali seketika (FR-JOB-01).
- Event internal job adalah satu satunya sumber untuk push (spec 0029) dan polling; keduanya membaca state yang sama.
- Job hanya terlihat pemiliknya (audit tetap merekam ke jalur audit bila tipe job nya wajib audit; itu urusan spec pemakai).

**Security model**: kepemilikan per user; tanpa endpoint admin lintas user di V1 (Admin melihat lewat audit, bukan job list orang).

**Configuration required**: tidak ada baru.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. [x] Bangun model job, state machine, dan JobManager (submit, antrean, konkurensi, penyimpanan sementara, pembersihan), memenuhi **AC-1**, **AC-2**, **AC-6**.
2. [x] Bangun cancellation (AbortSignal) dan progress (throttle, event internal), memenuhi **AC-3**, **AC-4**.
3. [x] Normalisasi error executor plus logging correlation, memenuhi **AC-7**.
4. [x] Tambah operasi jobs ke kontrak, endpoint server dengan kepemilikan, SDK facade, contract test, memenuhi **AC-5**.
5. [x] Unit test lengkap, memenuhi **AC-8**.

## Consequences

**Positive**:

- Spec 0047 sampai 0050 tinggal menulis executor; perilaku progress dan cancel seragam di semua operasi panjang.

**Negative / tradeoffs**:

- Job hilang saat restart; jujur dan berbatas dampak untuk pemakaian interaktif.

**Neutral**:

- UI daftar job umum dibangun bersama fitur pemakainya (panel jobs di spec 0047), bukan di sini.

## Follow-up

- [ ] V2: persistensi riwayat job dan scheduled job bila kebutuhan terbukti.

## References

**Project sources**:

- v1-feature-specification.md FR-JOB-01, NFR-08; struktur.md packages/jobs.

**Practices & standards**:

- Cancellation kooperatif lewat AbortSignal; antrean berbatas konkurensi; jangan menjanjikan recovery yang tidak bisa dijamin.

**Links**: tidak ada yang diverifikasi untuk spec ini.
