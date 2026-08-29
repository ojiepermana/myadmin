# 0029. Realtime WebSocket dan klien SDK

**Date**: 2026-08-29
**Status**: Accepted
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini membangun kanal realtime: endpoint WebSocket dengan autentikasi sesi, protokol pesan berkanal sesuai skema event kontrak, subscribe dan unsubscribe per channel, heartbeat, serta klien realtime di SDK Angular dengan reconnect otomatis. Progress job, perubahan status koneksi, dan state eksekusi query mengalir lewat sini, menggantikan polling.

## Context

Skema protokol dan event sudah didefinisikan di kontrak (spec 0003): envelope `{ type, channel, payload, correlationId }`, event `job.progress`, `job.state`, `connection.status`, `query.execution`. Sesi WS ditegakkan server side (spec 0017 AC-5). Sumber event sudah ada: event internal JobManager (spec 0028) dan registry status koneksi (spec 0027). SDK punya kerangka `RealtimeClient` (spec 0005). Spec ini menyatukan semuanya.

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0017, 0028. Menyempurnakan spec 0027 (mengganti polling status).

## Requirements

**User stories**:

- Sebagai pengguna, saya ingin progress job dan perubahan status koneksi muncul seketika tanpa memuat ulang.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): endpoint `GET /ws` (upgrade) menerima hanya pemegang sesi valid (cookie yang sama dengan HTTP); tanpa sesi → upgrade ditolak; sesi kadaluarsa atau dicabut memutus koneksi dengan close code khusus paling lambat 60 detik (spec 0017 AC-5).
- [**AC-2**](test.md#ac-2): protokol pesan sesuai `websocket-protocol.yaml`: klien mengirim `{ type: 'subscribe' | 'unsubscribe', channel }` dan menerima `{ type: 'event', channel, payload, correlationId? }` plus `{ type: 'error' }` untuk pelanggaran; pesan tidak dikenal dijawab error tanpa memutus.
- [**AC-3**](test.md#ac-3): otorisasi channel: `jobs.<jobId>` hanya untuk pemilik job; `connections.status` mengalirkan hanya status koneksi milik user sesi itu; `query.<executionId>` hanya pemilik eksekusi; subscribe channel yang bukan haknya ditolak dengan error, tanpa membocorkan keberadaan resource.
- [**AC-4**](test.md#ac-4): event internal JobManager diteruskan ke channel `jobs.<id>` (progress dan perubahan state); perubahan registry status koneksi diteruskan ke `connections.status`; UI status (spec 0027) beralih dari polling ke push dengan polling tersisa sebagai fallback saat WS tidak tersambung.
- [**AC-5**](test.md#ac-5): heartbeat ping pong tiap 30 detik; koneksi tanpa pong dua interval ditutup; server membatasi maksimal 4 koneksi WS per user dan 200 subscription per koneksi.
- [**AC-6**](test.md#ac-6): klien SDK `RealtimeClient`: connect saat login, reconnect otomatis dengan backoff (1, 2, 5, 10 detik, maksimum 30), resubscribe otomatis semua channel aktif setelah reconnect, API `subscribe(channel, handler): Unsubscribe` bertipe payload sesuai kontrak; event `connectionState` untuk UI menampilkan indikator realtime.
- [**AC-7**](test.md#ac-7): payload event melewati redaction jalur keluar yang sama dengan HTTP (tidak ada secret di event, FR-INT-04); dibuktikan test.
- [**AC-8**](test.md#ac-8): integration test: subscribe job → progress mengalir berurutan; putus jaringan disimulasikan → reconnect dan resubscribe; sesi dicabut → WS tertutup dengan kode yang benar.

## Options considered

### Option 1: Satu koneksi WS multiplexed berkanal (dipilih)

**Pros**:

- Satu koneksi per tab aplikasi, murah dan sederhana; otorisasi per channel di satu tempat; sesuai skema event kontrak.

**Cons**:

- Perlu disiplin protokol subscribe; ditutup dengan tipe dari kontrak.

### Option 2: Server Sent Events per fitur

**Pros**:

- Lebih sederhana dari WS untuk satu arah.

**Cons**:

- Kontrak dan struktur.md sudah menetapkan WebSocket (event dua arah dan cancel query kelak); dua mekanisme realtime lebih buruk dari satu.

## Decision

**Chosen option**: Option 1: WS tunggal multiplexed dengan otorisasi per channel, klien SDK dengan reconnect dan resubscribe.

Elysia WebSocket sebagai transport server (basis: framework yang dipilih; struktur.md transport/websocket: channels, handlers, protocol, connection-registry).

## Rationale

Semua konsumen realtime V1 (jobs, status, query) adalah aliran server ke klien per user dengan hak berbeda per resource; kanal multiplexed dengan otorisasi subscribe memodelkan itu langsung. Resubscribe otomatis di klien dipilih supaya fitur tidak menulis logic pemulihan sendiri; fallback polling status dipertahankan karena indikator koneksi lebih baik sedikit basi daripada kosong saat WS bermasalah.

## Feature design

**Data model sketch**: tidak ada tabel; registry koneksi WS di server `{ sessionId, userId, socket, subscriptions: Set<channel> }`.

**API surface**:

| Endpoint | Method      | Key inputs  | Key outputs           | Auth | Key errors                                 |
| -------- | ----------- | ----------- | --------------------- | ---- | ------------------------------------------ |
| /ws      | GET upgrade | cookie sesi | aliran pesan protokol | sesi | 401 saat upgrade; close code sesi berakhir |

**Value sourcing**:

| Action               | Value produced / displayed | Source                                              |
| -------------------- | -------------------------- | --------------------------------------------------- |
| event job            | payload progress/state     | event internal JobManager (spec 0028)               |
| event status koneksi | payload status             | registry spec 0027                                  |
| otorisasi channel    | pemilik resource           | JobManager (ownerUserId), registry koneksi (userId) |
| correlationId event  | nilai                      | correlation operasi asal bila ada                   |

**Key invariants**:

- Tidak ada event yang dikirim ke koneksi yang tidak berhak atas channel nya (AC-3).
- Semua payload keluar tersensor (AC-7).
- Klien tidak pernah menganggap WS sebagai sumber kebenaran satu satunya; state bisa diambil ulang lewat HTTP (status, job by id) setelah reconnect.

**Security model**: autentikasi sesi pada upgrade dan pemeriksaan berkala; otorisasi per channel; batas koneksi dan subscription (AC-5) melawan penyalahgunaan.

**Configuration required**: tidak ada baru.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. Bangun transport/websocket di server: upgrade dengan sesi, registry koneksi, parser protokol, subscribe/unsubscribe dengan otorisasi channel, heartbeat, batas, memenuhi **AC-1**, **AC-2**, **AC-3**, **AC-5**.
2. Sambungkan sumber event: JobManager → `jobs.<id>`, registry status → `connections.status`; siapkan hook `query.<executionId>` untuk spec 0033, memenuhi **AC-4**.
3. Pastikan jalur kirim WS melewati redaction, plus test, memenuhi **AC-7**.
4. Bangun `RealtimeClient` SDK (connect, backoff, resubscribe, tipe payload dari kontrak) dan integrasi `core/realtime` di web; alihkan status koneksi ke push dengan fallback polling, memenuhi **AC-4**, **AC-6**.
5. Integration dan e2e test realtime, memenuhi **AC-8**.

## Consequences

**Positive**:

- Semua fitur panjang mendapat aliran progress seketika dengan satu pola; polling menyusut.

**Negative / tradeoffs**:

- WS menambah permukaan operasional (proxy, timeout infra operator); didokumentasikan di panduan operator.

**Neutral**:

- Hook `query.<executionId>` menganggur sampai spec 0033 memakainya.

## Follow-up

- [ ] Spec 0033 memakai channel query untuk state eksekusi.

## References

**Project sources**:

- Spec 0003 (skema event), 0017 (sesi WS), 0027, 0028; struktur.md transport/websocket; v1-feature-specification.md FR-JOB-01, bagian 8.2 butir 5.

**Practices & standards**:

- Multiplexed channel dengan otorisasi subscribe; reconnect dengan backoff dan resubscribe; state recoverable lewat HTTP.

**Links**: tidak ada yang diverifikasi untuk spec ini.
