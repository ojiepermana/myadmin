# Test dan acceptance criteria 0003. Struktur kontrak OpenAPI v1 dan error model

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Belum dijalankan
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0003.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

`packages/api-contract/openapi/v1/openapi.yaml` valid OpenAPI 3.1, terpecah ke `paths/*.yaml` dan `components/`, dan dapat dibundel menjadi satu dokumen.

### AC-2

`scripts/validate-contract` gagal bila kontrak tidak valid atau melanggar aturan lint kontrak; berjalan di CI.

### AC-3

schema `ApiError` tunggal dipakai semua response error: `code` (string stabil untuk mesin), `message` (aman, tanpa secret), `correlationId`, `details` opsional; response error di seluruh path mereferensikan schema ini.

### AC-4

security scheme `sessionCookie` (apiKey in cookie) terdefinisi dan menjadi default semua operasi; hanya operasi yang ditandai publik yang bebas darinya (`/health`, `/setup/status`, `/setup/admin`, `/auth/login`).

### AC-5

komponen pagination baku terdefinisi: parameter `page`, `pageSize` (batas maksimum dinyatakan), response envelope `items`, `page`, `pageSize`, `total` yang bisa bernilai perkiraan atau null.

### AC-6

schema `Capability` sesuai contoh v1-feature-specification bagian 7.6: `engine`, `version`, `capabilities` peta boolean, plus perluasan opsional `reasons` peta string untuk pesan ketidaktersediaan.

### AC-7

`events/websocket-protocol.yaml` mendefinisikan envelope pesan `{ type, channel, payload, correlationId }` dan `events/websocket-events.yaml` mendefinisikan event awal: `job.progress`, `job.state`, `connection.status`, `query.execution`.

### AC-8

path awal terdefinisi lengkap dengan request, response, dan error: `GET /health`, `GET /setup/status`, `POST /setup/admin`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`.

## Matriks cakupan

| AC | Unit | Integration | Contract | E2E | Security | Performance | Visual | Smoke | Manual atau external |
|---|---|---|---|---|---|---|---|---|---|
| [AC-1](#ac-1) | n/a | n/a | `CT-0003-AC1` | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-2](#ac-2) | n/a | n/a | `CT-0003-AC2` | n/a | n/a | n/a | n/a | `SMOKE-0003-AC2` | n/a |
| [AC-3](#ac-3) | n/a | n/a | `CT-0003-AC3` | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-4](#ac-4) | n/a | n/a | `CT-0003-AC4` | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-5](#ac-5) | n/a | n/a | `CT-0003-AC5` | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-6](#ac-6) | n/a | n/a | `CT-0003-AC6` | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-7](#ac-7) | n/a | n/a | `CT-0003-AC7` | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-8](#ac-8) | n/a | n/a | `CT-0003-AC8` | n/a | n/a | n/a | n/a | n/a | n/a |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

Tidak ada unit yang diwajibkan oleh acceptance criteria saat ini.

## Integration test

Tidak ada integration yang diwajibkan oleh acceptance criteria saat ini.

## Test tambahan

### Contract test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `CT-0003-AC1` | [AC-1](#ac-1) | packages/api-contract/openapi/v1/openapi.yaml valid OpenAPI 3.1, terpecah ke paths/.yaml dan components/, dan dapat dibundel menjadi satu dokumen. | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `CT-0003-AC2` | [AC-2](#ac-2) | scripts/validate-contract gagal bila kontrak tidak valid atau melanggar aturan lint kontrak; berjalan di CI. | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `CT-0003-AC3` | [AC-3](#ac-3) | schema ApiError tunggal dipakai semua response error: code (string stabil untuk mesin), message (aman, tanpa secret), correlationId, details opsional; respon... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `CT-0003-AC4` | [AC-4](#ac-4) | security scheme sessionCookie (apiKey in cookie) terdefinisi dan menjadi default semua operasi; hanya operasi yang ditandai publik yang bebas darinya (/healt... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `CT-0003-AC5` | [AC-5](#ac-5) | komponen pagination baku terdefinisi: parameter page, pageSize (batas maksimum dinyatakan), response envelope items, page, pageSize, total yang bisa bernilai... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `CT-0003-AC6` | [AC-6](#ac-6) | schema Capability sesuai contoh v1-feature-specification bagian 7.6: engine, version, capabilities peta boolean, plus perluasan opsional reasons peta string... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `CT-0003-AC7` | [AC-7](#ac-7) | events/websocket-protocol.yaml mendefinisikan envelope pesan { type, channel, payload, correlationId } dan events/websocket-events.yaml mendefinisikan event... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |
| `CT-0003-AC8` | [AC-8](#ac-8) | path awal terdefinisi lengkap dengan request, response, dan error: GET /health, GET /setup/status, POST /setup/admin, POST /auth/login, POST /auth/logout, GE... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

### E2E

Tidak ada e2e yang diwajibkan oleh acceptance criteria saat ini.

### Security

Tidak ada security yang diwajibkan oleh acceptance criteria saat ini.

### Performance

Tidak ada performance yang diwajibkan oleh acceptance criteria saat ini.

### Visual dan accessibility

Tidak ada visual dan accessibility yang diwajibkan oleh acceptance criteria saat ini.

### Smoke dan operational acceptance

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `SMOKE-0003-AC2` | [AC-2](#ac-2) | scripts/validate-contract gagal bila kontrak tidak valid atau melanggar aturan lint kontrak; berjalan di CI. | Jalankan artefak atau workflow pada environment bersih dan simpan bukti operasional. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |

### Manual atau external proof

Tidak ada manual atau external yang diwajibkan oleh acceptance criteria saat ini.

## Critical test scenarios

- Happy path: kontrak lulus lint dan bundel; CI hijau, verifikasi **AC-1**, **AC-2**.
- Failure case: menambah response error yang tidak memakai `ApiError` membuat lint kontrak gagal, verifikasi **AC-3**.
- Kelengkapan: enam path awal punya request, response sukses, dan error terdefinisi, verifikasi **AC-8**.

## Staged, environment, dan external proof

Tidak ada staged, environment, atau external proof khusus yang sudah diidentifikasi.

## Fixture dan environment

| Area | Aturan |
|---|---|
| Data | Gunakan data sintetis atau tersanitasi. Jangan memakai credential, token, atau data produksi nyata. |
| Resource | Database, file, port, process, dan container harus disposable serta memiliki cleanup deterministik. |
| Version | Pin versi environment yang dibuktikan. Jangan memakai label dinamis seperti `latest` sebagai bukti acceptance. |
| Root command | Instalasi dan command test selalu dimulai dari akar repo dan satu `package.json`. |

## Exit criteria test

- Setiap AC memiliki test ID atau jalur proof yang eksplisit pada [verify.md](verify.md).
- Unit dan integration test yang relevan diimplementasikan, lulus, dan dapat diulang dari checkout bersih.
- Test yang tidak relevan ditandai `n/a` dengan alasan yang tetap benar setelah implementasi.
- External proof tidak boleh diganti local smoke test. Staged proof tidak boleh ditutup sebelum dependency yang disebut tersedia.
- Tidak ada test yang dianggap lulus hanya karena file atau placeholder tersedia.
