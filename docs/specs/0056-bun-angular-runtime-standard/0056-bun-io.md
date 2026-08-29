# 0056. Bun I/O native

## Summary

Filesystem, asset, log, export, import, backup, dan hashing memakai API native Bun yang stabil ketika semantiknya setara. I/O besar memakai stream atau sink agar memory dan backpressure terlihat.

## Scope

1. `Bun.file`, `Bun.write`, FileSink, Response streaming, dan `Bun.CryptoHasher` pada jalur yang sesuai.
2. Asset embedded dan directory asset.
3. Logging serta artifact export, import, backup, dan restore.

## Standard definition

**Canonical pattern**:

```typescript
const file = Bun.file(path);
const response = new Response(file.stream(), { headers });
await Bun.write(destination, sourceStream);
const hash = new Bun.CryptoHasher('sha256');
```

Jalur request tidak membaca seluruh file besar ke memory bila stream cukup. Penulisan log memakai queue atau sink yang memiliki backpressure dan tidak memblokir handler.

**Replaces**:

1. `node:fs` dan `node:fs/promises` pada jalur yang memiliki API Bun setara.
2. `readFile` penuh untuk asset atau artifact yang dapat disajikan sebagai stream.
3. Append dan rotation sync pada request path.
4. Hashing yang mengumpulkan seluruh file sebelum digest.

**Enforcement**:

1. Port file dan artifact membatasi pemakaian runtime pada adapter.
2. Static check mencari import Node filesystem pada area yang sudah dimigrasikan.
3. Test ukuran besar memeriksa streaming, error, path traversal, close, dan backpressure.
4. Smoke test binary memeriksa asset embedded serta directory mode.
5. Test client abort memastikan stream berhenti, sink ditutup atau di flush, dan partial artifact dihapus atau tidak dipublikasikan.

**Rollout**:

Migrasikan asset serving dan logging lebih dahulu, lalu export dan import, kemudian backup serta restore. Jalankan smoke pada lima target packaging spec 0054.

**Exceptions**:

`node:` API boleh dipertahankan bila Bun tidak menyediakan semantik yang sama pada target rilis atau library external mengharuskannya. Catat bukti dan tanggal tinjau.

## Failure policy

1. Artifact ditulis ke temporary path dan baru menjadi visible setelah penulisan serta hash selesai secara atomik.
2. Client abort, disk full, hash mismatch, atau stream error menutup source dan sink, menghapus temporary artifact, dan mengembalikan error aman.
3. Log sink boleh gagal tanpa merobohkan request, tetapi sink harus di flush pada shutdown sebelum provider ditutup.
4. Directory asset yang gagal dibaca menjadi response error atau not found sesuai jalur yang sudah ada, tanpa membaca fallback yang tidak aman.

## Rationale

Asset dan artifact adalah jalur yang paling mudah menghabiskan memory atau memblokir event loop. Bun native memberi primitive yang sesuai dengan runtime yang sudah dipin, tetapi port dan exception register mencegah perpindahan API menjadi aturan mekanis yang merusak portability.
