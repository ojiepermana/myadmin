# 0057. Remediasi audit gelombang 1

**Date**: 2026-09-04
**Ratified**: 2026-09-05 oleh `/architect`
**Status**: In Progress

## Summary

Spec ini menutup gelombang 1 roadmap audit: tiga bug runtime provider dan satu
kesalahan pemetaan error, tiga masalah infrastruktur subprocess dan upload, satu
langkah pertama kernel HTTP, dua perbaikan reaktivitas dan aksesibilitas web,
serta lima perbaikan gate proses supaya klaim bukti proyek ini bisa dipercaya.
Gelombang ini sengaja berisi pekerjaan berisiko rendah yang bisa selesai tanpa
gelombang berikutnya.

## Context

Audit codebase 2026-09-04 ([docs/reviews/2026-09-04-audit-codebase.md](../../reviews/2026-09-04-audit-codebase.md))
menilai commit `abe2aa9` di `main` dan mendefinisikan 57 temuan. Fondasi
teknisnya dinilai kuat, tetapi audit menemukan tiga bug runtime yang merusak
jalur pengguna, proses pembuktian yang tidak sekuat klaimnya, dan duplikasi
struktural yang tumbuh pada tiap fitur baru.

Audit menyusun tiga gelombang perbaikan. Gelombang 1 adalah pekerjaan berisiko
rendah yang bisa selesai sendiri. Spec ini menutup gelombang itu.

Latar lengkap, opsi yang ditimbang, dan alasan tiap pemilihan ada di
[rationale.md](rationale.md).

## Decision

Tiga keputusan menentukan isi dan batas spec ini.

