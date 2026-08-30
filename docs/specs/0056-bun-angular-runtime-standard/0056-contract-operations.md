# 0056. Contract dan operation resource

## Summary

Query dan generic jobs mendapatkan operation resource yang seragam serta contract traceability dari OpenAPI ke Elysia, generated types, SDK, dan event. Perubahan memakai header version dan satu cutover rilis.

## Scope

1. Query execution create, read, cancel, dan explain.
2. Generic jobs list, read, dan cancel.
3. WebSocket query dan generic jobs.
4. OpenAPI, validator, generated contract, route registry, SDK facade, dan idempotency.

## Standard definition

**Canonical pattern**:

```text
OpenAPI v2 operation
        ↓
generated TypeScript types and route registry
        ↓
typed Elysia route module
        ↓
operation service and provider port
        ↓
SDK facade and Angular resource
        ↓
WebSocket event with the same operation shape
```

Operation resource memuat schema lengkap yang didefinisikan di umbrella index, yaitu `id`, `kind`, `jobType`, `state`, `progress`, `createdAt`, `startedAt`, `cancelRequestedAt`, `endedAt`, `updatedAt`, `result`, `error`, `cancellable`, dan `cancel` link bila berlaku. `POST` command yang membuat atau membatalkan kerja menerima `Idempotency-Key`. Header version yang dipakai adalah `X-MyAdmin-API-Version: 2`.

Path v2 mempertahankan path resource yang ada, yaitu `/query/executions`, `/query/executions/{id}`, `/query/executions/{id}/cancel`, `/query/explain`, `/jobs`, `/jobs/{id}`, dan `/jobs/{id}/cancel`. Tidak dibuat alias `/operations` karena header version sudah menjadi pemilih kontrak.

Header adalah satu satunya pemilih kontrak. Segmen `v1` pada base path `/api/v1` dibekukan sebagai base path dan tidak berubah pada cutover ini; ia bukan penanda versi kontrak. Tujuan header setelah cutover: menolak SPA basi dari rilis lama dengan error yang jelas. Keputusan dan alternatif yang ditolak tercatat pada bagian API migration boundary di [index.md](index.md) dan pada [rationale.md](rationale.md).

Pekerjaan awal sebelum menyentuh v2: perbaiki penyimpangan v1 yang sudah diketahui pada permukaan yang akan dimigrasikan, minimal nama parameter `pageSize` versus `page-size` pada `/jobs` (server, SDK, test). Cutover tidak boleh menjadi alasan membiarkan bug kontrak v1 hidup selama masa persiapan.

`POST /query/explain` tetap sinkron. Ia mengembalikan `planText`, `engine`, dan `durationMs` sesuai spec 0035, tidak menjadi operation, tidak menerima cancel link, dan tidak memakai idempotency record.

### Idempotency contract

`Idempotency-Key` wajib pada command yang membuat query execution serta command cancel v2. Record disimpan dalam memory proses selama satu jam setelah response atau state terminal. Scope key adalah actor user id, method, path, API version, dan hash body yang sudah dinormalisasi. Key yang sama dengan body berbeda menghasilkan `409 IDEMPOTENCY_KEY_REUSED`. Retry yang sama mengembalikan operation atau snapshot yang sama. Record hilang saat restart, selaras dengan job memory model spec 0028.

### Retention and restart matrix

| Kind              | Active state                              | Terminal retention               | Restart outcome                             |
| ----------------- | ----------------------------------------- | -------------------------------- | ------------------------------------------- |
| `query-execution` | Sampai provider menetapkan terminal state | Satu jam                         | `404 OPERATION_RESTARTED` dengan pesan aman |
| `job`             | Mengikuti JobManager spec 0028            | Satu jam                         | `404 OPERATION_RESTARTED` dengan pesan aman |
| `query-explain`   | Tidak applicable, sinkron                 | Tidak disimpan sebagai operation | Error response normal sesuai spec 0035      |

### WebSocket version contract

Subscribe v2 membawa `version: 2` pada handshake atau command subscribe. Server mengikat connection dan channel ke version itu. Setiap event v2 membawa `version: 2` pada envelope dan payload operation yang sama dengan HTTP. Reconnect wajib mengulang version. Version mismatch atau version tidak didukung ditolak, dan server tidak mengirim event v1 pada connection v2.

Tanpa header, contract lama berlaku selama periode persiapan. Nilai header tidak dikenal ditolak. Pada cutover, seluruh client internal memakai v2, v1 dihapus, dan header v2 menjadi wajib pada endpoint yang dimigrasikan.

**Replaces**:

1. Route path, schema, SDK method, dan event yang memiliki bentuk state berbeda tanpa registry.
2. Response command yang hanya mengembalikan id lalu membuat caller menebak lifecycle.
3. Cancel yang tidak idempotent atau tidak menjelaskan race dengan terminal state.
4. `request.json()` dan parameter cast manual ketika schema TypeBox dapat menjadi sumber validasi.

**Enforcement**:

1. OpenAPI v2 menjadi source of truth.
2. Generated types tidak diedit manual.
3. Validator registry memeriksa path, method, nama query parameter, schema requestBody, schema response per status, version header, dan event mapping. Nama parameter termasuk yang diperiksa karena drift nama (`pageSize` versus `page-size`) pernah lolos ketika hanya path dan method yang dibandingkan.
4. Contract test v1 dan v2 berjalan sebelum cutover. Setelah cutover, test v1 disimpan sebagai negative compatibility test sampai keputusan retirement diselesaikan.
5. SDK facade mengirim header dan idempotency key, sedangkan component tidak mengetahui URL.
6. WebSocket protocol test memeriksa version pada subscribe, reconnect, event envelope, dan mismatch rejection.

**Rollout**:

Inventaris client, tambahkan v2 contract dan adapter, implementasikan operation resource pada query serta jobs, migrasikan SDK dan Angular, jalankan dua versi test, lalu cutover satu rilis. Rollback memakai artefak sebelumnya.

**Exceptions**:

Endpoint di luar query dan generic jobs tidak dirombak oleh child ini. Ia hanya menerima operation, observability, cancellation, dan boundary standard dari child terkait. Perubahan payload mereka kembali ke spec feature masing masing.

## Security model

Hanya owner yang dapat membaca atau membatalkan operation. Admin audit mengamati metadata melalui audit admin dan tidak mendapat endpoint override. Session cookie dan CSRF tetap berlaku. Operation resource, error, event, serta log tidak boleh memuat SQL rahasia, credential, token, parameter sensitif, atau isi data. Command dan hasil akhir diaudit dengan actor, target, version header, dan correlation id setelah redaction.

## Rationale

Operation resource menyatukan state query dan job tanpa memaksa import, export, backup, dan restore ikut berubah. Header eksplisit membuat cutover dapat dilihat di log serta contract test. Idempotency key dan state terminal yang jujur mencegah retry atau race menghasilkan operation palsu.
