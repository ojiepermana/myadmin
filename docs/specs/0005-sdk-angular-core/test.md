# Test dan acceptance criteria 0005. SDK Angular core

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Dijalankan 2026-08-29 melalui `bun run test`; 555 pass, 8 skip karena fixture database, 0 fail pada checkout setelah perubahan audit.
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0005.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

SDK mengekspos client bertipe per domain kontrak (mulai dari `setup`, `auth`, `health`) yang tipenya diimpor dari `@myadmin/api-contract` generated; tidak ada tipe request/response yang ditulis ulang manual.

### AC-2

`provideMyadminSdk(config)` mendaftarkan SDK lewat dependency injection Angular dengan konfigurasi base URL relatif (default `/api/v1`) dan tanpa nilai rahasia.

### AC-3

semua kegagalan HTTP dinormalisasi menjadi `SdkError { code, message, correlationId, status, details? }` yang dipetakan dari `ApiError`; kegagalan jaringan tanpa response menghasilkan kode `NETWORK_ERROR`.

### AC-4

response 401 di endpoint non publik memicu event `sessionExpired` yang bisa disubscribe (dipakai guard/interceptor di spec 0017); SDK sendiri tidak melakukan redirect.

### AC-5

transport memakai infrastruktur yang disediakan @ojiepermana/angular bila kapabilitasnya tersedia; tidak ada `fetch` atau `HttpClient` telanjang di luar folder `transport/`.

### AC-6

boundary check (spec 0002) menolak import `HttpClient`/`fetch` dan literal string berawalan `/api` di `apps/web` di luar `@myadmin/sdk-angular`.

### AC-7

folder `realtime/` ada sebagai kerangka dengan antarmuka publik `RealtimeClient` yang belum berimplementasi (diisi spec 0029) tanpa mengekspos detail transport.

### AC-8

unit test SDK menutup pemetaan error, konfigurasi provider, dan satu panggilan happy path dengan HTTP di mock.

## Matriks cakupan

