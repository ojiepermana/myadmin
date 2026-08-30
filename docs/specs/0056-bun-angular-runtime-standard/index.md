# 0056. Standar runtime Bun dan reaktivitas Angular

**Date**: 2026-08-29
**Status**: Accepted

## Structure

1. [0056-bun-sql-cancellation.md](0056-bun-sql-cancellation.md) menetapkan port query Bun SQL dan cancellation sampai provider.
2. [0056-bun-io.md](0056-bun-io.md) menetapkan filesystem, streaming, hashing, dan asset I/O native Bun.
3. [0056-angular-reactivity.md](0056-angular-reactivity.md) menetapkan read model signal first dan gate zoneless Angular (aplikasi sudah berjalan zoneless; child ini meresmikan kebijakannya).
4. [0056-elysia-lifecycle.md](0056-elysia-lifecycle.md) menetapkan komposisi Elysia, ownership lifecycle, dan fixture yang tidak menggandakan assembly.
5. [0056-contract-operations.md](0056-contract-operations.md) menetapkan traceability OpenAPI, kontrak operation, dan cutover API query serta generic jobs.
6. [0056-ui-foundation.md](0056-ui-foundation.md) menetapkan penggunaan @ojiepermana/angular dan aturan untuk capability gap.

## Summary

Spec ini menetapkan satu standar bersama agar implementasi memakai kemampuan native Bun 1.4 dan Angular 22 ketika semantiknya memang setara. Standar ini mencakup runtime database dan filesystem, cancellation, komposisi Elysia, kontrak API, state Angular, zoneless, dan fondasi UI. Penerapannya mengikuti urutan dependency dengan bukti test dan verifikasi per area, bukan rewrite tanpa bukti.

## Requirements

**User stories**:

1. Sebagai developer, saya ingin jalur runtime memiliki port yang typed dan memakai API native yang tepat supaya kode tetap mudah diuji serta tidak menyembunyikan kerja yang masih berjalan.
2. Sebagai operator, saya ingin timeout, cancellation, state akhir, dan log menjelaskan kerja nyata supaya operasi yang gagal tidak terlihat berhasil.
3. Sebagai pengguna Angular, saya ingin state loading, empty, error, refresh, dan stale tetap benar pada zoneless supaya UI tidak bergantung pada kebetulan change detection.

**Acceptance criteria** (mirror; sumber normatif dan detail test ID ada di [test.md](test.md); satu AC satu kepedulian supaya evidence per AC bisa penuh):

Area A, Bun SQL dan cancellation:

1. **AC-1**: Port query typed di `database-core` dengan opsi `AbortSignal`; adapter Bun SQL hanya di provider; tanpa fabricated `TemplateStringsArray`, pemecahan `?` manual, atau `unsafe` di luar adapter; boundary check menolak driver di core.
2. **AC-2**: Cancellation nyata sampai mekanisme provider (`pg_cancel_backend`, `KILL QUERY`); state akhir jujur pada PostgreSQL dan MySQL nyata; cancel idempotent dan race dengan terminal state terdefinisi.
3. **AC-3**: Timeout bersumber config tervalidasi dan menghentikan kerja provider nyata, bukan `Promise.race`; close dan retry meninggalkan koneksi bersih.
4. **AC-4**: `database-core` bebas I/O runtime: probe native tools keluar dari core, `format` backup opaque per provider, definisi kanonik `DatabaseEngine` tunggal.

Area B, Bun I/O:

5. **AC-5**: Asset dan artifact besar streaming tanpa `readFile` penuh; tulis atomik lewat temporary path; abort, disk full, atau hash mismatch membersihkan partial artifact.
6. **AC-6**: Log sink asynchronous dengan backpressure, tanpa tulis sync pada request path yang dimigrasikan; flush saat shutdown sebelum provider ditutup.
7. **AC-7**: Smoke binary membuktikan asset embedded dan directory mode pada target rilis yang tersedia; target tak tersedia dicatat blocked.

