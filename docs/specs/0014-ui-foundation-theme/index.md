# 0014. UI foundation dan theme

**Date**: 2026-08-28
**Status**: Proposed
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini memasang @ojiepermana/angular sebagai fondasi UI satu satunya dan membangun lapisan theme Myadmin di atasnya: identitas produk, semantic token, mode light, dark, dan system, beserta persistensi preferensi. Setelah spec ini, tidak ada komponen generik yang boleh dibuat sendiri, dan seluruh fitur merender di atas theme yang sama.

## Context

FR-UI-01 dan aturan struktur.md bagian 4.1 mengunci @ojiepermana/angular untuk theme, navigation, form, dialog, overlay, feedback, table, dan komponen umum; dilarang menambah design system kedua atau membuat ulang komponen generik. FR-UI-02 menuntut light, dark, dan system tersimpan per user dan konsisten di seluruh shell. Paket terverifikasi di npm publik pada 2026-08-28: v22.1.7 (terbit 2026-08-26), lisensi MIT, peer dependency Angular 22 ke atas. Satu nuansa penting dari halaman paketnya: `@angular/material` adalah peer opsional yang dibutuhkan komponen select, date picker, dan calendar milik paket itu, jadi kehadiran @angular/material sebagai dependency bukan pelanggaran aturan design system kedua; yang dilarang adalah import langsung @angular/material di kode aplikasi Myadmin.

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0001. Persistensi preferensi ke server menunggu spec 0017 (sesi); sebelum itu preferensi hidup di localStorage.

## Requirements

