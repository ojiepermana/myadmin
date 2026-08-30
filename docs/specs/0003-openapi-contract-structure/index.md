# 0003. Struktur kontrak OpenAPI v1 dan error model

**Date**: 2026-08-28
**Status**: Accepted
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini mendirikan sumber kebenaran API: berkas OpenAPI v1 multi file di `packages/api-contract`, model error tunggal untuk semua endpoint, security scheme session cookie, komponen pagination, schema capability, dan skema event WebSocket. Setiap endpoint yang lahir setelah ini wajib dimulai dari kontrak, bukan dari kode server atau frontend.

## Context

Aturan API first sudah dikunci (struktur.md bagian 4.2, FR-RUN-04): endpoint dimulai dari `packages/api-contract`, SDK dihasilkan dari kontrak, dan tidak ada endpoint yang hanya ada di controller atau frontend. Yang belum diputuskan adalah bentuk konkret kontraknya: bagaimana file dipecah, seperti apa model error yang seragam, bagaimana sesi dinyatakan di kontrak, dan bagaimana event WebSocket didefinisikan supaya klien dan server tidak menebak. Tanpa bentuk baku ini, setiap spec fitur akan menciptakan polanya sendiri.

Ada ketegangan yang perlu dinyatakan: Elysia menghasilkan OpenAPI dari kode (code first), sedangkan arsitektur ini contract first. Resolusinya: `openapi.yaml` yang ditulis tangan adalah satu satunya sumber kebenaran; kesesuaian server terhadap kontrak dibuktikan contract test (spec 0004), dan generator OpenAPI bawaan Elysia tidak dipakai sebagai sumber.

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0001.

## Requirements

**User stories**:

