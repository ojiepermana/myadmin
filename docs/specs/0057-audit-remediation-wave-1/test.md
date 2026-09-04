# Test dan acceptance criteria 0057. Remediasi audit gelombang 1

**Date**: 2026-09-04
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Belum dijalankan
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md) | [Plan](plan.md) | [Rationale](rationale.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0057.
- `index.md` memuat mirror acceptance criteria. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah lulus.
- Semua command dijalankan dari akar repo melalui satu `package.json`.

## Acceptance criteria

### AC-1

Klausa `ESCAPE` pada filter dan pencarian data browser menghasilkan satu karakter backslash pada teks SQL runtime untuk PostgreSQL, sehingga `standard_conforming_strings=on` menerimanya. MySQL mempertahankan bentuknya sendiri karena memproses escape backslash di dalam string literal, dan bentuk yang diterima itu dikunci oleh regresi yang dijalankan pada `sql_mode` default maupun `NO_BACKSLASH_ESCAPES`.

### AC-2

Nilai kolom integer dan exact numeric diteruskan ke driver tanpa kehilangan presisi, sehingga identitas baris dengan kunci di atas 2^53 mengenai tepat baris yang dimaksud pada kedua engine.

### AC-3

Perubahan principal MySQL menghasilkan tepat satu klausa autentikasi yang valid; mengganti `authPlugin` tanpa credential baru ditolak sebelum SQL dijalankan, sehingga tidak ada jalur yang mengosongkan password akun.

### AC-4

Pemetaan error PostgreSQL dan MySQL berbasis tabel sqlState dan errno yang diperiksa sebelum regex pesan; kode duplikat, error nilai, deadlock, dan unsupported terpetakan ke kategori yang benar.

### AC-5

Upload restore ditulis streaming tanpa membuffer seluruh file di memori, punya `expiresAt`, dibersihkan setelah restore selesai maupun gagal, dan punya `cleanup()` untuk upload kedaluwarsa.

### AC-6

Subprocess backup, restore, dan probe native tool menerima environment allowlist, bukan seluruh environment server; `MYADMIN_MASTER_KEY` dan variabel non allowlist tidak pernah sampai ke tool eksternal.

### AC-7

Nama database pada request backup divalidasi dengan aturan yang sama dengan jalur restore dan diteruskan setelah pemisah `--`, sehingga nilai berawalan `--` tidak pernah ditafsirkan sebagai opsi.

### AC-8

Ada satu modul `apps/server/src/http/` yang menyediakan `apiError` dan `jsonResponse`; seluruh route fitur memakainya, dan correlation id pada respons error sama dengan yang tercetak observability ke log.

### AC-9

Pesan sukses memakai channel `notice` terpisah yang dirender dengan `role="status"` dan gaya non destruktif; channel `error` dengan `role="alert"` hanya memuat kegagalan.

### AC-10

Aplikasi web mendeklarasikan `provideZonelessChangeDetection()` secara eksplisit, dan sisa debug (menu preview error boundary, placeholder nama contoh) tidak dikirim ke produksi.

### AC-11

Script test berjenjang: `test:fast` menjalankan unit dan integration tanpa spawn proses atau build; test yang membangun, membuka port, atau menjalankan suite bersarang berada di `tests/smoke/`; tidak ada test yang menulis ke file source yang di track git.

### AC-12

Matrix acceptance menurunkan PASS dari hasil test yang benar benar dijalankan dan lulus; test `skip` tidak menghitung; angka yang dikodekan keras dihapus; `matrix:ac --check` gagal bila file yang di commit menyimpang.

### AC-13

Seluruh workflow memakai `concurrency` dengan `cancel-in-progress`, dan test realtime deterministik pada runner hosted, yaitu berbasis kondisi dan bukan `setTimeout` tetap.

### AC-14

`strictTemplates` aktif untuk template Angular dan `angular-eslint` terpasang dengan aturan template; seluruh error yang muncul dibereskan sehingga `lint` dan `typecheck` tetap hijau.

### AC-15

Komposisi bundle produksi dianalisis dan tercatat lewat perintah yang dapat diulang, dan ukuran initial berkurang. Angka headroom tercatat bersama keputusan eksplisit tentang budget.

### AC-16

Branch `main` diproteksi dengan check wajib. Kewajiban ini tidak dapat dipenuhi oleh perubahan kode dan menuntut akses admin repository; buktinya adalah output `gh api repos/:owner/:repo/branches/main/protection`.

## Rencana test

| AC    | Test ID                                           | Kategori                | Command                                                                                 |
| ----- | ------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------- |
| AC-1  | `UT-0057-AC1`, `IT-0057-AC1`, `IT-0057-AC1-MYSQL` | Unit, Integration       | `bun test packages/database-postgresql/test`, `bun run test:database-mysql:integration` |
| AC-2  | `UT-0057-AC2`, `IT-0057-AC2`                      | Unit, Integration       | `bun test packages/database-*/test`                                                     |
| AC-3  | `UT-0057-AC3`, `IT-0057-AC3`                      | Unit, Integration       | `bun test packages/database-mysql/test`                                                 |
| AC-4  | `UT-0057-AC4`                                     | Unit                    | `bun test packages/database-*/test`                                                     |
| AC-5  | `UT-0057-AC5`                                     | Unit                    | `bun test packages/backup/test`                                                         |
| AC-6  | `UT-0057-AC6`                                     | Unit, Security          | `bun test packages/backup/test`                                                         |
| AC-7  | `UT-0057-AC7`                                     | Unit                    | `bun test packages/backup/test`                                                         |
| AC-8  | `UT-0057-AC8`, `IT-0057-AC8`                      | Unit, Integration       | `bun test apps/server/test`                                                             |
| AC-9  | `UT-0057-AC9`, `E2E-0057-AC9`                     | Unit, E2E               | `bun test apps/web/test`                                                                |
| AC-10 | `UT-0057-AC10`                                    | Unit                    | `bun test apps/web/test`                                                                |
| AC-11 | `MANUAL-0057-AC11`                                | Quality                 | `bun run test:fast`                                                                     |
| AC-12 | `UT-0057-AC12`                                    | Quality                 | `bun run matrix:ac --check`                                                             |
| AC-13 | `MANUAL-0057-AC13`                                | Quality                 | `bun run test:realtime`; inspeksi blok `concurrency`                                    |
| AC-14 | `MANUAL-0057-AC14`                                | Quality                 | `bun run lint && bun run typecheck`                                                     |
| AC-15 | `MANUAL-0057-AC15`                                | Operational             | `bun run build:web`                                                                     |
| AC-16 | `MANUAL-0057-AC16`                                | Operational (eksternal) | `gh api repos/:owner/:repo/branches/main/protection`                                    |

`UT-0057-AC13` adalah test baru yang belum ada. Ia memeriksa setiap file di `.github/workflows/` memuat blok `concurrency` dengan `cancel-in-progress`, sehingga separuh AC-13 yang dapat dimekanisasi berhenti bergantung pada inspeksi manual. Separuh sisanya, yaitu determinisme pada runner hosted, tetap menuntut run hosted yang hijau dan tidak dapat dibuktikan dari mesin lokal.

`IT-0057-AC1-MYSQL` adalah test baru yang belum ada. Ia menjalankan builder filter dan search terhadap MySQL disposable dua kali, sekali pada `sql_mode` default dan sekali dengan `NO_BACKSLASH_ESCAPES` aktif, lalu menuntut keduanya mengembalikan baris tanpa error. Test inilah yang menggantikan probe manual sebagai bukti sisi MySQL pada AC-1.

## Batas bukti

- AC-1, AC-2, AC-3 menuntut integration test terhadap PostgreSQL dan MySQL nyata untuk verdict penuh. Unit test bentuk SQL saja adalah PARTIAL.
- AC-1 tidak boleh dinyatakan PASS selama sisi MySQL hanya berdasar probe manual. `IT-0057-AC1-MYSQL` adalah syaratnya.
- AC-13 menuntut determinisme pada runner hosted. Lulus berulang di mesin lokal adalah PARTIAL, bukan PASS.
- AC-16 memuat kewajiban di luar repo. Kode saja tidak pernah cukup untuk PASS.
- AC-9 menuntut proof aksesibilitas di browser untuk verdict penuh.