Area D, lifecycle Elysia:

8. **AC-8**: `app.ts` menjadi composition root murni; route group inline pindah ke module factory; contract fixture dibangun dari factory yang sama dengan production.
9. **AC-9**: Helper HTTP bersama tunggal (cookie sesi, CSRF, `apiError` dengan correlationId observability, pemetaan `DbError`, paginasi) menggantikan salinan per modul; perilaku dan kode error seragam.
10. **AC-10**: Siklus import `apps/server` dan `apps/cli` putus; dependency cruiser menegakkan `no-circular`, larangan antar `apps/*`, larangan `packages/*` ke `apps/*`, larangan driver npm di core, dan larangan deep import lintas package.
11. **AC-11**: Shutdown terurut sesuai shared contract dan idempotent; request baru ditolak setelah fase stop dimulai.

Area E, contract dan operation:

12. **AC-12**: Validator registry membuktikan traceability dua arah termasuk nama query parameter, schema requestBody, response per status, version header, dan event mapping; drift gagal di CI.
13. **AC-13**: Operation resource v2 memuat schema lengkap untuk query dan generic jobs; explain tetap sinkron sesuai spec 0035; pemetaan state `cancelling` terhadap state machine job spec 0028 terdefinisi.
14. **AC-14**: `Idempotency-Key` bekerja sesuai kontrak: retry sama mengembalikan snapshot sama, body beda `409 IDEMPOTENCY_KEY_REUSED`, record satu jam, restart `404 OPERATION_RESTARTED`.
15. **AC-15**: Operation owner only; admin mengamati metadata via audit; payload, error, event, log bebas secret; command dan hasil akhir diaudit dengan version header, actor, dan correlationId setelah redaction.
16. **AC-16**: Header `X-MyAdmin-API-Version` satu satunya pemilih kontrak; segmen `v1` pada base path dibekukan sebagai base path; nilai tidak dikenal ditolak; contract test v1 dan v2 lulus selama persiapan; pasca cutover header v2 wajib.
17. **AC-17**: WebSocket v2 mengikat version pada subscribe, envelope membawa version sama, reconnect mengulang version, mismatch ditolak, tanpa event v1 pada connection v2.

Area C, reaktivitas Angular:

18. **AC-18**: Read model via SDK resource facade dengan state `loading`, `ready`, `empty`, `refreshing`, `stale`, `error`; abort superseded bukan error; channel sukses dan error terpisah.
19. **AC-19**: Gate zoneless per feature lulus; util pesan error tunggal menggantikan salinan per feature; register pengecualian lengkap.
20. **AC-20**: Aksesibilitas read model: `aria-busy`, live region polite, focus ke error summary hanya setelah aksi user, tanpa secret di announcement.

Area F, UI foundation:

21. **AC-21**: Semua overlay dan dialog memakai Dialog foundation; slice pertama menutup modal drop database dan schema, jalur keyboard edit sel grid, dan roving tabindex grid.
22. **AC-22**: Register capability gap terisi lengkap dengan alasan, dampak, owner, review date, dan bukti WCAG AA per custom component.

Lintas area:

23. **AC-23**: Setiap child memiliki pola kanonis, replaces, enforcement, rollout, exceptions tertulis; setiap exception implementasi tercatat lengkap.
24. **AC-24**: Baseline performa jalur panas tercatat sebelum dan sesudah migrasi; tanpa klaim peningkatan tanpa ukur.
25. **AC-25**: Cutover v2 hanya setelah seluruh gate lulus; v1 dihapus dalam satu rilis; rollback artefak teruji atau tercatat blocked.

## Decision

**Chosen option**: Option 1, ratchet standard dengan cutover operation yang terkoordinasi.

