# 0034. Result grid dan export result

**Date**: 2026-08-28
**Status**: Proposed
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini membangun komponen ResultGrid: penyajian hasil query yang aman dan nyaman (multiple result set sebagai sub tab, sel bertipe dengan render khusus NULL dan JSON, salin sel dan baris, kolom bisa diatur), plus export hasil yang dimuat ke CSV di sisi klien. Export set hasil penuh yang streaming menyusul lewat mesin export (spec 0047) pada tombol yang sama.

## Context

FR-QRY-05: result grid mendukung multiple result set, menampilkan kolom dan nilai secara aman, durasi, posisi error, dan export result tanpa menahan browser. ResultGrid adalah database component milik Myadmin (struktur.md shared/database-components) di atas data grid foundation. Bentuk sel berlabel tipe sudah ditetapkan kontrak (spec 0033 AC-8).

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0033.

## Requirements

**User stories**:
- Sebagai pengguna, saya ingin membaca hasil query dengan jelas (NULL vs kosong, JSON terbaca) dan menyalin apa yang saya pilih.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): ResultGrid menampilkan satu result set dengan virtual scrolling (ribuan baris mulus), header kolom dengan tipe data, lebar kolom bisa diubah, dan pengurutan sisi klien atas data yang dimuat (dengan label bahwa urutan hanya atas baris termuat bila terpotong).
- [**AC-2**](test.md#ac-2): multiple result set dari satu eksekusi tampil sebagai sub tab per statement dengan ringkasan (jumlah baris atau affected, durasi); statement error menampilkan panel error di posisi sub tab nya (FR-QRY-05).
- [**AC-3**](test.md#ac-3): render sel bertipe: NULL sebagai badge berbeda dari string kosong, angka rata kanan, tanggal ISO, boolean jelas, nilai panjang dipotong dengan pratinjau dan dialog lihat penuh; JSON dan JSONB mendapat viewer terformat di dialog; nilai biner tampil sebagai label ukuran (viewer BLOB adalah V2 sesuai feature.md); semua render sebagai teks (tanpa interpretasi HTML, aman dari injeksi markup).
- [**AC-4**](test.md#ac-4): salin: sel, baris terpilih, atau seluruh baris termuat, sebagai teks tab separated atau CSV; pemilihan baris ganda dengan klik shift dan checkbox.
- [**AC-5**](test.md#ac-5): export hasil termuat: tombol export menghasilkan CSV atau JSON dari baris yang sudah dimuat di klien seketika; saat hasil terpotong, tombol yang sama menawarkan "export semua baris lewat job" yang dinonaktifkan dengan keterangan sampai spec 0047 terpasang, lalu aktif setelahnya (satu tombol, dua jalur).
- [**AC-6**](test.md#ac-6): durasi eksekusi per statement dan total tampil; indikator hasil terpotong dengan jumlah yang dimuat vs penanda tidak diketahui.
- [**AC-7**](test.md#ac-7): grid dapat diakses: navigasi sel dengan keyboard, header dibaca screen reader, kontras badge NULL memadai (NFR-04).
- [**AC-8**](test.md#ac-8): unit dan e2e: render tipe tepat (fixture semua tipe umum kedua engine), salin menghasilkan format benar, multiple result set, 5000 baris tetap mulus.

## Options considered

### Option 1: ResultGrid di atas data grid foundation (dipilih)

**Pros**:
- Sesuai aturan FR-UI-01; virtualisasi dan aksesibilitas dari foundation; Myadmin hanya menambah semantik database (tipe sel, NULL, result set).

**Cons**:
- Fitur grid dibatasi kapabilitas foundation; gap dieskalasikan ke paket (pola spec 0014).

### Option 2: Grid hasil khusus dari nol

**Pros**:
- Kendali penuh.

**Cons**:
- Melanggar aturan komponen generik; virtualisasi dan a11y mahal dibangun ulang.

## Decision

**Chosen option**: Option 1: ResultGrid sebagai database component di `shared/database-components/result-grid/`, dipakai query editor dan nanti data browser (spec 0037) dengan mode berbeda.

## Rationale

ResultGrid akan menjadi komponen paling sering dipandang pengguna; membangunnya sekali dengan semantik database yang benar (NULL bukan kosong, presisi tidak hilang, teks tidak dieksekusi) dan memakainya di query editor dan data browser mencegah dua grid yang saling menyimpang. Keputusan satu tombol export dua jalur menjaga UX stabil saat kemampuan streaming datang belakangan.

## Feature design

**Data model sketch**: tidak ada tabel; menerima bentuk sel berlabel tipe dari kontrak (spec 0033).

**API surface**: tidak menambah endpoint (export penuh milik spec 0047).

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| render sel | nilai dan tipe | payload sel berlabel tipe dari eksekusi |
| indikator terpotong | jumlah dimuat, batas | metadata hasil (spec 0033 AC-6) |
| export klien | CSV/JSON | baris termuat di memori klien |
| export penuh | job export | spec 0047 (executionId atau SQL asal sebagai sumber) |

**Key invariants**:
- Semua nilai dirender sebagai teks; tidak ada jalur innerHTML atas data hasil.
- Salin dan export klien tidak pernah memicu query baru.
- Grid tidak mengubah data (read only di konteks query editor).

**Security model**: data hasil adalah data user dari database nya sendiri; risiko utamanya injeksi markup di klien, ditutup AC-3.

**Configuration required**: tidak ada.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. Bangun ResultGrid (virtual scroll, kolom, render sel bertipe, dialog nilai penuh, JSON viewer) di database-components, memenuhi **AC-1**, **AC-3**, **AC-7**.
2. Integrasikan ke query editor: sub tab per statement, panel error, ringkasan durasi, memenuhi **AC-2**, **AC-6**.
3. Bangun pemilihan dan salin (TSV/CSV), memenuhi **AC-4**.
4. Bangun export klien plus tombol dua jalur dengan gerbang fitur export penuh, memenuhi **AC-5**.
5. Unit test render, e2e alur hasil, test kinerja ringan, memenuhi **AC-8**.

## Consequences

**Positive**:
- Pengalaman membaca hasil setara alat desktop; komponen dipakai ulang data browser.

**Negative / tradeoffs**:
- Pengurutan klien atas data terpotong bisa disalahpahami; label eksplisit menekan risiko itu.

**Neutral**:
- Viewer BLOB ditunda V2 sesuai feature.md.

## Follow-up

- [ ] Spec 0047 mengaktifkan jalur "export semua baris" pada tombol yang sudah ada.

## References

**Project sources**:
- v1-feature-specification.md FR-QRY-05, NFR-04; feature.md baris BLOB viewer V2; struktur.md shared/database-components; spec 0033.

**Practices & standards**:
- Render data sebagai teks; virtualisasi untuk daftar besar; presisi lewat nilai berlabel tipe.

**Links**: tidak ada yang diverifikasi untuk spec ini.
