# 0056. Bun SQL dan cancellation

## Summary

Provider database memakai Bun SQL sebagai detail adapter, bukan sebagai kontrak domain. Caller mengirim input typed melalui port dan cancellation diteruskan sampai query atau mekanisme cancel provider yang nyata.

## Scope

1. PostgreSQL dan MySQL driver adapter.
2. Query, transaction, reserve, close, timeout, dan cancellation.
3. Query execution serta provider capability yang dipakai spec 0033 dan 0035.

## Standard definition

**Canonical pattern**:

```typescript
interface QueryPort<TInput, TResult> {
  execute(input: TInput, options?: { signal?: AbortSignal }): Promise<TResult>;
}

class BunQueryAdapter implements QueryPort<QueryInput, QueryResult> {
  public execute(input: QueryInput, options?: { signal?: AbortSignal }): Promise<QueryResult> {
    return this.runBoundStatement(input, options?.signal);
  }
}
```

Parameter binding, reserved connection, backend pid, dan perbedaan PostgreSQL atau MySQL tinggal di adapter. `database-core` tidak mengimpor Bun SQL dan tidak menerima SQL engine detail.

**Replaces**:

1. Caller yang menyusun SQL string dan membelah placeholder `?` secara manual.
2. Fabricated `TemplateStringsArray` untuk memaksa typed API.
3. MySQL `unsafe` yang dipanggil di luar adapter dengan input yang belum dibatasi.
4. `Promise.race` yang hanya membatasi penantian tanpa membatalkan kerja provider.

**Enforcement**:

1. Port typed pada database core dan adapter provider menjadi check compile time.
2. Boundary check melarang import driver pada core.
3. Test integration PostgreSQL dan MySQL membuktikan binding, timeout, cancellation, close, dan state akhir.
4. Test unit hanya menguji domain tanpa menggantikan provider nyata ketika acceptance memerlukan provider.

**Rollout**:

Mulai dari port dan adapter PostgreSQL serta MySQL, lalu query execution, lalu SDK dan route cancellation. Setelah itu migrasikan caller domain satu per satu.

**Exceptions**:

Raw statement hanya boleh berada di adapter bila API Bun memerlukannya dan input sudah dinormalisasi. Pengecualian wajib masuk register dan mempunyai test provider.

## Rationale

Port mempertahankan aturan provider neutral yang sudah dipilih. Adapter memberi ruang memakai API native Bun 1.4 tanpa menjadikan detail driver sebagai bahasa seluruh aplikasi. Cancellation menjadi bagian kontrak sehingga UI tidak dapat menyatakan cancelled sebelum provider selesai.