Semua area A sampai F mengikuti standard yang sama. Kode baru wajib memakainya. Kode lama diperbaiki bertahap dalam urutan dependency. Perubahan kontrak publik dibatasi pada query dan generic jobs, memakai `X-MyAdmin-API-Version: 2`, lalu dilakukan sebagai satu cutover rilis setelah seluruh gate lulus. Selama persiapan, v1 dan v2 diuji bersama. Setelah cutover, v1 dihapus dan request tanpa header v2 ditolak.

**Implementation skills**: `angular-developer` (`Codex skills`, `/Users/ojiepermana/.agents/skills/angular-developer/`) · `elysiajs` (`Codex skills`, `/Users/ojiepermana/.agents/skills/elysiajs/`) · `develop` (`Codex workflow`, `/Users/ojiepermana/.agents/skills/develop/`) · `check` (`Codex workflow`, `/Users/ojiepermana/.agents/skills/check/`) · `playwright-cli` (`Codex skills`, `/Users/ojiepermana/.agents/skills/playwright-cli/`)

## Standard definition

**Canonical pattern**:

```typescript
interface CancellableOperation<TInput, TResult> {
  run(input: TInput, options?: { signal?: AbortSignal }): Promise<TResult>;
}

const readModel = resource({
  params: () => queryParams(),
  loader: ({ params, abortSignal }) => sdk.query.read(params, { signal: abortSignal }),
});

const result = await queryPort.run(input, { signal: request.signal });
```

Port domain membawa nilai dan lifecycle. Adapter runtime memakai API Bun yang stabil. SDK facade menjadi batas Angular. Resource mengelola state baca. Elysia hanya mengubah HTTP menjadi command typed dan menyerahkan kerja ke service. Detail lengkap tiap area ada pada child spec.

**Replaces**:

1. Query provider yang berkomunikasi lewat string SQL bebas, pemisahan `?` manual, fabricated `TemplateStringsArray`, atau `unsafe` tanpa batas adapter.
2. `node:fs` sync, `readFile` penuh untuk asset besar, dan penulisan log sync pada request path ketika API native Bun yang setara tersedia.
3. `Promise.race` sebagai timeout yang tidak menghentikan operasi nyata, serta cancel yang hanya mengubah state UI.
4. State Angular yang menggabungkan subscription, counter stale, interval, dan loading flag tanpa lifecycle yang dapat dibaca.
5. Satu `app.ts` besar yang menguasai semua lifecycle dan assembly fixture yang menyalin wiring production.
6. Route string, body parsing, dan SDK path yang tidak dapat dilacak balik ke OpenAPI.
7. Component feature yang memakai raw HttpClient, URL API, atau komponen generik buatan sendiri saat capability foundation tersedia.

**Enforcement**:

1. TypeScript port dan adapter menjadi enforcement compile time untuk runtime serta domain boundary.
2. `check:boundaries`, `check:manifests`, `typecheck`, lint, dan check baru yang deterministik untuk native runtime, route registry, operation contract, serta Angular zoneless menjadi gate CI.
3. `check:contract-drift` dan generated contract menjadi gate untuk OpenAPI, Elysia, SDK, dan event.
4. Test fokus per area, test integration pada service nyata bila acceptance memerlukannya, Playwright untuk browser behavior, dan smoke binary untuk semua target rilis menjadi bukti. Test yang hanya lulus pada host developer tidak cukup untuk menyatakan semua target aman.

**Rollout**:

1. Mulai dari Bun SQL dan cancellation.
2. Lanjutkan Bun I/O.
3. Pecah ownership lifecycle Elysia.
4. Bangun traceability kontrak dan operation v2 untuk query serta generic jobs.
5. Migrasikan Angular resource facade dan zoneless per feature.
6. Selaraskan komponen UI dengan foundation dan catat capability gap.
7. Jalankan cutover v2 satu kali setelah seluruh gate. Rollback memakai artefak rilis sebelumnya, bukan fallback runtime diam diam.

**Exceptions**:

