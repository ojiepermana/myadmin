# 0057. Remediasi audit gelombang 1

**Date**: 2026-09-04
**Status**: Assumed
**Authorized by**: ojiepermana, saat /develop

## Owed decision

Audit codebase 2026-09-04 ([docs/reviews/2026-09-04-audit-codebase.md](../../reviews/2026-09-04-audit-codebase.md))
menemukan 40 temuan yang belum punya spec sendiri. Gelombang 1 dari roadmap audit
memuat sepuluh baris pekerjaan yang saling lepas. Keputusan yang belum
dideliberasi adalah: mana dari temuan itu yang menjadi kewajiban normatif dengan
acceptance criteria, dan sampai mana perbaikannya berhenti sebelum menyentuh
pekerjaan gelombang 2.

## Assumption built on

Spec ini dibangun di atas asumsi bahwa laporan audit sudah menjadi sumber
kebenaran yang cukup untuk gelombang 1, karena setiap temuannya menyebut bukti
`file:baris`, dampak, dan bentuk perbaikan yang diminta. Batas yang diasumsikan:

1. Perbaikan mengambil bentuk yang sudah disebut audit, bukan alternatif baru.
   Contoh: upload restore memakai pola `ImportUploadStore` yang sudah ada, bukan
   store baru.
2. Pekerjaan berhenti di batas gelombang 1. Kernel HTTP penuh (SRV-2), pemecahan
   `app.ts` (SRV-1), dialect di core (DB-6), dan `sdkResource()` (WEB-2) adalah
   gelombang 2 dan tidak dikerjakan di sini. Yang dikerjakan hanya `apiError`
   bersama sebagai langkah pertama kernel.
3. Temuan yang butuh akses di luar repo, yaitu proteksi branch `main`, dicatat
   sebagai kewajiban dengan bukti eksternal dan tidak bisa dituntaskan oleh
   perubahan kode.

## Code area

- `packages/database-postgresql/src/data.ts`, `packages/database-mysql/src/data.ts`
- `packages/database-mysql/src/security/index.ts`, `packages/database-mysql/src/backup.ts`
- `packages/database-postgresql/src/mappers/`, `packages/database-mysql/src/mappers/`
- `packages/backup/src/{restore.ts,executor.ts,restore-executor.ts,backup-service.ts}`
- `packages/native-tools/src/index.ts`
- `apps/server/src/http/` (baru), `apps/server/src/app.ts`, `apps/server/src/*/routes.ts`
- `apps/web/src/app/features/{data-browser,query-editor,import-export}/`, `apps/web/src/app/app.config.ts`
- `scripts/quality/generate-ac-evidence-matrix.ts`, `package.json`, `tests/`, `.github/workflows/`
- `tooling/eslint/eslint.config.mjs`, `tsconfig.json`, `apps/web/tsconfig.app.json`

## Summary

Spec ini menutup gelombang 1 roadmap audit: tiga bug runtime provider dan satu
kesalahan pemetaan error, tiga masalah infrastruktur subprocess dan upload, satu
langkah pertama kernel HTTP, dua perbaikan reaktivitas dan aksesibilitas web,
serta lima perbaikan gate proses supaya klaim bukti proyek ini bisa dipercaya.
Gelombang ini sengaja berisi pekerjaan berisiko rendah yang bisa selesai tanpa
gelombang berikutnya.

## Requirements

**User stories**:

1. Sebagai pengguna, saya ingin filter, pencarian, dan edit baris bekerja benar
   pada PostgreSQL dan MySQL supaya data yang saya lihat dan ubah adalah data
   yang saya maksud.
2. Sebagai operator, saya ingin subprocess dan upload tidak membocorkan secret
   atau memenuhi disk supaya server tetap aman ketika dipakai banyak orang.
3. Sebagai kontributor, saya ingin gate proyek benar benar menjalankan test yang
   diklaimnya supaya keputusan rilis berdiri di atas bukti, bukan pencocokan
   string.

**Acceptance criteria** (mirror; sumber normatif ada di [test.md](test.md)):

Area A, bug provider database:

1. **AC-1**: Klausa `ESCAPE` pada filter dan pencarian data browser menghasilkan
   satu karakter backslash pada teks SQL runtime untuk PostgreSQL, sehingga
   `standard_conforming_strings=on` menerimanya. MySQL dibiarkan apa adanya
   karena probe membuktikan bentuk yang ada sudah diterima pada `sql_mode`
   default maupun `NO_BACKSLASH_ESCAPES`.
2. **AC-2**: Nilai kolom integer dan exact numeric diteruskan ke driver tanpa
   kehilangan presisi, sehingga identitas baris dengan kunci di atas 2^53
   mengenai tepat baris yang dimaksud pada kedua engine.
3. **AC-3**: Perubahan principal MySQL menghasilkan tepat satu klausa autentikasi
   yang valid; mengganti `authPlugin` tanpa credential baru ditolak sebelum SQL
   dijalankan, sehingga tidak ada jalur yang mengosongkan password akun.
4. **AC-4**: Pemetaan error PostgreSQL dan MySQL berbasis tabel sqlState dan
   errno yang diperiksa sebelum regex pesan; kode duplikat, error nilai,
   deadlock, dan unsupported terpetakan ke kategori yang benar.

Area B, infrastruktur:

