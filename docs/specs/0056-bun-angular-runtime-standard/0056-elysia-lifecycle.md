# 0056. Lifecycle dan komposisi Elysia

## Summary

Elysia menjadi HTTP composition layer yang tipis. Route module menerima dependency typed, service memiliki business logic, dan satu composition root memiliki ownership lifecycle. Contract fixture memakai factory yang sama tanpa menyalin assembly production.

## Scope

1. `apps/server/src/app.ts` serta route registration module.
2. Dependency injection Elysia, lifecycle cleanup, timer, WebSocket, dan provider close.
3. Production app dan contract fixture.

## Standard definition

**Canonical pattern**:

```typescript
const modules = createServerModules(runtime);
const application = createApplication({
  modules,
  lifecycle: createLifecycle(runtime),
});
```

Route module hanya memetakan request typed ke service. Dependency business ditambahkan melalui composition factory atau Elysia plugin yang explicit. Cleanup didaftarkan sekali pada lifecycle owner dan dapat dipanggil untuk production maupun fixture.

Shutdown mengikuti urutan shared contract umbrella: stop menerima command, stop timer dan polling, request cancellation pada operation aktif, tunggu batas waktu config, tutup WebSocket dan realtime hub, flush sink serta stream, hapus partial artifact, tutup provider dan database, lalu clear registry. Cleanup dapat dipanggil lebih dari satu kali tanpa mengulang efek.

**Replaces**:

1. `app.ts` sebagai tempat semua construction, route logic, timer, dan cleanup sekaligus.
2. Duplikasi production assembly pada `createApp` contract fixture.
3. Cast `AnyElysia` dan body parsing manual sebagai pengganti model route jika schema dapat didefinisikan.
4. Dependency implicit yang masuk melalui global mutable state.

**Enforcement**:

1. Module factory dan explicit dependency menjadi tipe compile time.
2. Test memastikan cleanup idempotent, timer berhenti, WebSocket ditutup, dan fixture menguji module yang sama.
3. Boundary check menjaga domain service tidak mengimpor Elysia.
4. Contract test memakai application factory yang sama dengan production module.
5. Test shutdown memeriksa urutan dan memastikan request baru ditolak setelah fase stop dimulai.

**Rollout**:

Pisahkan lifecycle cleanup, kemudian module factory untuk provider dan job, lalu route group query serta jobs. Setelah itu pindahkan fixture ke factory yang sama dan hapus wiring duplikat.

**Exceptions**:

Global lifecycle boleh dipakai untuk observability atau transport hook yang tidak membawa business dependency. Semua dependency yang menambah type, model, atau business logic harus explicit.

## Rationale

Elysia mendukung plugin encapsulation dan explicit dependency. Memakai konsep itu mengurangi risiko route berjalan dengan hook yang salah atau fixture berbeda dari production. Pemisahan factory juga membuat cutover contract dapat diuji tanpa menjalankan wiring kedua yang bisa drift.