Pengecualian diperbolehkan hanya untuk capability yang tidak tersedia atau semantiknya tidak setara pada target yang didukung. Setiap pengecualian harus tercatat dengan alasan, dampak, owner, test yang membuktikan perilaku, dan tanggal tinjau. Tidak boleh ada fallback diam diam dari v2 ke v1, zoneless ke Zone.js, atau cancel ke perubahan UI saja.

## Shared contract

| Concern            | Contract                                                                              | Source of value                                        | Owner                    |
| ------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------ |
| Runtime version    | Bun `1.4.0` yang dipin di root manifest                                               | `package.json` dan release target spec 0054            | Root runtime             |
| Timeout            | Nilai tervalidasi dari config, dibatasi server                                        | `packages/config` dan request context                  | Service serta adapter    |
| Cancellation       | `AbortSignal` dari request atau resource, ditambah mekanisme provider bila diperlukan | HTTP request, Angular resource, atau command lifecycle | Port dan adapter         |
| Operation id       | Id server yang dibuat saat command diterima                                           | Query service atau job manager                         | Operation service        |
| Operation state    | `queued`, `running`, `cancelling`, `completed`, `failed`, `cancelled`                 | State machine service dan provider result              | Operation service        |
| Progress           | Nilai progress yang dilaporkan worker atau provider                                   | Job manager atau query event                           | Job atau query service   |
| Error              | Code dan message aman dari normalizer                                                 | `ApiError`, `DbError`, serta redaction policy          | API boundary             |
| Actor              | User session yang tervalidasi                                                         | Session cookie dan authorization matrix                | Auth boundary            |
| Correlation id     | Id request yang diteruskan ke log dan event                                           | Observability context                                  | Server middleware        |
| Angular read state | Loading, value, empty, error, refreshing, stale                                       | SDK resource facade dan resource lifecycle             | SDK serta feature facade |
| API version        | `X-MyAdmin-API-Version: 2` saat cutover                                               | Request header dan OpenAPI parameter                   | Contract boundary        |

### Operation resource

Schema v2 wajib mempunyai field berikut. Semua field pada tabel adalah required kecuali jika ditulis nullable.

| Field               | Bentuk                                                                     | Sumber                                                              |
| ------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `id`                | string opaque                                                              | Id yang dibuat query service atau job manager saat command diterima |
| `kind`              | `query-execution` atau `job`                                               | Jenis service yang memiliki operation                               |
| `jobType`           | string nullable                                                            | `Job.type` untuk `job`, null untuk `query-execution`                |
| `state`             | `queued`, `running`, `cancelling`, `completed`, `failed`, atau `cancelled` | State machine service dan hasil provider                            |
| `progress`          | `{ phase: string, current: integer, total?: integer, message?: string }`   | Statement index query atau `JobProgress` dari executor              |
| `createdAt`         | RFC3339 string                                                             | Clock server saat operation dibuat                                  |
| `startedAt`         | RFC3339 string nullable                                                    | Saat worker atau provider mulai                                     |
| `cancelRequestedAt` | RFC3339 string nullable                                                    | Saat command cancel pertama diterima                                |
| `endedAt`           | RFC3339 string nullable                                                    | Saat state terminal ditetapkan                                      |
| `updatedAt`         | RFC3339 string                                                             | Saat state atau progress terakhir berubah                           |
| `result`            | `{ kind: query-results atau artifact, id: string }` nullable               | `executionId` untuk query atau artifact id untuk job                |
| `error`             | `ApiError` nullable                                                        | Error normalizer dengan detail aman dan correlation id              |
| `cancellable`       | boolean                                                                    | Capability operation dan state saat ini                             |
| `cancel`            | `{ method: POST, path: string }` nullable                                  | Path cancel untuk operation non terminal yang cancellable           |

Untuk query, `progress.current` adalah statement aktif dan `progress.total` adalah jumlah statement bila diketahui. Untuk job, bentuk progress mengikuti spec 0028. `result` null bila operation belum menghasilkan hasil atau artifact. Tidak ada field yang mengembalikan SQL, parameter, credential, token, atau isi data.

