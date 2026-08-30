# 0019. Subsistem audit append only

**Date**: 2026-08-28
**Status**: In Progress
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini membangun `packages/audit`: taksonomi event, penulis audit append only dengan redaction wajib, dan aturan pengurutan yang paling penting: untuk aksi mutatif yang wajib diaudit, response sukses tidak boleh terkirim sebelum event audit berhasil ditulis. Semua fitur destructive berikutnya menumpang jalur ini.

## Context

FR-AUD-01 (P0): audit append only dan tersensor untuk login penting, perubahan connection, destructive DDL, perubahan user dan privilege database, import destructive, backup, restore; response sukses menunggu audit tertulis. Bagian 8.2 butir 8 membatasi isi: metadata action saja, tanpa isi baris data, tanpa secret, dan SELECT biasa tidak diaudit. Tabel `audit_logs` dan repository append only sudah ada (spec 0008, 0009); redaction sudah ada (spec 0011). Yang dibangun di sini adalah kebijakan dan API nya.

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0009, 0011.

## Requirements

**User stories**:

- Sebagai Admin, saya ingin jejak siapa melakukan apa terhadap apa, yang tidak bisa diubah dari aplikasi.
- Sebagai developer fitur, saya ingin satu API audit yang benar secara default sehingga saya tidak bisa lupa menyensor atau salah urutan.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): taksonomi event terdefinisi dengan penamaan `domain.aksi` (contoh: `auth.login_succeeded`, `auth.login_failed`, `connection.created`, `connection.deleted`, `table.dropped`, `security.privilege_granted`, `import.completed`, `backup.completed`, `restore.completed`) dalam satu modul `events/` yang menjadi daftar tertutup; event baru ditambahkan lewat modul itu, bukan string bebas.
- [**AC-2**](test.md#ac-2): `AuditWriter.record(event)` menerima bentuk terstruktur: action, actorUserId (nullable untuk kegagalan pra login), targetType, targetRef (nama object, tanpa isi data), connectionId nullable, result (`success`/`failure`/`denied`), details objek kecil; seluruh payload melewati `Redaction.redactObject` sebelum tulis.
- [**AC-3**](test.md#ac-3): API `withAudit(event, fn)` menjalankan `fn`, lalu menulis event dengan result sesuai hasil, dan baru mengembalikan; kegagalan menulis audit untuk aksi wajib audit membuat operasi dianggap gagal (response error, bukan sukses tanpa audit); daftar aksi wajib audit dari FR-AUD-01 dikodekan sebagai flag di taksonomi.
- [**AC-4**](test.md#ac-4): correlation ID request (spec 0013) otomatis terlampir pada setiap event.
- [**AC-5**](test.md#ac-5): tidak ada API update atau delete pada audit; percobaan menghapus lewat SQL bukan bagian aplikasi (dilindungi review dan tidak ada jalurnya di kode).
- [**AC-6**](test.md#ac-6): kegagalan login dicatat dengan username yang dicoba pada `details.usernameAttempted` hanya bila lolos redaction dan dibatasi panjang; tanpa password dalam bentuk apa pun.
- [**AC-7**](test.md#ac-7): unit test membuktikan: urutan sukses menunggu audit, kegagalan audit menggagalkan aksi wajib, redaction bekerja pada details, dan taksonomi menolak action di luar daftar.
- [**AC-8**](test.md#ac-8): retensi V1: audit tidak dipangkas otomatis; ukuran dipantau lewat doctor check informasional (jumlah baris, perkiraan ukuran); pemangkasan adalah keputusan V2.

## Options considered

### Option 1: Penulisan sinkron dalam alur request (dipilih)

**Pros**:

- Menjamin urutan yang dituntut FR-AUD-01 tanpa mesin tambahan; SQLite lokal membuat biaya tulis kecil.

**Cons**:

- Menambah satu tulisan db pada latensi aksi mutatif; dapat diterima untuk volume alat admin.

### Option 2: Antrean audit asinkron dengan flush berkala

**Pros**:

- Latensi aksi lebih kecil.

**Cons**:

- Melanggar langsung syarat "success response tidak dikirim sebelum event tertulis"; risiko kehilangan event saat crash.

## Decision

**Chosen option**: Option 1: tulis sinkron, di dalam transaksi aksi bila aksi menulis SQLite internal, atau tepat setelah aksi provider berhasil dan sebelum response untuk aksi database target.

Taksonomi tertutup, writer tunggal dengan redaction wajib, helper `withAudit` sebagai satu satunya jalur fitur (basis: FR-AUD-01; struktur.md packages/audit: events, policies, redaction, writers).

## Rationale

Syarat pengurutan di FR-AUD-01 adalah inti akuntabilitas produk ini; hanya penulisan sinkron yang memenuhinya dengan sederhana. Taksonomi tertutup dipilih karena audit yang action nya string bebas cepat membusuk menjadi tidak bisa difilter; halaman audit (spec 0020) bergantung pada daftar action yang stabil. Redaction dipasang di writer, bukan di pemanggil, supaya lupa menyensor mustahil secara struktural.

## Feature design

**Data model sketch**: memakai `audit_logs` (spec 0008) apa adanya.

**API surface**: tidak ada endpoint (halaman dan API baca milik spec 0020); permukaan modul:

```text
AuditEvents.<domain>.<aksi>: definisi event (action, wajibAudit, targetType default)
AuditWriter.record(event): Promise<void>
withAudit(eventFactory, fn): Promise<T>
```

**Value sourcing**:

| Action | Value produced / displayed | Source                                                            |
| ------ | -------------------------- | ----------------------------------------------------------------- |
| record | occurred_at                | jam kernel                                                        |
| record | correlation_id             | AsyncLocalStorage request (spec 0013)                             |
| record | actorUserId                | sesi request; null untuk pra login                                |
| record | targetRef                  | nama object dari aksi (misal `db1.public.orders`), bukan isi data |

**Key invariants**:

- Aksi wajib audit tidak pernah menghasilkan response sukses tanpa baris audit (AC-3).
- Payload audit bebas secret dan bebas isi baris data (bagian 8.2 butir 8).
- Action selalu berasal dari taksonomi (AC-1).

**Security model**: penulisan lewat modul ini saja; pembacaan hanya lewat API admin (spec 0020).

**Configuration required**: tidak ada baru.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. [x] Definisikan taksonomi event V1 lengkap (daftar dari FR-AUD-01 plus event auth spec 0016 sampai 0018) dengan flag wajib audit, memenuhi **AC-1**.
2. [x] Bangun `AuditWriter` di atas `AuditRepository` dengan redaction wajib dan correlation otomatis, memenuhi **AC-2**, **AC-4**, **AC-5**.
3. [x] Bangun `withAudit` dengan semantik urutan dan kegagalan, memenuhi **AC-3**.
4. [x] Migrasikan penulisan audit sementara dari spec 0016 sampai 0018 ke jalur ini, memenuhi **AC-1**, **AC-6**.
5. [x] Doctor check informasional ukuran audit, memenuhi **AC-8**.
6. [x] Unit test lengkap di `packages/audit/test/` plus test redaction di `tests/security/redaction/`, memenuhi **AC-7**.

## Consequences

**Positive**:

- Semua fitur destructive berikutnya (drop, truncate, restore, revoke) tinggal membungkus aksinya dengan `withAudit`; jaminan FR-AUD-01 terpusat.

**Negative / tradeoffs**:

- Latensi kecil tambahan per aksi mutatif; audit yang tidak dipangkas akan menumbuhkan file db (dipantau doctor, dipangkas di V2).

**Neutral**:

- Halaman baca audit dan filternya sengaja dipisah ke spec 0020 supaya subsistem ini bisa selesai sebelum UI nya.

## Follow-up

- [ ] V2: kebijakan retensi audit (arsip atau pangkas) setelah ada data pemakaian nyata.

## References

**Project sources**:

- v1-feature-specification.md FR-AUD-01, FR-SAFE-02, bagian 8.2 butir 6 dan 8; struktur.md packages/audit.
- Spec 0009 (repo append only), 0011 (redaction), 0013 (correlation).

**Practices & standards**:

- Audit append only; write ahead acknowledgement (sukses hanya setelah jejak tertulis); taksonomi event tertutup.

**Links**: tidak ada yang diverifikasi untuk spec ini.
