# 0054. Packaging binary dan smoke test

**Date**: 2026-08-28
**Status**: Proposed
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini membangun jalur dari kode ke executable: build production Angular, embed aset web ke binary, kompilasi Bun Compile untuk lima target platform, checksum, dan smoke test otomatis yang membuktikan setiap binary bisa start, setup, login, menyajikan aset, membuka koneksi, dan shutdown dengan rapi. Hasilnya artefak rilis yang terverifikasi; distribusi dan signing menyusul di spec 0055.

## Context

FR-RUN-02 dan FR-RUN-03: distribusi linux-x64, linux-arm64, macos-x64, macos-arm64, windows-x64, masing masing dengan artefak, checksum, smoke test, dan dokumentasi; aset Angular di embed sehingga user tidak butuh runtime apa pun. Definition of Done butir 4 mendefinisikan isi smoke test. Kerangka runtime CLI sudah final (spec 0006, `embedded-assets.ts` sudah membedakan dev dan release); yang dibangun di sini adalah skrip build, embedding nyata, kompilasi per target, dan harness smoke.

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0006; fitur P0 (setup, login, koneksi) untuk isi smoke test; `security.yml` (spec 0053) sebagai gerbang rilis.

## Requirements

**User stories**:
- Sebagai operator, saya ingin mengunduh satu file untuk platform saya dan menjalankannya tanpa memasang apa pun.
- Sebagai pemilik proyek, saya ingin setiap artefak rilis terbukti hidup lewat smoke test otomatis.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): `scripts/build/build-web.ts` menghasilkan build production Angular ke `dist/web/`; `embed-web-assets.ts` menghasilkan modul manifest aset (path, konten, tipe MIME, hash untuk caching header) yang ikut terkompilasi; server menyajikan dari manifest ini pada mode release (spec 0006 AC-5).
- [**AC-2**](test.md#ac-2): `compile-binary.ts` menjalankan Bun Compile dengan entrypoint `apps/cli/src/main.ts` untuk kelima target lintas platform (cross compile dari runner CI), menghasilkan `dist/binaries/<target>/myadmin[.exe]`; versi dan commit hash di inject saat build (dipakai `version`, spec 0006 AC-6).
- [**AC-3**](test.md#ac-3): `checksums.ts` menghasilkan SHA-256 per artefak dalam satu file checksum; hasil build deterministik sejauh toolchain memungkinkan (input build dipin: versi Bun, lockfile).
- [**AC-4**](test.md#ac-4): harness smoke test (`scripts/verify/smoke-binary.ts`) menjalankan binary nyata pada data directory sementara dan membuktikan lewat HTTP: proses start dan health 200; `GET /` menyajikan SPA (bukti embed); setup admin; login dan `GET /auth/me`; tambah koneksi ke database test dan connect sukses; SIGTERM shutdown rapi exit 0; `doctor` exit 0 pada instalasi sehat (Definition of Done butir 4).
- [**AC-5**](test.md#ac-5): workflow CI `release.yml`: berjalan pada tag; prasyarat hijau: ci, contract, integration, security; lalu build web, kompilasi lima target, checksum, smoke test per target yang bisa dijalankan runner yang tersedia (linux-x64 dan macos di runner masing masing; target yang tidak bisa diuji runner ditandai jelas di ringkasan rilis, NFR-05 "per target yang tersedia"); artefak diunggah sebagai output workflow.
- [**AC-6**](test.md#ac-6): ukuran dan isi dipantau: laporan ukuran binary per target di ringkasan; kegagalan embed (aset hilang) terdeteksi smoke test (halaman SPA gagal berarti gagal).
- [**AC-7**](test.md#ac-7): dokumentasi singkat cara menjalankan tiap platform (file README rilis) dihasilkan bersama artefak (FR-RUN-02 "dokumentasi cara menjalankan").

## Options considered

### Option 1: Bun Compile per target dengan smoke harness HTTP (dipilih)

**Pros**:
- Sesuai keputusan struktur.md (CLI adalah satu satunya entrypoint compile); smoke lewat HTTP menguji persis yang user alami.

**Cons**:
- Cross compile membatasi smoke test ke runner yang tersedia; dinyatakan jujur di ringkasan rilis.

### Option 2: Distribusi sebagai skrip plus runtime Bun

**Pros**:
- Build sederhana.

**Cons**:
- Melanggar janji inti produk (single executable, FR-RUN-03).

## Decision

**Chosen option**: Option 1: pipeline build web → embed → compile lima target → checksum → smoke, dirangkai `release.yml` dengan gerbang kualitas penuh.

## Rationale

Kredibilitas produk single binary ditentukan di sini: embed yang gagal atau shutdown yang kotor akan menjadi kesan pertama pengguna. Smoke test dibuat lewat permukaan publik (HTTP dan proses) bukan internal, supaya ia tetap valid apa pun refactor di dalam. Keterbatasan runner untuk sebagian target diperlakukan sebagai fakta yang dilaporkan, bukan disembunyikan, sesuai bahasa NFR-05.

## Feature design

**Data model sketch**: tidak ada; artefak build.

**API surface**: tidak menambah endpoint.

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| versi binary | string | tag git plus commit hash di inject build |
| manifest aset | daftar file | hasil build Angular |
| checksum | SHA-256 | artefak final |
| target smoke | daftar | ketersediaan runner CI |

**Key invariants**:
- Artefak rilis hanya lahir dari `release.yml` dengan semua gerbang hijau.
- Binary tidak membaca file luar untuk aset web di mode release (embed penuh).
- Smoke test memakai binary artefak persis yang akan dirilis, bukan build lain.

**Security model**: tidak ada secret di artefak; checksum melindungi integritas unduhan; signing di spec 0055.

**Configuration required**: tidak ada baru.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. Tulis `build-web.ts` dan `embed-web-assets.ts` (manifest bertipe, MIME, hash) plus jalur penyajian release, memenuhi **AC-1**.
2. Tulis `compile-binary.ts` lima target dengan injeksi versi, memenuhi **AC-2**.
3. Tulis `checksums.ts` dan pin toolchain, memenuhi **AC-3**.
4. Bangun harness smoke (proses nyata, data dir sementara, urutan Definition of Done butir 4, database test untuk langkah koneksi), memenuhi **AC-4**.
5. Rakit `release.yml` dengan gerbang dan matriks runner, laporan ukuran, README rilis, memenuhi **AC-5**, **AC-6**, **AC-7**.

## Consequences

**Positive**:
- Janji utama produk (unduh, jalankan) terverifikasi otomatis di setiap rilis.

**Negative / tradeoffs**:
- Target tanpa runner (linux-arm64, windows di sebagian setup CI) hanya terkompilasi, tidak ter smoke; dilaporkan jujur dan diuji manual saat rilis awal.

**Neutral**:
- Kandidat pembundelan native tool backup dievaluasi di spec 0055, bukan di sini.

## Follow-up

- [ ] Spec 0055: signing, installer, service file, dan dokumentasi operator di atas artefak ini.

## References

**Project sources**:
- v1-feature-specification.md FR-RUN-02, FR-RUN-03, NFR-05, Definition of Done butir 4; struktur.md bagian 6 (build release); spec 0006, 0053.

**Practices & standards**:
- Smoke test lewat permukaan publik; gerbang rilis berlapis; checksum artefak.

**Links**: tidak ada yang diverifikasi untuk spec ini.
