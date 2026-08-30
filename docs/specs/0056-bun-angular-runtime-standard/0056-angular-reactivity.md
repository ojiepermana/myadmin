# 0056. Reaktivitas Angular signal first

## Summary

Feature Angular membaca data melalui SDK resource facade dan signals. `resource` atau `httpResource` dipakai saat lifecycle request cocok, sedangkan command, realtime, dan stream tetap memiliki lifecycle eksplisit. Aplikasi sudah berjalan zoneless (tidak ada polyfill zone.js pada build saat ini); child ini meresmikan keadaan itu menjadi kebijakan dengan gate per feature, sehingga tidak ada feature yang lulus karena kebetulan.

## Scope

1. `packages/sdk-angular` sebagai boundary transport dan resource facade.
2. Feature read model, loading, empty, error, refresh, dan stale response.
3. `provideZonelessChangeDetection()` serta kompatibilitas event, form, timer, dan callback eksternal.

## Standard definition

**Canonical pattern**:

```typescript
const query = resource({
  params: () => requestSignal(),
  loader: ({ params, abortSignal }) =>
    querySdk.read(params, { signal: abortSignal }),
});

readonly rows = computed(() => query.value()?.rows ?? []);
```

Component membaca signal dan mengirim command ke facade. Component tidak membuat raw URL, memanggil raw HttpClient, atau mengelola subscription hanya untuk read state.

**Replaces**:

1. `firstValueFrom` dan subscription manual sebagai read model default.
2. Loading, error, stale counter, dan polling interval yang tidak memiliki lifecycle bersama.
3. `httpResource` langsung di component yang melewati SDK contract boundary.
4. Ketergantungan pada Zone.js untuk membuat perubahan state terlihat.

**Enforcement**:

1. SDK resource facade typed menjadi boundary compile time.
2. `provideZonelessChangeDetection()` dinyatakan eksplisit pada konfigurasi aplikasi sebagai dokumentasi keadaan yang sudah berjalan, bukan sebagai migrasi.
3. Angular build, focused test dengan runner DOM yang tepat, dan Playwright memeriksa render serta lifecycle.
4. Feature yang belum signal safe masuk register pengecualian dan gagal pada gate zoneless, tanpa fallback otomatis ke Zone.js.
5. Focused DOM test dan Playwright memeriksa `aria-busy`, live region untuk status operation, focus setelah error atau cancel, stale notice, dan empty state.

**Rollout**:

Migrasikan read model yang paling sering dipakai lebih dahulu, kemudian command dan realtime boundary, lalu jalankan gate zoneless per feature sampai semua area lulus. Gate bukan migrasi runtime (runtime sudah zoneless); gate adalah bukti test DOM per feature bahwa tidak ada behavior yang bergantung Zone.js.

**Exceptions**:

Subscription tetap benar untuk WebSocket, event stream, atau library external yang tidak menyediakan resource contract. Ia harus dimiliki service atau facade, dihentikan pada lifecycle yang jelas, dan mengirim perubahan melalui signal atau change detection trigger yang eksplisit.

## Read state contract

1. `loading` berarti request pertama aktif tanpa value.
2. `ready` berarti response sukses memiliki value.
3. `empty` berarti response sukses untuk collection tidak memiliki item.
4. `refreshing` berarti request aktif dengan value terakhir yang tetap dirender.
5. `stale` berarti freshness hilang karena reconnect, event terlewat, atau refresh gagal. Value terakhir tetap dirender dan stale notice terlihat.
6. `error` berarti request pertama gagal tanpa value valid. Error refresh tidak menghapus value terakhir, melainkan mempertahankan `stale` dengan error yang aman.
7. Abort akibat request lama digantikan tidak dirender sebagai error.

`aria-busy` aktif pada `loading` dan `refreshing`. Completion, cancellation, failure, stale, dan retry diumumkan melalui live region polite. Focus berpindah ke error summary hanya setelah aksi user, bukan karena background refresh. Tidak ada announcement yang memuat SQL, parameter, credential, token, atau isi data.

Dua aturan pendamping read model:

1. Pesan sukses dan pesan error memakai channel berbeda. Sukses lewat elemen `role="status"` atau toast; error lewat `role="alert"` atau banner error. Pesan sukses tidak boleh disalurkan lewat signal atau elemen error.
2. Satu util pesan error di `core/errors` (menerima unknown, mengembalikan pesan aman plus correlationId bila ada) menggantikan semua salinan `messageFor` per feature. Kebijakan presentasi: error tak terduga lewat presenter global (toast dengan correlationId), error kontekstual lewat banner inline, keduanya memakai util yang sama.

## Zoneless gate

Feature lulus gate bila semua perubahan yang dirender berasal dari signal, resource, event Angular, atau change detection trigger yang eksplisit; tidak ada behavior yang hanya muncul karena Zone.js; callback external, timer, form, WebSocket reconnect, dan error state memiliki test DOM; dan tidak ada exception tanpa owner, alasan, evidence, serta review date.

## Rationale

Angular 22 sudah menyediakan resource lifecycle, tetapi feature MyAdmin harus tetap melalui SDK. Memaksa semua async menjadi resource akan salah untuk realtime dan command. Gate zoneless membuat bug callback eksternal terlihat pada feature yang tepat.