**User stories**:
- Sebagai pengguna, saya ingin memilih light, dark, atau ikut sistem, dan pilihan itu bertahan di sesi berikutnya.
- Sebagai developer, saya ingin token warna dan komponen siap pakai supaya fitur tidak mendesain sendiri.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): @ojiepermana/angular terpasang dari npm publik pada versi 22.1.7 atau lebih baru dengan versi terkunci di lockfile, termasuk peer opsional @angular/material bila komponen select, date picker, atau calendar dipakai; aplikasi web mengimpor theme dan providernya lewat `core/theme/` (`myadmin-theme.ts`, `theme.config.ts`).
- [**AC-2**](test.md#ac-2): mode light, dark, dan system bekerja: system mengikuti `prefers-color-scheme` dan berubah hidup saat OS berubah; perpindahan mode tidak memerlukan reload.
- [**AC-3**](test.md#ac-3): preferensi theme tersimpan: sebelum login di localStorage; setelah spec 0052 tersambung ke preferences server per user; struktur store (`theme-preference.store.ts`) sudah memisahkan sumber supaya penyambungan itu tidak mengubah pemakai.
- [**AC-4**](test.md#ac-4): identitas Myadmin didefinisikan sebagai konfigurasi theme (warna aksen, radius, tipografi, spacing) lewat mekanisme extension paket foundation, bukan CSS yang menimpa komponen.
- [**AC-5**](test.md#ac-5): audit kapabilitas terdokumentasi: daftar kebutuhan generik V1 (button, input, select, dialog, drawer, popover, tooltip, tabs, menu, breadcrumb, table/data grid, tree, form, toast, loading, resizable panel) dipetakan ke API paket foundation; setiap gap dicatat di Follow-up dengan rencana fallback yang tetap patuh aturan (minta penambahan di paket foundation, bukan membuat komponen generik lokal).
- [**AC-6**](test.md#ac-6): satu halaman demo internal (route dev saja, tidak masuk build production) menampilkan komponen inti pada kedua mode untuk verifikasi visual cepat.
- [**AC-7**](test.md#ac-7): aturan boundary/lint menolak import langsung design system lain di kode aplikasi (@angular/material, PrimeNG, Bootstrap) dan menolak pembuatan komponen bernama pola generik di `shared/` (daftar larangan dari struktur.md bagian 3); pengecualian tunggal: @angular/material boleh dipasang hanya pada `package.json` akar bila dibutuhkan untuk memenuhi peer dependency @ojiepermana/angular, tetapi tetap tidak boleh diimpor oleh kode `apps/web`.

## Options considered

### Option 1: Theme lewat mekanisme extension paket foundation (dipilih)

**Pros**:
- Sesuai aturan 4.1 butir 4: theme.config hanya mengonfigurasi dan meng extend; upgrade paket foundation tidak menabrak override liar.

**Cons**:
- Terikat pada kemampuan theming yang paket sediakan; gap harus diselesaikan di paket, bukan lokal.

### Option 2: Override CSS global di atas paket

**Pros**:
- Bebas menyetel apa pun segera.

**Cons**:
- Rapuh terhadap upgrade dan secara efektif menjadi design system kedua; dilarang aturan yang dikunci.

## Decision

**Chosen option**: Option 1: konfigurasi dan extension resmi paket foundation.

`core/theme/` memegang konfigurasi; `styles/myadmin-overrides.scss` hanya untuk penyesuaian layout halaman, bukan restyling komponen (basis: struktur.md 4.1; FR-UI-01, FR-UI-02).

**Implementation skills**: `angular-developer` (level user) untuk signals dan konvensi provider.

## Rationale

Nilai paket foundation justru hilang kalau di override; aturan proyek menutup jalur itu dengan sengaja. Risiko nyata satu satunya adalah gap kapabilitas, maka AC-5 menjadikan audit kapabilitas sebagai keluaran eksplisit spec ini, dengan jalur eskalasi yang benar (perbaiki paketnya). Pemisahan sumber persistensi preferensi disiapkan sekarang supaya urutan build (theme sebelum auth) tidak menghasilkan refactor.

## Feature design

**Data model sketch**: preferensi theme sebagai entri `preferences` (`user_id`, key `ui.theme`, value `light|dark|system`); sebelum login hanya localStorage key `myadmin.theme`.

**API surface**: belum ada endpoint baru (preferences API milik spec 0052).

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| mode efektif | light atau dark | preferensi user; bila `system`, `prefers-color-scheme` |
| preferensi awal | nilai theme | localStorage sebelum login; preferences server setelah spec 0052 |
| token warna | nilai | konfigurasi theme Myadmin di atas token paket foundation |

**Key invariants**:
- Tidak ada komponen generik baru di `apps/web/src/app/shared/` (hanya database-components, directives, pipes, types, utils).
- Perubahan mode adalah perubahan state reaktif, bukan reload.

**Security model**: tidak ada data sensitif; preferensi theme bukan rahasia.

**Configuration required**: tidak ada.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. Pasang @ojiepermana/angular v22.1.7 atau lebih baru dari npm publik (terverifikasi 2026-08-28), kunci versi di lockfile, tambahkan @angular/material sebagai peer bila komponen yang membutuhkannya dipakai, memenuhi **AC-1**.
2. Bangun `core/theme/` (konfigurasi identitas, token, mode) dan `theme-preference.store.ts` dengan abstraksi sumber, memenuhi **AC-2**, **AC-3**, **AC-4**.
3. Lakukan audit kapabilitas terhadap daftar kebutuhan V1 dan tulis hasilnya (tabel kebutuhan → API paket) sebagai lampiran di folder docs/architecture, memenuhi **AC-5**.
4. Bangun halaman demo dev only, memenuhi **AC-6**.
5. Tambahkan aturan lint/boundary larangan design system kedua dan pola komponen generik, memenuhi **AC-7**.

## Consequences

**Positive**:
- Seluruh fitur berikutnya mewarisi theme dan komponen konsisten; FR-UI-01 dan FR-UI-02 selesai di fondasi.

**Negative / tradeoffs**:
- Ketergantungan kuat pada satu paket eksternal milik sendiri; gap kapabilitas menjadi blocker fitur sampai paketnya dirilis ulang.

**Neutral**:
- Halaman demo dev menjadi tempat termurah memverifikasi regresi visual saat upgrade paket.

## Follow-up

- [ ] Isi hasil audit kapabilitas (AC-5); setiap gap menjadi issue di repo paket @ojiepermana/angular.
- [ ] Setelah spec 0052, sambungkan store preferensi theme ke preferences server.

## References

**Project sources**:
- v1-feature-specification.md FR-UI-01, FR-UI-02; struktur.md bagian 3 (shared, core/theme) dan 4.1.
- Pernyataan pemilik proyek 2026-08-28: paket lengkap, tersedia di npm publik.

**Practices & standards**:
- Design token dan semantic theming; satu design system per produk.

**Links** (terverifikasi web 2026-08-28):
- @ojiepermana/angular di npm (v22.1.7, terbit 2026-08-26, MIT): https://www.npmjs.com/package/@ojiepermana/angular