State `cancelling` dipetakan eksplisit terhadap state machine job spec 0028: sebuah operation berstatus `cancelling` ketika `cancelRequestedAt` sudah terisi dan state belum terminal. Job manager tidak perlu menambah state internal baru; pemetaan dilakukan di operation service. Field `cancel` bersifat affordance (petunjuk aksi untuk client); SDK boleh mengabaikannya karena path cancel sudah diketahui dari kontrak.

### Read model Angular

SDK resource facade memakai state berikut dan mempertahankan `value` terakhir ketika refresh atau stale.

| Phase        | Kapan aktif                                                           | Nilai yang dirender                               | Accessibility                                |
| ------------ | --------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------- |
| `loading`    | Request pertama aktif dan belum ada value                             | Placeholder atau loading foundation               | `aria-busy=true`                             |
| `ready`      | Response berhasil dan value tidak kosong                              | Value terbaru                                     | Tidak ada live announcement berulang         |
| `empty`      | Response berhasil dan collection kosong                               | Empty state                                       | Empty message terbaca screen reader          |
| `refreshing` | Request baru aktif setelah ada value                                  | Value lama tetap terlihat                         | `aria-busy=true`, tidak menghapus focus      |
| `stale`      | Freshness hilang karena reconnect, event terlewat, atau refresh gagal | Value terakhir tetap terlihat dengan stale notice | Notice `aria-live=polite`                    |
| `error`      | Request pertama gagal tanpa value yang valid                          | Error state dan retry                             | Error summary diberi focus setelah aksi user |

Abort karena request lama digantikan tidak menjadi error yang terlihat. Success baru mengubah `stale` menjadi `ready` atau `empty`. Status completion, cancellation, dan failure operation diumumkan melalui live region yang tidak mengandung secret.

### Shutdown contract

Urutan shutdown kanonis adalah menghentikan penerimaan command baru, menghentikan timer dan polling, meminta cancellation pada operation aktif, menunggu batas waktu config, menutup WebSocket dan realtime hub, flush log sink serta stream artifact, menghapus partial artifact, menutup provider dan database, lalu membersihkan lifecycle registry. Setiap langkah idempotent. Client abort pada stream membatalkan sink dan tidak boleh meninggalkan artifact yang terlihat sebagai hasil selesai.

## API migration boundary

**Mekanisme versi tunggal.** Header `X-MyAdmin-API-Version` adalah satu satunya pemilih kontrak untuk permukaan yang dimigrasikan. Segmen `v1` pada base path `/api/v1` dibekukan sebagai base path, bukan penanda versi kontrak; ia tidak berubah pada cutover ini supaya base URL SDK, struktur folder kontrak, dan seluruh endpoint yang tidak dimigrasikan tetap stabil. Tujuan header setelah cutover dinyatakan eksplisit: menolak SPA basi (tab browser dari rilis lama) dengan error yang jelas, karena server dan SPA selalu rilis bersama dalam satu binary sehingga skew versi lain hampir tidak mungkin. Alternatif path baru `/api/v2` ditolak; alasannya tercatat di [rationale.md](rationale.md).

Kontrak yang boleh berubah dalam keputusan ini hanya:

1. Query execution create, read, cancel, dan explain.
2. Generic jobs list, read, dan cancel.
3. WebSocket event query dan generic jobs yang membawa operation resource.

Import, export, backup, restore, metadata query, dan feature endpoint lain tetap mengikuti spec masing masing. Mereka boleh memakai standard internal Bun, cancellation, lifecycle, dan observability ini, tetapi perubahan resource atau payload mereka membutuhkan keputusan feature sendiri.

Sebelum cutover, server dan SDK menjalankan contract test v1 serta v2. Pada cutover, seluruh client internal mengirim header v2, contract dan smoke gate lulus, lalu v1 dihapus. Header yang tidak dikenal selalu ditolak. Setelah v1 dihapus, header v2 wajib untuk permukaan yang dimigrasikan.

## Security and operations