5. **AC-5**: Upload restore ditulis streaming tanpa membuffer seluruh file di
   memori, punya `expiresAt`, dibersihkan setelah restore selesai maupun gagal,
   dan punya `cleanup()` untuk upload kedaluwarsa.
6. **AC-6**: Subprocess backup, restore, dan probe native tool menerima
   environment allowlist, bukan seluruh environment server; `MYADMIN_MASTER_KEY`
   dan variabel non allowlist tidak pernah sampai ke tool eksternal.
7. **AC-7**: Nama database pada request backup divalidasi dengan aturan yang sama
   dengan jalur restore dan diteruskan setelah pemisah `--`, sehingga nilai
   berawalan `--` tidak pernah ditafsirkan sebagai opsi.

Area C, server:

8. **AC-8**: Ada satu modul `apps/server/src/http/` yang menyediakan `apiError`
   dan `jsonResponse`; seluruh route fitur memakainya, dan correlation id pada
   respons error sama dengan yang tercetak observability ke log.

Area D, web:

9. **AC-9**: Pesan sukses memakai channel `notice` terpisah yang dirender dengan
   `role="status"` dan gaya non destruktif; channel `error` dengan `role="alert"`
   hanya memuat kegagalan.
10. **AC-10**: Aplikasi web mendeklarasikan `provideZonelessChangeDetection()`
    secara eksplisit, dan sisa debug (menu preview error boundary, placeholder
    nama contoh) tidak dikirim ke produksi.

Area E, proses dan gate:

11. **AC-11**: Script test berjenjang: `test:fast` menjalankan unit dan
    integration tanpa spawn proses atau build; test yang membangun, membuka port,
    atau menjalankan suite bersarang berada di `tests/smoke/`; tidak ada test yang
    menulis ke file source yang di track git.
12. **AC-12**: Matrix acceptance menurunkan PASS dari hasil test yang benar benar
    dijalankan dan lulus; test `skip` tidak menghitung; angka yang dikodekan keras
    dihapus; `matrix:ac --check` gagal bila file yang di commit menyimpang.
13. **AC-13**: Workflow memakai `concurrency` dengan `cancel-in-progress`, test
    realtime deterministik pada runner hosted, dan branch `main` diproteksi dengan
    check wajib.
14. **AC-14**: `strictTemplates` aktif untuk template Angular dan `angular-eslint`
    terpasang dengan aturan template; seluruh error yang muncul dibereskan
    sehingga `lint` dan `typecheck` tetap hijau.
15. **AC-15**: Komposisi bundle produksi dianalisis dan tercatat lewat perintah
    yang dapat diulang, dan ukuran initial berkurang. Angka headroom tercatat
    bersama keputusan eksplisit tentang budget.

## Build plan

1. [x] AC-1 `ESCAPE` PostgreSQL dan MySQL plus unit test bentuk SQL.
2. [x] AC-2 koersi nilai lossless dan identitas baris pada kedua provider plus unit test presisi.
3. [x] AC-3 klausa autentikasi MySQL tunggal plus unit test penolakan plugin tanpa credential.
4. [x] AC-4 tabel error berbasis data untuk kedua provider plus unit test pemetaan.
5. [x] AC-5 `RestoreUploadStore` streaming dengan expiry dan cleanup.
6. [x] AC-6 allowlist environment subprocess pada backup, restore, dan native tools.
7. [x] AC-7 validasi nama database backup dan pemisah `--`.
8. [x] AC-8 modul `apps/server/src/http/` dan migrasi seluruh route fitur.
9. [x] AC-9 channel `notice` pada data browser, query editor, dan import export.
10. [x] AC-10 `provideZonelessChangeDetection()` dan pembersihan sisa debug.
11. [x] AC-11 tiering script test, pemindahan test smoke, penghentian tulis ke source.
12. [x] AC-12 generator matrix berbasis hasil test dan mode `--check`.
13. [ ] AC-13 `concurrency` workflow dan determinisme test realtime selesai; proteksi branch `main` belum dan butuh akses admin repository.
14. [x] AC-14 `strictTemplates` dan `angular-eslint`.
15. [x] AC-15 analisis bundle dan budget.

## Consequences

- Perubahan AC-2 mengubah tipe nilai parameter yang dikirim ke driver dari
  `number` menjadi `string` untuk kolom integer dan exact numeric. Driver
  menyerahkan inferensi tipe ke engine, sehingga perilaku untuk nilai kecil tidak
  berubah.
- AC-3 menutup jalur yang sebelumnya diperbolehkan form edit, yaitu mengganti
  plugin tanpa mengisi password. Ini adalah perubahan perilaku yang disengaja.
- AC-12 akan menurunkan jumlah AC berstatus PASS pada matrix, karena PASS lama
  sebagiannya hanya pencocokan string. Penurunan itu adalah koreksi, bukan
  regresi.
- AC-14 berpotensi memunculkan error template yang selama ini lolos. Error itu
  dibereskan dalam spec ini juga.
- AC-13 memuat satu kewajiban yang tidak bisa dituntaskan oleh perubahan kode,
  yaitu proteksi branch, dan tetap terbuka sampai dibuktikan di luar repo.

## Ratify

Keputusan ini dicatat oleh /develop, bukan dideliberasi. Jalankan
`/architect 0057` untuk mendeliberasi dan meratifikasinya. Sampai itu terjadi
statusnya tetap `Assumed` dan tercatat sebagai keputusan yang belum dilunasi.
