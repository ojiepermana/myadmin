# 0053. Hardening keamanan lintas fitur

**Date**: 2026-08-28
**Status**: In Progress
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini adalah standar lintas fitur (cross cutting) yang mengunci dan membuktikan janji keamanan produk menjelang rilis: satu sweep redaction menyeluruh, header keamanan HTTP, standar rate limiting, suite test keamanan yang menjadi gerbang CI, dan matriks e2e otorisasi. Ia tidak menambah fitur; ia membuktikan fitur yang ada memenuhi bagian 8.2 dan Definition of Done butir 5 dan 6.

## Context

Setiap spec sebelumnya membawa kewajiban keamanannya sendiri; menjelang rilis dibutuhkan pemeriksaan lintas yang tidak percaya pada ingatan: apakah benar tidak ada secret di log, audit, error, fixture, dan response; apakah semua endpoint di belakang sesi; apakah semua destructive terkonfirmasi dan teraudit. Definition of Done butir 5, 6, 8 menuntut bukti, bukan klaim. Folder `tests/security/` sudah menampung sebagian test per fitur; spec ini menyatukannya menjadi gerbang.

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: seluruh fitur P0 selesai; idealnya dijalankan saat fitur P1 sudah lengkap.

## Requirements

**User stories**:

- Sebagai pemilik proyek, saya ingin bukti tersistem bahwa janji keamanan dokumen benar benar dipegang kode sebelum rilis pertama.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): standar redaction terdokumentasi dan ditegakkan: semua saluran keluar (log, ApiError, audit details, event WS, output doctor, stderr subprocess yang diteruskan) melewati modul redaction spec 0011; test lintas menyuntik secret penanda ke setiap saluran dan memastikan tidak lolos.
- [**AC-2**](test.md#ac-2): sweep fixture dan test data: `tests/fixtures/` dan seluruh test bebas credential nyata (pemindai pola secret berjalan di CI atas fixture dan source test); pelanggaran menggagalkan CI.
- [**AC-3**](test.md#ac-3): header keamanan HTTP terpasang di server: Content-Security-Policy yang cocok untuk SPA yang di embed (default-src 'self', larangan inline script kecuali yang build Angular butuhkan dengan hash), X-Content-Type-Options nosniff, Referrer-Policy, X-Frame-Options DENY, dan Cache-Control no-store untuk response API; dibuktikan test header.
- [**AC-4**](test.md#ac-4): standar rate limiting terdefinisi di satu modul dan terpasang minimal pada: setup, login, test connection, upload; nilai terdokumentasi; test membuktikan 429 bekerja dan pulih.
- [**AC-5**](test.md#ac-5): matriks e2e otorisasi dijalankan: untuk setiap kelompok endpoint, tiga aktor (anonim, user, admin) diuji terhadap harapan (401/403/200) dari tabel yang digenerate dari kontrak (operasi plus anotasi auth nya); endpoint baru tanpa baris matriks menggagalkan test (kelengkapan dipaksa).
- [**AC-6**](test.md#ac-6): verifikasi enkripsi at rest menyeluruh: test yang membuat data lengkap (user, koneksi dengan credential, history) lalu memindai byte file SQLite untuk penanda secret; lolos berarti Definition of Done butir 5 terbukti.
- [**AC-7**](test.md#ac-7): audit destructive lengkap: test menyisir taksonomi audit terhadap daftar operasi destructive dari seluruh spec (drop, truncate, delete, restore, revoke, reset credential, import destructive) dan memastikan setiap alurnya menghasilkan event (Definition of Done butir 8).
- [**AC-8**](test.md#ac-8): workflow CI `security.yml` menjalankan seluruh suite keamanan dan pemindai; menjadi gerbang wajib rilis (spec 0054 bergantung padanya).

## Options considered

### Option 1: Standar plus suite gerbang CI (dipilih)

**Pros**:

- Janji keamanan menjadi properti yang diperiksa mesin setiap perubahan, bukan audit sekali jalan.

**Cons**:

- Suite lintas menambah waktu CI; dijalankan sebagai workflow terpisah.

### Option 2: Audit keamanan manual menjelang rilis

**Pros**:

- Tanpa kerja infrastruktur test.

**Cons**:

- Sekali jalan lalu membusuk; regresi keamanan berikutnya tidak tertangkap.

## Decision

**Chosen option**: Option 1: standar tertulis (bagian Standard definition) plus suite `tests/security/` sebagai gerbang `security.yml`.

## Rationale

Semua kewajiban di sini sudah menjadi aturan sejak spec awal; nilai spec ini adalah mengubahnya dari aturan per fitur menjadi properti sistem yang diuji lintas dan dipaksa lengkap (matriks yang digenerate dari kontrak menutup lubang "endpoint baru lupa diuji"). Ini bentuk termurah dari janji Definition of Done yang bisa dipertahankan setelah V1.

## Standard definition

**Canonical pattern** (saluran keluar):

```typescript
// Setiap saluran keluar proses memanggil redaction tepat sebelum menulis.
// Contoh: logger (spec 0013), presenter ApiError, AuditWriter, pengirim event WS.
write(redact(payload));
// Dilarang: menulis payload mentah ke saluran mana pun, atau menyensor manual per pemanggil.
```

**Replaces**:

- Sensor ad hoc per fitur; console langsung; penerusan stderr subprocess mentah.

**Enforcement**:

- Test suntik secret per saluran (AC-1) di `tests/security/redaction/`; lint larangan console; pemindai fixture di CI; matriks otorisasi digenerate dari kontrak; semuanya di `security.yml` sebagai gerbang.

**Rollout**:

- Segera untuk semua kode yang ada (sweep satu kali di build plan), lalu berlaku untuk semua kode baru lewat CI.

**Exceptions**:

- Tidak ada. Saluran keluar baru wajib mendaftar ke test suntik secret.

## Feature design

**Data model sketch**: tidak ada.

**API surface**: tidak menambah endpoint; menambah header pada semuanya.

**Value sourcing**:

| Action               | Value produced / displayed       | Source                                        |
| -------------------- | -------------------------------- | --------------------------------------------- |
| matriks otorisasi    | daftar operasi plus auth harapan | bundel kontrak (anotasi security per operasi) |
| daftar destructive   | operasi wajib audit              | taksonomi audit (spec 0019) plus daftar FR    |
| pola pemindai secret | regex penanda                    | modul redaction (satu sumber)                 |

**Key invariants**:

- `security.yml` hijau adalah prasyarat artefak rilis.
- Matriks otorisasi selalu lengkap terhadap kontrak (test gagal bila ada operasi tak tercakup).

**Security model**: spec ini adalah security model lintas; kepatuhannya terukur di CI.

**Configuration required**: tidak ada.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. Tulis standar redaction dan daftar saluran keluar; sweep kode: pastikan setiap saluran memanggil redaction; tambah test suntik per saluran, memenuhi **AC-1**.
2. Pasang pemindai secret untuk fixture dan source test di CI, memenuhi **AC-2**.
3. Pasang header keamanan di server plus test header, memenuhi **AC-3**.
4. Konsolidasikan rate limiter ke satu modul dengan nilai terdokumentasi, terpasang di empat titik, plus test, memenuhi **AC-4**.
5. Bangun generator matriks otorisasi dari kontrak dan e2e tiga aktor, memenuhi **AC-5**.
6. Test at rest byte scan dan test kelengkapan audit destructive, memenuhi **AC-6**, **AC-7**.
7. Rakit `security.yml` sebagai gerbang, memenuhi **AC-8**.

## Consequences

**Positive**:

- Definition of Done butir 5, 6, 8 punya bukti mekanis yang bertahan setelah V1.

**Negative / tradeoffs**:

- CI lebih lama; keamanan produk ini memang intinya.

**Neutral**:

- Suite ini menjadi rumah alami test keamanan fitur V2.

## Follow-up

- [ ] Tidak ada.

## References

**Project sources**:

- v1-feature-specification.md bagian 8.2, NFR-03, NFR-07, Definition of Done butir 5, 6, 8; spec 0011, 0013, 0017, 0019.

**Practices & standards**:

- Defense in depth; properti keamanan sebagai test; matriks otorisasi digenerate dari kontrak.

**Links**: tidak ada yang diverifikasi untuk spec ini.
