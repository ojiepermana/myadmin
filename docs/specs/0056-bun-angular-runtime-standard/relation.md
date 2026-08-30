# Relation 0056. Standar runtime Bun dan reaktivitas Angular

Spec ini adalah keputusan standalone. Ia tidak memiliki satu feature row sendiri pada `docs/scope/` sampai slice pertama didaftarkan setelah ratifikasi.

## Prerequisites

Prasyarat dibagi dua tingkat supaya pekerjaan standar internal tidak menunggu spec yang belum dibangun.

**Tingkat 1, standar internal (child A, B, C, D, F) boleh dimulai setelah:**

1. Spec 0001 untuk satu root manifest dan source module.
2. Spec 0002 untuk quality gate.
3. Spec 0003 dan 0004 untuk OpenAPI serta generated contract.
4. Spec 0005 untuk SDK Angular.
5. Spec 0013 untuk observability.
6. Spec 0014 untuk UI foundation.
7. Spec 0021, 0022, dan 0024 untuk database core serta provider.
8. Spec 0028 dan 0029 untuk jobs serta realtime.
9. Spec 0033 dan 0035 untuk query execution serta cancellation.

**Tingkat 2, cutover kontrak (child E, langkah cutover saja) menambah syarat:**

1. Spec 0053 (security hardening) selesai, karena cutover mengubah permukaan publik.
2. Spec 0054 dan 0055 tersedia untuk smoke binary semua target dan rollback artefak rilis.
3. Evidence acceptance v1 untuk permukaan yang dimigrasikan (query execution dan generic jobs) sehat: tidak ada AC blocked yang tersisa pada spec 0033, 0035, dan 0028 untuk perilaku yang dipindahkan. Persiapan child E (schema, adapter, contract test dua versi) boleh berjalan sebelum syarat ini terpenuhi; hanya cutover yang menunggu.

## Dependency order

1. Child Bun SQL dan cancellation.
2. Child Bun I/O.
3. Child Elysia lifecycle.
4. Child contract dan operation resource.
5. Child Angular reactivity.
6. Child UI foundation.

Setiap child dapat memiliki milestone implementation sendiri. Perubahan API pada child contract menunggu port dan lifecycle yang dibutuhkan sudah stabil.

## Downstream consumers

1. Provider database, query execution, jobs, observability, export, import, backup, dan restore memakai aturan runtime yang relevan.
2. `apps/server` memakai aturan lifecycle dan contract.
3. `packages/sdk-angular` serta seluruh feature Angular memakai aturan resource dan foundation.
4. `packages/api-contract` menjadi sumber v2 untuk query dan generic jobs.
5. Packaging dan smoke test menjadi bukti target runtime.

## Scope boundary

Perubahan resource dan payload hanya berlaku untuk query execution, generic jobs, serta WebSocket event terkait. Import, export, backup, restore, metadata, dan endpoint feature lain tetap mengikuti spec masing masing.

## Handoff

Setelah keputusan diterima, `/scope` mendaftarkan slice pertama. `/develop` memakai child spec yang sesuai. `/check verify` membuktikan behavior nyata. `/test` menambah atau menyelaraskan test sesuai acceptance. `/sync` menyelaraskan context file setelah perubahan code selesai.
