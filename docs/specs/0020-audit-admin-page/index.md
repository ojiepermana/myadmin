# 0020. Halaman audit Admin

**Date**: 2026-08-28
**Status**: In Progress
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini membangun jalur baca audit: endpoint pencarian audit dengan filter dan pagination server side, plus halaman admin yang menampilkannya memakai data grid foundation. Setelah spec ini, janji akuntabilitas produk bisa dilihat mata Admin, bukan hanya tersimpan.

## Context

FR-AUD-02 (P1): Admin dapat melihat audit history dengan filter waktu, actor, action, target connection atau object, dan pagination server side. Subsistem tulis sudah selesai (spec 0019) dengan taksonomi action yang stabil, yang menjadi sumber pilihan filter. Halaman ini admin only sesuai bagian 6.

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0017 (sesi dan role), 0019 (taksonomi dan data).

## Requirements

**User stories**:

- Sebagai Admin, saya ingin menelusuri kejadian penting berdasarkan waktu, pelaku, jenis aksi, dan target untuk investigasi.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): `GET /audit` (admin only) mendukung filter: rentang waktu (`from`, `to`), `actorUserId`, `action` (satu atau beberapa, dari taksonomi), `connectionId`, `targetRef` (pencocokan awalan), `result`; semua filter opsional dan bisa digabung.
- [**AC-2**](test.md#ac-2): hasil terurut `occurred_at` menurun dengan pagination server side (page, pageSize maksimum 100); total boleh berupa hitungan tepat karena query lokal.
- [**AC-3**](test.md#ac-3): response memuat baris audit apa adanya dari kolom yang aman (semua kolom `audit_logs`; `details` sudah tersensor sejak tulis); tidak ada proses un redact.
- [**AC-4**](test.md#ac-4): role user menjawab 403; guard web menyembunyikan menu audit dari non admin (dua lapis, server tetap penegak).
- [**AC-5**](test.md#ac-5): halaman audit: data grid foundation dengan kolom waktu, actor (username di join kan), action, target, koneksi, result, correlation ID; panel filter dengan pilihan action dari taksonomi yang diekspos endpoint kecil `GET /audit/actions`; baris bisa diperluas untuk melihat `details` JSON.
- [**AC-6**](test.md#ac-6): query berfilter memakai index yang ada (`occurred_at`, `actor_user_id`); kombinasi filter umum tetap responsif pada 100 ribu baris (dibuktikan test performa ringan dengan data sintetis).
- [**AC-7**](test.md#ac-7): e2e: aksi destructive yang dilakukan di test (misal hapus koneksi) muncul di halaman audit dengan filter action yang tepat.

## Options considered

### Option 1: Filter SQL dinamis parameterized di repository (dipilih)

**Pros**:

- Sederhana, memanfaatkan index, jumlah kombinasi filter kecil dan dikenal.

**Cons**:

- Penulisan klausa dinamis harus rapi; ditutup dengan builder kecil yang diuji.

### Option 2: Full text search di atas audit

**Pros**:

- Pencarian bebas.

**Cons**:

- FR-AUD-02 hanya meminta filter terstruktur; FTS menambah index dan kompleksitas tanpa permintaan.

## Decision

**Chosen option**: Option 1: perluasan `AuditRepository.query` dengan filter terstruktur parameterized.

Pilihan action untuk UI datang dari taksonomi (spec 0019) lewat endpoint ringan, sehingga UI tidak menghardcode daftar (basis: FR-AUD-02; taksonomi tertutup spec 0019).

## Rationale

Data audit lokal dan berukuran moderat; SQL berindeks dengan filter terstruktur memenuhi seluruh FR tanpa infrastruktur baru. Mengambil daftar action dari taksonomi menjaga UI tetap benar saat event baru ditambah fitur berikutnya, tanpa rilis UI yang terpisah dari rilis server (satu binary).

## Feature design

**Data model sketch**: memakai `audit_logs` plus join ringan ke `users` untuk username actor; tidak ada tabel baru.

**API surface**:

| Endpoint       | Method | Key inputs                                                                              | Key outputs                  | Auth  | Key errors                  |
| -------------- | ------ | --------------------------------------------------------------------------------------- | ---------------------------- | ----- | --------------------------- |
| /audit         | GET    | from?, to?, actorUserId?, action[]?, connectionId?, targetRef?, result?, page, pageSize | items, page, pageSize, total | admin | 403, 422 filter tidak valid |
| /audit/actions | GET    | tidak ada                                                                               | daftar action taksonomi      | admin | 403                         |

**Value sourcing**:

| Action        | Value produced / displayed | Source                                                              |
| ------------- | -------------------------- | ------------------------------------------------------------------- |
| list          | username actor             | join `users.username`; actor null tampil sebagai "sistem/pra login" |
| filter action | pilihan tersedia           | taksonomi spec 0019                                                 |
| baris details | JSON tersensor             | kolom `details` apa adanya (sudah tersensor saat tulis)             |
| total         | hitungan                   | COUNT query yang sama                                               |

**Key invariants**:

- Endpoint baca tidak pernah mengubah baris audit; tidak ada endpoint tulis audit publik.
- pageSize dibatasi 100 di kontrak dan server.

**Security model**: admin only di server (middleware role) dan di web (guard); correlation ID boleh tampil karena bukan rahasia.

**Configuration required**: tidak ada baru.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. [x] Perluas `AuditRepository.query` dengan builder filter parameterized plus test, memenuhi **AC-1**, **AC-2**, **AC-6**.
2. [x] Tambahkan operasi `/audit` dan `/audit/actions` ke kontrak, regenerasi tipe dan SDK, daftarkan contract test, memenuhi **AC-1**, **AC-3**.
3. [x] Endpoint server admin only, memenuhi **AC-4**.
4. [x] Web: feature `audit` (halaman grid, panel filter, baris expandable), guard admin, memenuhi **AC-5**.
5. [x] E2e alur audit dari aksi nyata, memenuhi **AC-7**.

## Consequences

**Positive**:

- Audit menjadi fitur yang terlihat; investigasi tidak butuh akses file db.

**Negative / tradeoffs**:

- Join username per baris menambah biaya kecil; bisa dioptimalkan nanti bila perlu.

**Neutral**:

- Ekspor audit ke file tidak ada di V1; bisa menumpang jalur export umum di masa depan.

## Follow-up

- [ ] Tinjau kebutuhan ekspor audit setelah pemakaian nyata (kandidat V2).

## References

**Project sources**:

- v1-feature-specification.md FR-AUD-02, bagian 6; spec 0019.

**Practices & standards**:

- Pagination server side untuk data tumbuh; pilihan filter dari sumber kebenaran tunggal.

**Links**: tidak ada yang diverifikasi untuk spec ini.