| AC            | Unit          | Integration   | Contract      | E2E | Security | Performance | Visual | Smoke | Manual atau external |
| ------------- | ------------- | ------------- | ------------- | --- | -------- | ----------- | ------ | ----- | -------------------- |
| [AC-1](#ac-1) | n/a           | n/a           | `CT-0005-AC1` | n/a | n/a      | n/a         | n/a    | n/a   | n/a                  |
| [AC-2](#ac-2) | `UT-0005-AC2` | n/a           | n/a           | n/a | n/a      | n/a         | n/a    | n/a   | n/a                  |
| [AC-3](#ac-3) | `UT-0005-AC3` | n/a           | n/a           | n/a | n/a      | n/a         | n/a    | n/a   | n/a                  |
| [AC-4](#ac-4) | `UT-0005-AC4` | n/a           | n/a           | n/a | n/a      | n/a         | n/a    | n/a   | n/a                  |
| [AC-5](#ac-5) | n/a           | `IT-0005-AC5` | n/a           | n/a | n/a      | n/a         | n/a    | n/a   | n/a                  |
| [AC-6](#ac-6) | n/a           | `IT-0005-AC6` | n/a           | n/a | n/a      | n/a         | n/a    | n/a   | n/a                  |
| [AC-7](#ac-7) | n/a           | n/a           | `CT-0005-AC7` | n/a | n/a      | n/a         | n/a    | n/a   | n/a                  |
| [AC-8](#ac-8) | `UT-0005-AC8` | n/a           | n/a           | n/a | n/a      | n/a         | n/a    | n/a   | n/a                  |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

| ID            | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                                       | Expected result                                      |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `UT-0005-AC2` | [AC-2](#ac-2) | provideMyadminSdk(config) mendaftarkan SDK lewat dependency injection Angular dengan konfigurasi base URL relatif (default /api/v1) dan tanpa nilai rahasia.     | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `UT-0005-AC3` | [AC-3](#ac-3) | semua kegagalan HTTP dinormalisasi menjadi SdkError { code, message, correlationId, status, details? } yang dipetakan dari ApiError; kegagalan jaringan tanpa... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `UT-0005-AC4` | [AC-4](#ac-4) | response 401 di endpoint non publik memicu event sessionExpired yang bisa disubscribe (dipakai guard/interceptor di spec 0017); SDK sendiri tidak melakukan r... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `UT-0005-AC8` | [AC-8](#ac-8) | unit test SDK menutup pemetaan error, konfigurasi provider, dan satu panggilan happy path dengan HTTP di mock.                                                   | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

## Integration test

| ID            | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                         | Expected result                                      |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `IT-0005-AC5` | [AC-5](#ac-5) | transport memakai infrastruktur yang disediakan @ojiepermana/angular bila kapabilitasnya tersedia; tidak ada fetch atau HttpClient telanjang di luar folder t... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `IT-0005-AC6` | [AC-6](#ac-6) | boundary check (spec 0002) menolak import HttpClient/fetch dan literal string berawalan /api di apps/web di luar @myadmin/sdk-angular.                           | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

## Test tambahan

### Contract test

| ID            | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                          | Expected result                                      |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `CT-0005-AC1` | [AC-1](#ac-1) | SDK mengekspos client bertipe per domain kontrak (mulai dari setup, auth, health) yang tipenya diimpor dari @myadmin/api-contract generated; tidak ada tipe r... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `CT-0005-AC7` | [AC-7](#ac-7) | folder realtime/ ada sebagai kerangka dengan antarmuka publik RealtimeClient yang belum berimplementasi (diisi spec 0029) tanpa mengekspos detail transport.     | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

### E2E

Tidak ada e2e yang diwajibkan oleh acceptance criteria saat ini.

### Security

Tidak ada security yang diwajibkan oleh acceptance criteria saat ini.

### Performance

Tidak ada performance yang diwajibkan oleh acceptance criteria saat ini.

### Visual dan accessibility

Tidak ada visual dan accessibility yang diwajibkan oleh acceptance criteria saat ini.

### Smoke dan operational acceptance

Tidak ada smoke dan operational yang diwajibkan oleh acceptance criteria saat ini.

### Manual atau external proof

Tidak ada manual atau external yang diwajibkan oleh acceptance criteria saat ini.

## Critical test scenarios

- Happy path: `auth.login` sukses mengembalikan tipe user dari kontrak, verifikasi **AC-1**, **AC-2**.
- Failure case: server membalas `ApiError` 401 → `SdkError` berkode benar dan event `sessionExpired` terpancar, verifikasi **AC-3**, **AC-4**.
- Boundary: PR yang menambah `HttpClient` di feature gagal di lint/boundary, verifikasi **AC-6**.

## Staged, environment, dan external proof

Tidak ada staged, environment, atau external proof khusus yang sudah diidentifikasi.

## Fixture dan environment

| Area         | Aturan                                                                                                         |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| Data         | Gunakan data sintetis atau tersanitasi. Jangan memakai credential, token, atau data produksi nyata.            |
| Resource     | Database, file, port, process, dan container harus disposable serta memiliki cleanup deterministik.            |
| Version      | Pin versi environment yang dibuktikan. Jangan memakai label dinamis seperti `latest` sebagai bukti acceptance. |
| Root command | Instalasi dan command test selalu dimulai dari akar repo dan satu `package.json`.                              |

## Exit criteria test

- Setiap AC memiliki test ID atau jalur proof yang eksplisit pada [verify.md](verify.md).
- Unit dan integration test yang relevan diimplementasikan, lulus, dan dapat diulang dari checkout bersih.
- Test yang tidak relevan ditandai `n/a` dengan alasan yang tetap benar setelah implementasi.
- External proof tidak boleh diganti local smoke test. Staged proof tidak boleh ditutup sebelum dependency yang disebut tersedia.
- Tidak ada test yang dianggap lulus hanya karena file atau placeholder tersedia.
