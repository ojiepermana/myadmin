# 0027. Connection manager: lifecycle dan status

**Date**: 2026-08-29
**Status**: Accepted
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini menghidupkan koneksi tersimpan: connect, disconnect, reconnect, registry sesi provider aktif di server, status per koneksi (terputus, menyambung, tersambung, error) yang terlihat di sidebar dan status bar, plus info server dan latency. Status awalnya dilaporkan lewat response dan polling ringan; kanal push realtime menyusul di spec 0029 tanpa mengubah model.

## Context

FR-CONN-03 menuntut connect, disconnect, reconnect mengubah state dengan benar; FR-CONN-04 status independen per koneksi; FR-CONN-06 status mudah dilihat (shell menampilkan status, engine, versi, latency); FR-OPS-01 status dan info server diperbarui saat connect, reconnect, dan error. Keputusan penting yang diambil di sini: sesi provider aktif dimiliki per user per koneksi di proses server, dengan connect eksplisit (bukan connect otomatis saat dipakai), karena koneksi tanpa credential tersimpan butuh momen meminta password.

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0026.

## Requirements

**User stories**:

- Sebagai pengguna, saya ingin menyambungkan koneksi dan melihat statusnya jelas di sidebar dan status bar.
- Sebagai pengguna dengan koneksi tanpa password tersimpan, saya ingin dimintai password saat menyambung, sekali per sesi sambung.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): `POST /connections/:id/connect` membuka sesi provider untuk pemilik koneksi; credential dari vault, atau dari `secret` transient di body bila tidak tersimpan (tidak dicatat, tidak dipersist); sukses mengembalikan status `connected` plus serverInfo (engine, versi) dan capability (FR-PROV-04).
- [**AC-2**](test.md#ac-2): registry sesi aktif di server memetakan (userId, connectionId) → sesi provider; connect ulang saat sudah tersambung adalah no op yang mengembalikan status kini; dua koneksi berbeda punya state independen (FR-CONN-04).
- [**AC-3**](test.md#ac-3): `POST /connections/:id/disconnect` menutup sesi provider dan membebaskan resource; `POST /connections/:id/reconnect` menutup lalu membuka lagi dengan credential yang sama (vault) atau meminta transient lagi bila tidak tersimpan.
- [**AC-4**](test.md#ac-4): `GET /connections/status` mengembalikan status seluruh koneksi milik user: `disconnected` | `connecting` | `connected` | `error` dengan detail aman (kategori error, waktu perubahan, versi server, latency test terakhir); UI mem poll ringan (10 detik) sampai spec 0029 menggantinya dengan push.
- [**AC-5**](test.md#ac-5): kegagalan sesi di tengah jalan (server database mati) terdeteksi saat operasi berikutnya gagal; status koneksi menjadi `error` dengan kategori, dan reconnect memulihkannya; tidak ada retry otomatis diam diam di V1 (pengguna memutuskan).
- [**AC-6**](test.md#ac-6): logout, kadaluarsa sesi aplikasi, atau penghapusan koneksi menutup sesi provider terkait; shutdown server menutup semua sesi provider dengan rapi.
- [**AC-7**](test.md#ac-7): sidebar menampilkan indikator status per koneksi (warna plus ikon dan teks yang bisa diakses screen reader); status bar menampilkan koneksi aktif konteks kini: label, engine, versi, latency (FR-CONN-06, FR-OPS-01); tidak ada credential atau connection string di tampilan mana pun.
- [**AC-8**](test.md#ac-8): connect dan disconnect tercatat audit (`connection.opened`, `connection.closed`) tanpa secret; kegagalan connect tercatat dengan kategori.
- [**AC-9**](test.md#ac-9): idle timeout sesi provider: sesi tanpa aktivitas 30 menit ditutup otomatis dan status kembali `disconnected` dengan alasan `idle_closed` yang terlihat pengguna; nilai dari config `provider.idleTimeoutMinutes`.

## Options considered

### Option 1: Connect eksplisit dengan registry per user per koneksi (dipilih)

**Pros**:

- Momen jelas untuk meminta password transient; status yang pengguna lihat sama dengan kenyataan server; cocok dengan mental model alat database.

**Cons**:

- Pengguna harus menekan connect; dianggap wajar untuk alat kelas ini.

### Option 2: Connect otomatis malas saat operasi pertama

**Pros**:

- Satu langkah lebih sedikit.

**Cons**:

- Tidak ada tempat alami meminta password transien; kegagalan koneksi muncul sebagai kegagalan fitur acak, membingungkan.

## Decision

**Chosen option**: Option 1: connect eksplisit, registry sesi aktif per (user, koneksi), idle timeout, tanpa auto retry.

Status dipush kemudian oleh spec 0029 lewat channel `connections.status`; model status di sini sudah final (basis: FR-CONN-03, 04, 06; FR-OPS-01).

## Rationale

Alat administrasi database harus mempertahankan kesesuaian antara indikator dan kenyataan; connect eksplisit plus status berbasis registry server membuat itu sederhana dan jujur. Auto retry ditolak untuk V1 karena menyembunyikan masalah (kredensial dicabut, server mati) di balik indikator berkedip; keputusan pengguna lebih aman. Idle timeout melindungi server database target dari sesi menggantung milik tab yang ditinggal.

## Feature design

**Data model sketch**: tidak menambah tabel; state runtime registry `ActiveSession { userId, connectionId, providerHandle, status, since, lastError?, serverInfo?, lastActivityAt }`.

**State transitions** (koneksi per user): disconnected → connecting → connected → (error | disconnected); error → connecting (reconnect); connected → disconnected (disconnect, idle_closed, logout, delete).

**API surface**:

| Endpoint                    | Method | Key inputs          | Key outputs                      | Auth    | Key errors                                                         |
| --------------------------- | ------ | ------------------- | -------------------------------- | ------- | ------------------------------------------------------------------ |
| /connections/:id/connect    | POST   | secret? (transient) | status, serverInfo, capabilities | pemilik | 401 secret salah (kategori auth_failed), 404, 409 sudah connecting |
| /connections/:id/disconnect | POST   | tidak ada           | status                           | pemilik | 404                                                                |
| /connections/:id/reconnect  | POST   | secret?             | status, serverInfo, capabilities | pemilik | sama dengan connect                                                |
| /connections/status         | GET    | tidak ada           | daftar status                    | sesi    |                                                                    |

**Value sourcing**:

| Action       | Value produced / displayed | Source                                                                             |
| ------------ | -------------------------- | ---------------------------------------------------------------------------------- |
| connect      | serverInfo, capabilities   | provider describe saat open (spec 0022, 0024)                                      |
| status       | latency                    | pengukuran ping saat connect dan test terakhir                                     |
| status       | kategori error             | `DbError.category`                                                                 |
| idle timeout | ambang                     | config `provider.idleTimeoutMinutes` (default 30, ditambahkan ke schema spec 0012) |

**Key invariants**:

- Satu sesi provider per (user, koneksi); tidak ada sharing sesi antar user (bagian 8.2 butir 6: hak akses mengikuti credential koneksi).
- Secret transient berumur satu permintaan connect; tidak masuk registry.
- Status yang dilaporkan selalu berasal dari registry server, bukan dugaan klien.

**Security model**: connect/disconnect hanya pemilik (Admin pun tidak, konsisten spec 0026). Response status tidak memuat host detail bagi非 pemilik karena memang hanya milik sendiri yang dikembalikan.

**Configuration required**:

- `provider.idleTimeoutMinutes` (baru di schema config): default 30.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. Bangun registry sesi aktif di modul server connections (state, transisi, idle sweeper, penutupan saat logout/delete/shutdown), unit test transisi, memenuhi **AC-2**, **AC-5**, **AC-6**, **AC-9**.
2. Tambah operasi connect/disconnect/reconnect/status ke kontrak, regenerasi, contract test.
3. Implementasikan endpoint dengan jalur vault dan transient plus audit, memenuhi **AC-1**, **AC-3**, **AC-8**.
4. UI: aksi connect di sidebar dengan dialog password transient bila perlu, indikator status per koneksi, segmen status bar, polling 10 detik, memenuhi **AC-4**, **AC-7**.
5. Integration test lifecycle terhadap kedua engine, e2e connect disconnect, memenuhi seluruh AC.

## Consequences

**Positive**:

- Model sesi aktif menjadi fondasi query editor (sesi per tab, spec 0033) dan semua fitur database; status jujur sejak awal.

**Negative / tradeoffs**:

- Polling 10 detik sementara menambah request kecil; hilang saat spec 0029.
- Tanpa auto retry, pengguna menekan reconnect sendiri; sesuai filosofi kejelasan.

**Neutral**:

- Idle timeout memutus sesi menganggur; query panjang yang berjalan bukan menganggur (aktivitas tercatat).

## Follow-up

- [ ] Spec 0029 mengganti polling status dengan push channel `connections.status`.

## References

**Project sources**:

- v1-feature-specification.md FR-CONN-03, FR-CONN-04, FR-CONN-06, FR-OPS-01; spec 0022, 0024, 0026.

**Practices & standards**:

- Status dari sumber kebenaran tunggal; kegagalan eksplisit lebih baik daripada retry tersembunyi.

**Links**: tidak ada yang diverifikasi untuk spec ini.
