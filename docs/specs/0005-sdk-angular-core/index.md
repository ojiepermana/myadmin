# 0005. SDK Angular core

**Date**: 2026-08-28
**Status**: Proposed
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini membangun `@myadmin/sdk-angular`, satu satunya jalur aplikasi Angular menuju API Myadmin. Isinya lapisan transport tipis di atas infrastruktur @ojiepermana/angular, provider konfigurasi, pemetaan error ke satu bentuk, dan client bertipe yang dibangun dari tipe generated spec 0004. Setelah spec ini, tidak ada alasan bagi feature Angular untuk menyentuh HttpClient atau string endpoint.

## Context

Aturan yang dikunci: component → facade/store → SDK adalah satu satunya jalur network (FR-UI-04, struktur.md bagian 4.2), dan `transport/` SDK mengadaptasi infrastruktur SDK yang disediakan @ojiepermana/angular. Tanpa SDK yang enak dipakai sejak awal, feature pertama (initial setup, login) akan tergoda memanggil HTTP langsung dan pola itu menular. Klien realtime WebSocket menyusul di spec 0029; spec ini menyiapkan tempatnya saja.

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0004. Terkait: spec 0014 (paket UI dipasang di sana; SDK hanya memakai bagian infrastruktur non visualnya).

## Requirements