- Sebagai developer server atau web, saya ingin satu definisi endpoint bertipe supaya request dan response tidak ditulis dua kali.
- Sebagai integrator, saya ingin semua error berbentuk sama supaya penanganan error cukup ditulis sekali.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): `packages/api-contract/openapi/v1/openapi.yaml` valid OpenAPI 3.1, terpecah ke `paths/*.yaml` dan `components/`, dan dapat dibundel menjadi satu dokumen.
- [**AC-2**](test.md#ac-2): `scripts/validate-contract` gagal bila kontrak tidak valid atau melanggar aturan lint kontrak; berjalan di CI.
- [**AC-3**](test.md#ac-3): schema `ApiError` tunggal dipakai semua response error: `code` (string stabil untuk mesin), `message` (aman, tanpa secret), `correlationId`, `details` opsional; response error di seluruh path mereferensikan schema ini.
- [**AC-4**](test.md#ac-4): security scheme `sessionCookie` (apiKey in cookie) terdefinisi dan menjadi default semua operasi; hanya operasi yang ditandai publik yang bebas darinya (`/health`, `/setup/status`, `/setup/admin`, `/auth/login`).
- [**AC-5**](test.md#ac-5): komponen pagination baku terdefinisi: parameter `page`, `pageSize` (batas maksimum dinyatakan), response envelope `items`, `page`, `pageSize`, `total` yang bisa bernilai perkiraan atau null.
- [**AC-6**](test.md#ac-6): schema `Capability` sesuai contoh v1-feature-specification bagian 7.6: `engine`, `version`, `capabilities` peta boolean, plus perluasan opsional `reasons` peta string untuk pesan ketidaktersediaan.
- [**AC-7**](test.md#ac-7): `events/websocket-protocol.yaml` mendefinisikan envelope pesan `{ type, channel, payload, correlationId }` dan `events/websocket-events.yaml` mendefinisikan event awal: `job.progress`, `job.state`, `connection.status`, `query.execution`.
- [**AC-8**](test.md#ac-8): path awal terdefinisi lengkap dengan request, response, dan error: `GET /health`, `GET /setup/status`, `POST /setup/admin`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`.

## Options considered

### Option 1: Redocly CLI untuk lint dan bundel (dipilih)

**Pros**:

- Satu alat untuk lint aturan kontrak dan bundel multi file menjadi satu dokumen; dukungan OpenAPI 3.1 baik.

**Cons**:

- Aturan lint bawaannya opinionated; perlu menonaktifkan beberapa aturan yang tidak relevan.

### Option 2: Spectral untuk lint plus bundler terpisah

**Pros**:

- Aturan lint sangat bisa dikustom.

**Cons**:

- Dua alat untuk pekerjaan yang Redocly selesaikan sendiri.

### Option 3: Error model RFC 7807 (application/problem+json)

Dipertimbangkan untuk bentuk `ApiError`.

**Pros**:

- Standar IETF yang dikenal luas.

**Cons**:

- Field `type`/`instance` berbasis URI tidak memberi nilai untuk aplikasi self hosted satu binary; kebutuhan proyek (kode stabil, correlation ID, redaction) lebih langsung dipenuhi envelope sendiri yang lebih kecil.

## Decision

**Chosen option**: Option 1 (Redocly CLI) dengan error envelope sendiri dari Option 3 yang ditolak.

Kontrak OpenAPI 3.1 multi file dengan Redocly CLI sebagai validator dan bundler; error model envelope `ApiError` sendiri; sesi dinyatakan sebagai cookie security scheme; event WebSocket didefinisikan sebagai dokumen schema terpisah di `events/` (basis: FR-OPS-02 menuntut `code`, `correlationId`, dan pesan aman; struktur.md sudah menetapkan letak file).

## Rationale

Contract first hanya bekerja kalau kontraknya tervalidasi dan terbundel secara mekanis; Redocly memberi keduanya dengan satu alat. Error envelope sendiri dipilih karena kebutuhan proyek sudah didefinisikan persis di FR-OPS-02 dan bagian 8 (kode stabil, correlation, tanpa secret), dan setiap field tambahan RFC 7807 akan menjadi beban tipe di SDK tanpa pemakai. Ketegangan Elysia code first diselesaikan dengan menjadikan kontrak tulisan tangan sebagai sumber dan menguji kesesuaian, bukan dengan membalik arah generasinya.

## Feature design

**Data model sketch**: tidak ada entity persisten; artefak berupa dokumen kontrak.

Bentuk `ApiError`:

```yaml
ApiError:
  type: object
  required: [code, message, correlationId]
  properties:
    code: { type: string, description: kode stabil, contoh AUTH_INVALID_CREDENTIALS }
    message: { type: string, description: pesan aman untuk manusia, tanpa secret }
    correlationId: { type: string }
    details:
      { type: object, additionalProperties: true, description: data terstruktur aman, opsional }
```

**API surface** (path awal yang didefinisikan spec ini; perilakunya dibangun di spec 0016 dan 0017):

| Endpoint      | Method | Key inputs         | Key outputs          | Auth                 | Key errors                              |
| ------------- | ------ | ------------------ | -------------------- | -------------------- | --------------------------------------- |
| /health       | GET    | tidak ada          | status, version      | publik               | 503                                     |
| /setup/status | GET    | tidak ada          | initialized: boolean | publik               | tidak ada                               |
| /setup/admin  | POST   | username, password | user                 | publik               | 409 sudah terinisialisasi, 422 validasi |
| /auth/login   | POST   | username, password | user                 | publik, rate limited | 401 kredensial salah, 429               |
| /auth/logout  | POST   | tidak ada          | kosong               | sessionCookie        | 401                                     |
| /auth/me      | GET    | tidak ada          | user, role           | sessionCookie        | 401                                     |

**Value sourcing**:

| Action             | Value produced / displayed   | Source                                                   |
| ------------------ | ---------------------------- | -------------------------------------------------------- |
| semua error        | correlationId                | dihasilkan middleware server per request (spec 0013)     |
| respons capability | reasons per capability false | provider (spec 0022, 0024), diteruskan apa adanya        |
| pagination         | total                        | provider atau repository; boleh null bila mahal dihitung |

**Key invariants**:

- Semua response non 2xx di kontrak wajib bertipe `ApiError`; contract lint punya aturan yang menegakkannya.
- Prefix path runtime adalah `/api/v1` (dinyatakan lewat `servers` di kontrak); kontrak sendiri menulis path tanpa prefix.
- File `src/generated/` tidak pernah diedit manual.

**Security model**: dokumen kontrak bersifat publik di repo; tidak boleh memuat contoh berisi kredensial nyata. Operasi default membutuhkan `sessionCookie`.

**Configuration required**: tidak ada.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. [x] Buat kerangka `openapi/v1/openapi.yaml` (info, servers `/api/v1`, security default `sessionCookie`) plus `components/` berisi `ApiError`, pagination, `Capability`, `security-schemes.yaml`, memenuhi **AC-3**, **AC-4**, **AC-5**, **AC-6**.
2. [x] Definisikan enam path awal di `paths/auth.yaml` dan file terkait, memenuhi **AC-8**.
3. [x] Definisikan `events/websocket-protocol.yaml` dan `events/websocket-events.yaml`, memenuhi **AC-7**.
4. [x] Pasang Redocly CLI, konfigurasi aturan lint (termasuk aturan custom "semua error memakai ApiError"), tulis `scripts/validate-contract.ts` dan `packages/api-contract/scripts/validate-contract.ts`, sambungkan ke CI, memenuhi **AC-1**, **AC-2**.

## Consequences

**Positive**:

- Setiap spec fitur tinggal menambah path dan schema pada pola yang sudah pasti; SDK dan server membaca bentuk yang sama.

**Negative / tradeoffs**:

- Menulis kontrak lebih dulu terasa lebih lambat per fitur; ini harga dari tipe yang tidak pernah drift.
- Error envelope sendiri berarti integrator luar tidak mendapat format standar industri; diterima karena API ini untuk SPA sendiri.

**Neutral**:

- Kontrak memakai OpenAPI 3.1; alat hilir (spec 0004) dipilih yang mendukungnya.

## Follow-up

- [ ] Saat fitur bertambah, jaga file `paths/` per domain (auth, connections, explorer, query, operations) sesuai struktur.md.

## References

**Project sources**:

- struktur.md bagian 4.2 (aturan API first) dan pohon `packages/api-contract`.
- v1-feature-specification.md FR-RUN-04, FR-OPS-02, bagian 7.6 (contoh capability), bagian 8 (aturan redaction).

**Practices & standards**:

- Contract first dengan verifikasi kesesuaian lewat test; kode error stabil untuk mesin, pesan untuk manusia.

**Links**: tidak ada yang diverifikasi untuk spec ini.
