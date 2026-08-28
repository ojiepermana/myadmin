# 0030. Workspace persistence

**Date**: 2026-08-28
**Status**: In Progress
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini membuat tata letak kerja pengguna bertahan: tab yang terbuka, ukuran dan keadaan panel, serta konteks aktif disimpan ke server per user dan dipulihkan setelah login kembali. State yang disimpan adalah deskriptor (data), bukan isi hidup, sesuai desain tab spec 0015.

## Context

FR-UI-03 menuntut state dasar workspace dapat dipulihkan setelah login kembali; FR-EXP-04 menuntut konteks tab eksplisit dan tidak tertukar antar koneksi. Tabel `workspaces` (satu baris per user, kolom state JSON) dan repository nya sudah ada (spec 0008, 0009). `WorkspaceState` klien sudah berbentuk data (spec 0015). Yang diputuskan di sini: bentuk state yang dipersist, versi skema state, dan kebijakan pemulihan saat isinya tidak lagi valid (koneksi terhapus).

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0015, 0017.

## Requirements

**User stories**:
- Sebagai pengguna, saya ingin kembali ke susunan tab dan panel yang sama setelah login lagi.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): `GET /workspace` mengembalikan state tersimpan milik user (atau default kosong); `PUT /workspace` menyimpan seluruh state; keduanya sesuai kontrak dengan schema state yang dinyatakan.
- [**AC-2**](test.md#ac-2): state berbentuk `{ version: 1, tabs: TabDescriptor[], activeTabId, panels { sidebarWidth, bottomHeight, sidebarCollapsed }, activeConnectionId? }`; `TabDescriptor.context` wajib serializable dan memuat referensi eksplisit (connectionId, database, schema bila ada) sesuai FR-EXP-04.
- [**AC-3**](test.md#ac-3): klien menyimpan dengan debounce (2 detik setelah perubahan terakhir, plus flush saat beforeunload) supaya drag panel tidak membanjiri server.
- [**AC-4**](test.md#ac-4): pemulihan saat login: tab yang koneksinya sudah terhapus atau bukan milik user dibuang saat restore dengan pemberitahuan ringan ("2 tab dilewati karena koneksinya sudah tidak ada"); tab yang tersisa dipulihkan dalam keadaan tidak tersambung (koneksi tetap connect eksplisit, spec 0027).
- [**AC-5**](test.md#ac-5): field `version` memungkinkan migrasi state di masa depan; state dengan versi tak dikenal diperlakukan sebagai kosong dengan pemberitahuan, tanpa merusak sesi.
- [**AC-6**](test.md#ac-6): state tidak pernah memuat data sensitif: tanpa hasil query, tanpa isi editor yang belum disimpan melebihi draft SQL per tab (draft SQL disertakan, itu milik pengguna dan berguna), tanpa credential; validasi server menolak state melebihi 256 KB.
- [**AC-7**](test.md#ac-7): e2e: buka tab query dengan konteks, atur panel, logout, login → susunan pulih; hapus koneksi lalu login → tab terkait dilewati dengan pemberitahuan.

## Options considered

### Option 1: Satu dokumen state JSON per user (dipilih)

**Pros**:
- Sesuai tabel yang dikunci; restore dan simpan atomik; sederhana.

**Cons**:
- Penyimpanan seluruh dokumen tiap perubahan; ukuran dibatasi dan debounce menekan frekuensi.

### Option 2: Normalisasi tab ke tabel sendiri

**Pros**:
- Perubahan granular.

**Cons**:
- Kompleksitas skema untuk data yang dibaca sebagai satu kesatuan saja; tidak ada query per tab yang dibutuhkan.

## Decision

**Chosen option**: Option 1: dokumen JSON berversi per user, debounce di klien, sanitasi saat restore.

Draft SQL per tab ikut dipersist (basis: FR-QRY-01 menyimpan SQL draft per tab; kehilangan draft adalah kehilangan kerja pengguna).

## Rationale

State workspace dibaca dan ditulis sebagai keseluruhan; dokumen tunggal berversi adalah bentuk paling jujur. Kebijakan restore yang membuang referensi mati dengan pemberitahuan dipilih daripada gagal total atau diam diam, sesuai prinsip UI yang menjelaskan (bagian 3 butir 4). Batas ukuran melindungi server dari state liar sekaligus memaksa fitur menjaga context tetap deskriptor.

## Feature design

**Data model sketch**: memakai `workspaces` (spec 0008): user_id unique, state TEXT JSON, updated_at.

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| /workspace | GET | tidak ada | state | sesi | |
| /workspace | PUT | state (versi, tabs, panels) | kosong | sesi | 422 schema/ukuran |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| restore | daftar tab valid | state tersimpan disaring terhadap daftar koneksi milik user kini |
| restore | pemberitahuan tab dilewati | selisih hasil penyaringan |
| simpan | state | `workspace.store` klien (spec 0015) |

**Key invariants**:
- Context tab selalu memuat connectionId eksplisit; restore tidak pernah menebak koneksi (FR-EXP-04).
- Restore tidak membuka koneksi apa pun otomatis.
- State per user, tidak ada berbagi workspace.

**Security model**: hanya pemilik sesi membaca dan menulis workspace nya; penyaringan restore juga menegakkan kepemilikan koneksi.

**Configuration required**: tidak ada baru.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. Tambah operasi workspace ke kontrak plus schema state berversi, regenerasi, contract test, memenuhi **AC-1**, **AC-2**.
2. Endpoint server dengan validasi schema dan ukuran, memenuhi **AC-6**.
3. Klien: sinkronisasi `workspace.store` (debounce, flush, restore dengan sanitasi dan pemberitahuan), memenuhi **AC-3**, **AC-4**, **AC-5**.
4. E2e restore dua skenario, memenuhi **AC-7**.

## Consequences

**Positive**:
- Aplikasi terasa seperti alat kerja yang mengingat; syarat restore FR-UI-03 selesai.

**Negative / tradeoffs**:
- Draft SQL di state menambah ukuran; batas 256 KB memadai untuk puluhan tab wajar.

**Neutral**:
- Migrasi bentuk state di masa depan lewat field version.

## Follow-up

- [ ] Fitur tab baru (query, data browser, designer) wajib mendefinisikan context serializable nya saat dibangun.

## References

**Project sources**:
- v1-feature-specification.md FR-UI-03, FR-EXP-04, FR-QRY-01; spec 0008, 0015.

**Practices & standards**:
- State UI sebagai dokumen berversi; restore yang menjelaskan, bukan menebak.

**Links**: tidak ada yang diverifikasi untuk spec ini.