**User stories**:
- Sebagai developer feature Angular, saya ingin memanggil `sdk.auth.login(...)` yang bertipe penuh supaya salah bentuk request tertangkap compile time.
- Sebagai developer, saya ingin semua kegagalan API tiba sebagai satu bentuk error supaya penanganan di UI seragam.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): SDK mengekspos client bertipe per domain kontrak (mulai dari `setup`, `auth`, `health`) yang tipenya diimpor dari `@myadmin/api-contract` generated; tidak ada tipe request/response yang ditulis ulang manual.
- [**AC-2**](test.md#ac-2): `provideMyadminSdk(config)` mendaftarkan SDK lewat dependency injection Angular dengan konfigurasi base URL relatif (default `/api/v1`) dan tanpa nilai rahasia.
- [**AC-3**](test.md#ac-3): semua kegagalan HTTP dinormalisasi menjadi `SdkError { code, message, correlationId, status, details? }` yang dipetakan dari `ApiError`; kegagalan jaringan tanpa response menghasilkan kode `NETWORK_ERROR`.
- [**AC-4**](test.md#ac-4): response 401 di endpoint non publik memicu event `sessionExpired` yang bisa disubscribe (dipakai guard/interceptor di spec 0017); SDK sendiri tidak melakukan redirect.
- [**AC-5**](test.md#ac-5): transport memakai infrastruktur yang disediakan @ojiepermana/angular bila kapabilitasnya tersedia; tidak ada `fetch` atau `HttpClient` telanjang di luar folder `transport/`.
- [**AC-6**](test.md#ac-6): boundary check (spec 0002) menolak import `HttpClient`/`fetch` dan literal string berawalan `/api` di `apps/web` di luar `@myadmin/sdk-angular`.
- [**AC-7**](test.md#ac-7): folder `realtime/` ada sebagai kerangka dengan antarmuka publik `RealtimeClient` yang belum berimplementasi (diisi spec 0029) tanpa mengekspos detail transport.
- [**AC-8**](test.md#ac-8): unit test SDK menutup pemetaan error, konfigurasi provider, dan satu panggilan happy path dengan HTTP di mock.

## Options considered

### Option 1: SDK tipis tulisan tangan di atas tipe generated (dipilih)

**Pros**:
- Bentuk facade, penamaan, dan integrasi @ojiepermana/angular sepenuhnya dikendalikan; permukaan kecil dan mudah diaudit.

**Cons**:
- Setiap domain endpoint baru butuh beberapa baris client tulisan tangan (bertipe, jadi murah).

### Option 2: Client digenerate penuh dari kontrak

**Pros**:
- Nol tulisan tangan per endpoint.

**Cons**:
- Sudah ditolak di sesi desain: bentuk client mengikuti generator, adaptasi transport dan realtime custom jadi kaku.

## Decision

**Chosen option**: Option 1: SDK tipis tulisan tangan di atas tipe generated.

`@myadmin/sdk-angular` berisi `transport/` (adapter ke infrastruktur @ojiepermana/angular), `providers/`, `facades/` client per domain, `realtime/` kerangka, dan `public-api.ts`; tipe dari `@myadmin/api-contract` (basis: struktur.md bagian pohon sdk-angular dan aturan 4.2; keputusan codegen sesi desain 2026-08-28).

**Implementation skills**: `angular-developer` (level user) untuk konvensi provider dan dependency injection Angular.

## Rationale

SDK adalah titik cekik (choke point) yang membuat aturan "tidak ada raw fetch" bisa ditegakkan: satu tempat untuk auth behavior, error shape, dan nanti realtime. Menulisnya tipis di atas tipe generated memberi jaminan tipe dari kontrak tanpa kehilangan kendali atas integrasi @ojiepermana/angular, kekhawatiran yang membuat generator penuh ditolak. Event `sessionExpired` dipilih daripada redirect di dalam SDK supaya SDK bebas dari kebijakan routing aplikasi.

## Feature design

**Data model sketch**: tidak ada entity persisten. Bentuk publik utama: `SdkError`, `MyadminSdkConfig { baseUrl }`, client per domain.

**API surface**: tidak menambah endpoint; membungkus endpoint spec 0003.

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| setiap panggilan | correlationId pada error | field `ApiError.correlationId` dari server |
| kegagalan jaringan | kode `NETWORK_ERROR` | konstanta SDK, bukan dari server |
| sessionExpired | pemicu | status 401 dari endpoint non publik |
| baseUrl | nilai | `provideMyadminSdk` config, default `/api/v1` |

**Key invariants**:
- Tipe di SDK selalu berasal dari generated; regenerasi kontrak yang mengubah bentuk membuat SDK gagal compile, bukan salah diam diam.
- SDK tidak menyimpan token apa pun; sesi hidup di cookie HttpOnly yang dikelola browser.

**Security model**: SDK berjalan di browser; tidak boleh menerima atau menyimpan secret. Kredensial hanya lewat body request login/setup dan tidak pernah dicatat.

**Configuration required**: tidak ada environment variable; konfigurasi lewat provider Angular.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. Bangun `transport/` yang mengadaptasi infrastruktur request @ojiepermana/angular (fallback ke HttpClient di dalam transport bila kapabilitas tidak tersedia, terisolasi di satu file), memenuhi **AC-5**.
2. Bangun `SdkError` dan mapper dari `ApiError` plus kegagalan jaringan, memenuhi **AC-3**.
3. Bangun `provideMyadminSdk` dan config, memenuhi **AC-2**.
4. Bangun facade client `health`, `setup`, `auth` di atas tipe generated, plus event `sessionExpired`, memenuhi **AC-1**, **AC-4**.
5. Buat kerangka `realtime/` dengan antarmuka `RealtimeClient`, memenuhi **AC-7**.
6. Tambahkan aturan boundary untuk `apps/web` (larangan HttpClient/fetch/string `/api`), memenuhi **AC-6**.
7. Tulis unit test SDK, memenuhi **AC-8**.

## Consequences

**Positive**:
- FR-UI-04 punya penegakan nyata sejak fitur pertama; penanganan error UI seragam.

**Negative / tradeoffs**:
- Setiap domain baru menambah sedikit kode facade tulisan tangan; harga kendali atas bentuk SDK.

**Neutral**:
- Detail integrasi infrastruktur @ojiepermana/angular baru bisa dikunci saat paketnya dipasang (spec 0014); transport dibuat dengan lapisan fallback yang eksplisit.

## Follow-up

- [ ] Setelah spec 0014, audit transport: pastikan kapabilitas infrastruktur @ojiepermana/angular yang tersedia benar benar dipakai dan fallback dilepas bila tidak perlu.

## References

**Project sources**:
- struktur.md bagian packages/sdk-angular dan aturan 4.2; v1-feature-specification.md FR-UI-04.
- Spec 0003, 0004 (bentuk kontrak dan tipe generated).

**Practices & standards**:
- Satu titik cekik untuk network; error dinormalisasi di boundary, bukan di setiap pemakai.

**Links**: tidak ada yang diverifikasi untuk spec ini.