1. **Batas gelombang 1 mengikuti roadmap audit, ditambah triase eksplisit.**
   Lima belas acceptance criteria di bawah menutup sepuluh baris pekerjaan
   gelombang 1 apa adanya. Roadmap audit ternyata bukan pembagian yang habis:
   bagian 4 mendefinisikan 57 temuan tetapi bagian 6 hanya menempatkan 45 ke
   dalam gelombang. Dua belas temuan yang tersisa ditugaskan ke gelombang lewat
   [triase pada rationale.md](rationale.md#triase-temuan-yang-dilewatkan-roadmap-audit),
   dan tidak satu pun dikerjakan di sini. Menariknya ke sini akan membuat
   gelombang 1 berhenti menjadi pekerjaan berisiko rendah.

2. **Perbedaan bentuk `ESCAPE` antara PostgreSQL dan MySQL dipertahankan, dan
   dikunci dengan regresi.** Kedua engine memperlakukan backslash di dalam string
   literal secara berbeda, sehingga bentuk teks yang berbeda adalah hal yang
   benar. Yang tidak diterima adalah dasar buktinya: klaim untuk MySQL berdiri di
   atas probe manual sekali jalan. AC-1 kini menuntut regresi yang memaku bentuk
   yang diterima MySQL pada `sql_mode` default maupun `NO_BACKSLASH_ESCAPES`.

3. **Kewajiban yang tidak dapat dibuktikan dari repo berdiri sebagai AC
   tersendiri.** AC-13 sebelumnya mencampur `concurrency`, determinisme realtime,
   dan proteksi branch `main`. Dua yang pertama hidup di dalam repo dan sudah
   terbukti; yang ketiga menuntut akses admin GitHub. Proteksi branch dipisahkan
   menjadi AC-16 dan tetap berstatus BLOCKED, sehingga jelas satu hal itulah yang
   menahan feature ini, bukan seluruh AC-13.

**Batas yang tidak dilewati.** Kernel HTTP penuh (SRV-2), pemecahan `app.ts`
(SRV-1), dialect di core (DB-6), dan `sdkResource()` (WEB-2) adalah gelombang 2
dan tetap milik spec [0056](../0056-bun-angular-runtime-standard/index.md). Yang
dikerjakan di sini hanya `apiError` bersama sebagai langkah pertama kernel.

**Implementation skills**: [elysiajs](/Users/ojiepermana/.agents/skills/elysiajs/)
untuk modul `apps/server/src/http/`, [angular-developer](/Users/ojiepermana/.agents/skills/angular-developer/)
untuk channel `notice` dan `provideZonelessChangeDetection()`, dan
[check](/Users/ojiepermana/.agents/skills/check/) untuk disiplin bukti pada AC-11
sampai AC-16.

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
   `standard_conforming_strings=on` menerimanya. MySQL mempertahankan bentuknya
   sendiri karena memproses escape backslash di dalam string literal, dan bentuk
   yang diterima itu dikunci oleh regresi yang dijalankan pada `sql_mode` default
   maupun `NO_BACKSLASH_ESCAPES`.
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
13. **AC-13**: Seluruh workflow memakai `concurrency` dengan `cancel-in-progress`,
    dan test realtime deterministik pada runner hosted, yaitu berbasis kondisi dan
    bukan `setTimeout` tetap.
14. **AC-14**: `strictTemplates` aktif untuk template Angular dan `angular-eslint`
    terpasang dengan aturan template; seluruh error yang muncul dibereskan
    sehingga `lint` dan `typecheck` tetap hijau.
15. **AC-15**: Komposisi bundle produksi dianalisis dan tercatat lewat perintah
    yang dapat diulang, dan ukuran initial berkurang. Angka headroom tercatat
    bersama keputusan eksplisit tentang budget.

Area F, kewajiban di luar repo:

16. **AC-16**: Branch `main` diproteksi dengan check wajib. Kewajiban ini tidak
    dapat dipenuhi oleh perubahan kode dan menuntut akses admin repository;
    buktinya adalah output `gh api repos/:owner/:repo/branches/main/protection`.

## Code area

- `packages/database-postgresql/src/data.ts`, `packages/database-mysql/src/data.ts`
- `packages/database-mysql/src/security/index.ts`, `packages/database-mysql/src/backup.ts`
- `packages/database-postgresql/src/mappers/`, `packages/database-mysql/src/mappers/`
- `packages/backup/src/{restore.ts,executor.ts,restore-executor.ts,backup-service.ts}`
- `packages/native-tools/src/index.ts`
- `apps/server/src/http/`, `apps/server/src/app.ts`, `apps/server/src/*/routes.ts`
- `apps/web/src/app/features/{data-browser,query-editor,import-export}/`, `apps/web/src/app/app.config.ts`
- `scripts/quality/generate-ac-evidence-matrix.ts`, `package.json`, `tests/`, `.github/workflows/`
- `tooling/eslint/eslint.config.mjs`, `tsconfig.json`, `apps/web/tsconfig.app.json`

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
13. [x] AC-13 `concurrency` pada keempat workflow dan determinisme test realtime.
14. [x] AC-14 `strictTemplates` dan `angular-eslint`.
15. [x] AC-15 analisis bundle dan budget.
16. [ ] AC-16 proteksi branch `main` dengan check wajib; butuh akses admin repository.

Regresi `ESCAPE` MySQL pada dua nilai `sql_mode` yang dituntut AC-1 adalah
pekerjaan test, bukan pekerjaan build. Kodenya sudah benar dan terbukti pada
PostgreSQL nyata; yang kurang adalah buktinya. Rencananya ada di
[test.md](test.md#rencana-test) dan menjadi bukti wajib di [verify.md](verify.md).

## Consequences

- Perubahan AC-2 mengubah tipe nilai parameter yang dikirim ke driver dari
  `number` menjadi `string` untuk kolom integer dan exact numeric. Driver
  menyerahkan inferensi tipe ke engine, sehingga perilaku untuk nilai kecil tidak
  berubah.
- AC-3 menutup jalur yang sebelumnya diperbolehkan form edit, yaitu mengganti
  plugin tanpa mengisi password. Ini adalah perubahan perilaku yang disengaja.
- AC-12 menurunkan jumlah AC berstatus PASS pada matrix, karena PASS lama
  sebagiannya hanya pencocokan string. Penurunan itu adalah koreksi, bukan
  regresi.
- AC-14 memunculkan error template yang selama ini lolos. Error itu dibereskan
  dalam spec ini juga.
- AC-16 memuat kewajiban yang tidak bisa dituntaskan oleh perubahan kode, dan
  tetap terbuka sampai dibuktikan di luar repo. Selama AC-16 terbuka, feature 57
  tidak bisa dinyatakan `done`.
- AC-1 kini menuntut bukti yang belum ada. Bila regresi membuktikan bentuk MySQL
  gagal pada `NO_BACKSLASH_ESCAPES`, keputusan 2 berubah menjadi menyamakan kedua
  provider, dan perubahan itu dicatat sebagai revisi keputusan pada
  [rationale.md](rationale.md).

## Follow-up

Tidak dikerjakan di spec ini. Masing masing menunggu keputusan atau gelombangnya
sendiri.

1. **Tiga temuan Sedang yang paling mendesak dari triase**: SRV-3 (kolom data
   bernama `key` terbaca `[redacted]`), INF-4 (nama file backup bisa saling
   menimpa), dan SRV-5 (rate limit berbasis IP dapat dipalsukan). Ketiganya
   ditugaskan ke gelombang 2 dan butuh spec sendiri lewat `/architect`. SRV-3
   juga menuntut pembaruan kebijakan pada spec 0011 dan 0053.
2. **Sembilan temuan sisanya** dari
   [triase](rationale.md#triase-temuan-yang-dilewatkan-roadmap-audit), tersebar di
   gelombang 2 dan 3.
3. **Dua label severitas yang layak ditinjau**: DB-10 dan INF-11 berlabel Rendah,
   tetapi masing masing memuat bug kebenaran, yaitu COUNT yang dibangun dengan
   memotong teks SQL dan `transaction<T>` yang commit sebelum callback async
   selesai. Rinciannya ada di [rationale.md](rationale.md#catatan-dua-label-severitas-yang-layak-ditinjau).
4. **Klaim AC-4 pada spec 0056 tidak lagi terbukti.** Bagian 7 audit mencatat AC
   itu dinyatakan selesai padahal bocoran detail engine yang menjadi isinya masih
   ada. Kotaknya perlu dibuka kembali pada spec 0056 sesuai aturan integritas
   checklist.
5. **DOC-4 menyebut `AGENTS.md` menyimpang dari praktik**, antara lain menyatakan
   empat file per spec padahal seluruh spec punya lima. Perbaikan `AGENTS.md`
   dimiliki `/sync`, bukan spec ini.

## Rationale

Konteks lengkap, tiga opsi yang ditimbang untuk tiap keputusan, alasan
pemilihannya, triase 12 temuan yang dilewatkan roadmap audit, dan daftar sumber
ada di [rationale.md](rationale.md).