1. Session cookie, CSRF untuk mutating request, ownership, dan izin admin audit memakai keputusan auth serta audit yang sudah ada.
2. Operation resource tidak mengembalikan SQL rahasia, parameter sensitif, credential, token, isi data, atau detail filesystem yang tidak diperlukan.
3. Operation hanya dapat dibaca dan dibatalkan oleh owner. Admin audit melihat jejak metadata melalui endpoint audit, bukan operation surface.
4. Pembuatan, cancellation, completion, failure, version header, actor, target, dan correlation id masuk audit setelah redaction.
5. Tidak ada env var, credential, atau provider baru. Config baru hanya boleh ditambahkan melalui package config dan divalidasi saat startup.
6. Baseline performa dicatat pada jalur panas yang relevan. Spec tidak mengklaim speedup hanya karena API native dipakai.

## Consequences

**Positive**:

1. Bun 1.4 benar benar menjadi runtime yang dipakai, tetapi domain dan port tetap mudah diuji.
2. Cancellation, timeout, operation state, dan read model memiliki sumber nilai yang dapat dilacak.
3. Route, contract, SDK, event, dan UI mendapat satu jalur traceability.
4. Perubahan besar Angular zoneless memiliki gate yang terlihat per feature.

**Negative / tradeoffs**:

1. Enam child spec menambah pekerjaan dokumentasi dan maintenance.
2. Port serta adapter menambah sedikit kode dan memerlukan disiplin dependency boundary.
3. Cutover v2 dapat memutus client lama bila ada client yang tidak masuk inventaris. Artefak lama dan contract test menjadi pengaman, tetapi bukan pengganti inventaris client.
4. Zoneless dapat memunculkan bug pada callback eksternal, form, timer, atau komponen custom yang sebelumnya tertolong oleh Zone.js.
5. Test integration database, browser, dan semua target binary membutuhkan environment yang mungkin belum tersedia. Bukti yang tidak dijalankan tetap harus dicatat sebagai blocked.
6. Owner only membatasi dukungan operasional langsung dari admin. Diagnosis admin harus memakai audit dan correlation id.

**Neutral**:

1. Spec ini tidak menambah tabel atau migrasi database.
2. Tidak ada library baru atau discovery plugin baru.
3. `docs/scope/` belum diubah karena spec standalone ini belum memiliki feature row yang cocok. Setelah ratifikasi, pekerjaan pertama perlu didaftarkan melalui workflow scope.

## Follow-up

1. Setelah spec diratifikasi, daftarkan slice pertama pada scope sebagai pekerjaan cross cutting yang merujuk ke 0056. Jangan memasukkan daftar task atomic ke scope.
2. Perbaiki bug nama parameter `pageSize` versus `page-size` pada `/jobs` v1 (server, SDK, dan test kontrak) sebagai pekerjaan segera yang terpisah; jangan menunggu cutover v2 karena v1 masih permukaan yang dipakai.
3. Inventaris seluruh client query dan generic jobs sebelum cutover v2, termasuk client luar bila ada.
4. Tetapkan lokasi register pengecualian dan hubungkan setiap entry ke evidence matrix setelah implementation dimulai.
5. Periksa pointer skill `bun-sqlite` di `AGENTS.md`; path yang tercatat belum tersedia pada preflight ini.
6. Perubahan kontrak import, export, backup, dan restore tetap membutuhkan update pada spec feature masing masing.
7. Tambahkan retention matrix operation ke contract dan implementasi dengan ketentuan `query-execution` serta `job` terminal disimpan satu jam, idempotency record disimpan satu jam, dan restart menghasilkan 404 dengan pesan aman bahwa operation sudah berakhir karena server dimulai ulang.
8. Jalankan ulang `bun run matrix:ac` setelah perubahan ini dikomit; 25 AC baru spec 0056 akan muncul sebagai blocked, dan itu jujur karena implementasinya belum dimulai.

## Rationale

Reasoning and options: [rationale.md](rationale.md)
