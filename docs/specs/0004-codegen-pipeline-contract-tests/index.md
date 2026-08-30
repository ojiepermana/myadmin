# 0004. Pipeline codegen dan contract test

**Date**: 2026-08-28
**Status**: In Progress
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini membangun mesin yang menjaga kontrak, server, dan SDK tetap satu bentuk: generasi tipe TypeScript dari OpenAPI memakai openapi-typescript, skrip generasi ulang yang deterministik, pemeriksaan drift di CI, dan harness contract test yang membuktikan server benar benar mengimplementasikan kontrak. Ini penegak dari janji API first.

## Context

Kontrak (spec 0003) hanya berguna bila ada mesin yang menghukum penyimpangan. Tiga penyimpangan yang harus mustahil: tipe di klien beda dari kontrak, endpoint ada di server tapi tidak di kontrak (atau sebaliknya), dan file generated diedit manual. Keputusan alat codegen sudah diambil di sesi desain: openapi-typescript plus SDK tipis tulisan sendiri, bukan generator client penuh, supaya bentuk facade dan transport bisa menyesuaikan @ojiepermana/angular.

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0003.

## Requirements

**User stories**:

- Sebagai developer, saya ingin tipe request dan response selalu berasal dari kontrak supaya perubahan kontrak langsung terasa sebagai error compile.
- Sebagai reviewer, saya ingin CI gagal bila server dan kontrak tidak cocok.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): `scripts/codegen/generate-contract-types.ts` menghasilkan tipe dari bundel OpenAPI ke `packages/api-contract/src/generated/`; hasilnya deterministik (dua kali generate menghasilkan byte yang sama).
- [**AC-2**](test.md#ac-2): CI menjalankan generate ulang lalu `git diff --exit-code` pada folder generated; drift membuat CI gagal.
- [**AC-3**](test.md#ac-3): harness contract test membuktikan cakupan dua arah: setiap operasi di kontrak punya route terimplementasi di server, dan setiap route terdaftar di server ada di kontrak; ketidakcocokan menyebut operasi yang hilang.
- [**AC-4**](test.md#ac-4): contract test memvalidasi bentuk response nyata server (minimal untuk enam path awal) terhadap schema kontrak; response yang menyimpang membuat test gagal dengan path field yang salah.
- [**AC-5**](test.md#ac-5): request tidak valid ke endpoint mana pun menghasilkan `ApiError` sesuai schema, dibuktikan test.
- [**AC-6**](test.md#ac-6): folder `src/generated/` dilindungi: aturan lint atau CI menolak edit manual (header file generated plus pemeriksaan drift).
- [**AC-7**](test.md#ac-7): workflow CI `contract.yml` menjalankan validasi kontrak (spec 0003), codegen drift, dan contract test.

## Options considered

### Option 1: openapi-typescript plus validator ajv di test (dipilih)

Tipe dari openapi-typescript; contract test mengkompilasi schema dari bundel kontrak dengan ajv dan memvalidasi response nyata.

**Pros**:

- Tipe murni tanpa runtime tambahan di produksi; validasi runtime hanya hidup di test.
- Kontrol penuh bentuk SDK (spec 0005).

**Cons**:

- Harness test ditulis sendiri; generator client penuh memberi ini gratis.

### Option 2: Generator client penuh (@hey-api/openapi-ts atau ng-openapi-gen)

**Pros**:

- Client dan service jadi otomatis.

**Cons**:

- Bentuk client mengikuti generator; adaptasi ke infrastruktur transport @ojiepermana/angular dan realtime custom jadi kaku. Sudah ditolak di sesi desain.

## Decision

**Chosen option**: Option 1: openapi-typescript plus ajv di contract test.

Pipeline: bundel kontrak → openapi-typescript → tipe di `api-contract/src/generated/` → SDK tipis (spec 0005); kesesuaian server dibuktikan contract test dua arah plus validasi response berbasis ajv (basis: keputusan sesi desain 2026-08-28; FR-RUN-04 menuntut server dan SDK lulus contract test).

## Rationale

openapi-typescript menghasilkan tipe yang presisi tanpa memaksakan bentuk client, cocok karena SDK harus menumpang infrastruktur @ojiepermana/angular. Validasi runtime dipindah ke test, bukan produksi, supaya binary tetap ramping; drift tetap mustahil karena CI meregenerasi dan membandingkan byte. Cakupan dua arah dipilih karena kegagalan yang paling mahal adalah endpoint bayangan: ada di server, tidak ada di kontrak, tidak terlihat SDK.

## Feature design

**Data model sketch**: tidak ada entity persisten.

**API surface**: tidak menambah endpoint; menguji yang sudah ada.

**Value sourcing**:

| Action            | Value produced / displayed | Source                                              |
| ----------------- | -------------------------- | --------------------------------------------------- |
| cakupan dua arah  | daftar operasi kontrak     | bundel openapi.yaml (operationId wajib per operasi) |
| cakupan dua arah  | daftar route server        | introspeksi route Elysia saat test boot             |
| validasi response | schema per operasi         | bundel kontrak, dikompilasi ajv                     |

**Key invariants**:

- Setiap operasi kontrak punya `operationId` unik; lint kontrak menegakkannya.
- Tidak ada import dari `src/generated/` yang diedit manual; regenerasi selalu aman.

**Security model**: contract test berjalan terhadap server test tanpa data nyata; fixture tidak berisi kredensial sungguhan.

**Configuration required**: tidak ada.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. [x] Tulis `generate-contract-types.ts` (bundel Redocly → openapi-typescript → generated), pastikan deterministik, memenuhi **AC-1**.
2. [x] Tambah pemeriksaan drift generated ke CI dan header "generated, jangan edit" pada file hasil, memenuhi **AC-2**, **AC-6**.
3. [x] Bangun harness contract test di `tests/contract/`: boot server in memory, introspeksi route, muat operasi kontrak, uji cakupan dua arah, memenuhi **AC-3**.
4. [x] Tambah validasi response berbasis ajv untuk enam path awal plus uji bentuk `ApiError` pada request tidak valid, memenuhi **AC-4**, **AC-5**.
5. [x] Tulis workflow `contract.yml` yang menjalankan validasi kontrak, drift, dan contract test, memenuhi **AC-7**.

## Consequences

**Positive**:

- Drift kontrak menjadi kegagalan CI, bukan temuan produksi; janji Definition of Done butir 3 punya mesinnya.

**Negative / tradeoffs**:

- Harness sendiri berarti biaya perawatan test infrastruktur; dibayar sekali, dipakai semua fitur.

**Neutral**:

- Validasi response per fitur baru cukup mendaftarkan operationId nya ke harness.

## Follow-up

- [ ] Setiap spec fitur berikutnya menambahkan operasinya ke daftar validasi response contract test.

## References

**Project sources**:

- Spec 0003 (bentuk kontrak); struktur.md bagian 4.2 (flow perubahan API); v1-feature-specification.md FR-RUN-04 dan Definition of Done butir 3.

**Practices & standards**:

- Generated code selalu bisa dibuang dan dibuat ulang; pemeriksaan drift byte per byte di CI.

**Links** (terverifikasi web 2026-08-28):

- openapi-typescript v7 aktif: https://www.npmjs.com/package/openapi-typescript
