# Plan 0056. Standar runtime Bun dan reaktivitas Angular

**Date**: 2026-08-30
**Spec status**: mengikuti [index.md](index.md)
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Aturan dokumen

- Dokumen planning ini disusulkan setelah spec berjalan. Isinya diturunkan dari `index.md`, `test.md`, `verify.md`, dan `docs/specs/ac-evidence-matrix.md`; file ini bukan sumber kebenaran baru.
- Status pada tabel di bawah adalah snapshot per 2026-08-30. Bila build plan, acceptance criteria, atau evidence berubah, perbarui tabel ini bersama file sumbernya.
- Status implementasi tidak boleh dinaikkan tanpa evidence pada `verify.md` atau matrix acceptance.

## Ringkasan progres

| Dimensi             | Nilai                                                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Status spec         | Accepted                                                                                                                                                                                         |
| Build plan          | 0 dari 7 langkah dinyatakan selesai (index.md memakai daftar Rollout tanpa checkbox, bukan section Build plan)                                                                                   |
| Acceptance criteria | 25 AC: 0 PASS, 0 PARTIAL, 25 BLOCKED                                                                                                                                                             |
| Verdict verifikasi  | Keputusan diratifikasi engineer pada 2026-08-29 (status Accepted), tetapi seluruh checklist bukti tetap kosong sampai benar benar dijalankan dan adopsi code mengikuti feature slice pada scope. |

## Rencana build dan status implementasi

Spec umbrella ini tidak memiliki section `## Build plan`; urutan adopsi per area diambil dari daftar **Rollout** pada `index.md` (Standard definition). Index.md tidak menyatakan status penyelesaian per langkah.

| #   | Langkah rencana                                                                               | AC terkait                               | Status           |
| --- | --------------------------------------------------------------------------------------------- | ---------------------------------------- | ---------------- |
| 1   | Mulai dari Bun SQL dan cancellation (area A)                                                  | AC-1, AC-2, AC-3, AC-4                   | Tidak dinyatakan |
| 2   | Lanjutkan Bun I/O (area B)                                                                    | AC-5, AC-6, AC-7                         | Tidak dinyatakan |
| 3   | Pecah ownership lifecycle Elysia (area D)                                                     | AC-8, AC-9, AC-10, AC-11                 | Tidak dinyatakan |
| 4   | Bangun traceability kontrak dan operation v2 untuk query serta generic jobs (area E)          | AC-12, AC-13, AC-14, AC-15, AC-16, AC-17 | Tidak dinyatakan |
| 5   | Migrasikan Angular resource facade dan zoneless per feature (area C)                          | AC-18, AC-19, AC-20                      | Tidak dinyatakan |
| 6   | Selaraskan komponen UI dengan foundation dan catat capability gap (area F)                    | AC-21, AC-22                             | Tidak dinyatakan |
| 7   | Jalankan cutover v2 satu kali setelah seluruh gate; rollback memakai artefak rilis sebelumnya | AC-23, AC-24, AC-25                      | Tidak dinyatakan |

## Rencana acceptance dan status evidence

| AC                     | Ringkasan kebutuhan                                                                                   | Test / proof ID                       | Status evidence          |
| ---------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------ |
| [AC-1](test.md#ac-1)   | Port query typed di `database-core` dengan `AbortSignal`; adapter Bun SQL hanya di provider           | `IT-0056-AC1`                         | Belum terbukti (BLOCKED) |
| [AC-2](test.md#ac-2)   | Cancellation nyata sampai mekanisme provider; state akhir jujur pada PostgreSQL dan MySQL nyata       | `IT-0056-AC2`                         | Belum terbukti (BLOCKED) |
| [AC-3](test.md#ac-3)   | Timeout dari config tervalidasi menghentikan kerja provider nyata; close dan retry bersih             | `IT-0056-AC3`                         | Belum terbukti (BLOCKED) |
| [AC-4](test.md#ac-4)   | `database-core` bebas I/O runtime; probe tools keluar core; `DatabaseEngine` kanonik tunggal          | `IT-0056-AC4`                         | Belum terbukti (BLOCKED) |
| [AC-5](test.md#ac-5)   | Asset dan artifact besar streaming, tulis atomik; abort atau gagal membersihkan partial artifact      | `IT-0056-AC5`                         | Belum terbukti (BLOCKED) |
| [AC-6](test.md#ac-6)   | Log sink asynchronous dengan backpressure; flush saat shutdown sebelum provider ditutup               | `IT-0056-AC6`                         | Belum terbukti (BLOCKED) |
| [AC-7](test.md#ac-7)   | Smoke binary membuktikan asset embedded dan directory mode; target tak tersedia dicatat blocked       | `SMOKE-0056-AC7`                      | Belum terbukti (BLOCKED) |
| [AC-8](test.md#ac-8)   | `app.ts` composition root murni; route group ke module factory; fixture dari factory yang sama        | `IT-0056-AC8`, `CT-0056-AC8`          | Belum terbukti (BLOCKED) |
| [AC-9](test.md#ac-9)   | Helper HTTP bersama tunggal menggantikan salinan per modul; perilaku dan kode error seragam           | `IT-0056-AC9`, `SEC-0056-AC9`         | Belum terbukti (BLOCKED) |
| [AC-10](test.md#ac-10) | Siklus import `apps/server` dan `apps/cli` putus; dependency cruiser menegakkan aturan boundary       | `IT-0056-AC10`                        | Belum terbukti (BLOCKED) |
| [AC-11](test.md#ac-11) | Shutdown terurut sesuai shared contract dan idempotent; request baru ditolak setelah fase stop        | `IT-0056-AC11`                        | Belum terbukti (BLOCKED) |
| [AC-12](test.md#ac-12) | Validator registry membuktikan traceability dua arah; drift gagal di CI                               | `CT-0056-AC12`                        | Belum terbukti (BLOCKED) |
| [AC-13](test.md#ac-13) | Operation resource v2 lengkap untuk query dan generic jobs; explain sinkron; `cancelling` terdefinisi | `CT-0056-AC13`                        | Belum terbukti (BLOCKED) |
| [AC-14](test.md#ac-14) | `Idempotency-Key` sesuai kontrak: snapshot sama, 409 reuse, record satu jam, restart 404              | `IT-0056-AC14`                        | Belum terbukti (BLOCKED) |
| [AC-15](test.md#ac-15) | Operation owner only; admin lewat audit; payload, error, event, log bebas secret; audit lengkap       | `SEC-0056-AC15`                       | Belum terbukti (BLOCKED) |
| [AC-16](test.md#ac-16) | Header `X-MyAdmin-API-Version` satu satunya pemilih kontrak; nilai tak dikenal ditolak                | `CT-0056-AC16`                        | Belum terbukti (BLOCKED) |
| [AC-17](test.md#ac-17) | WebSocket v2 mengikat version pada subscribe, envelope, dan reconnect; mismatch ditolak               | `IT-0056-AC17`                        | Belum terbukti (BLOCKED) |
| [AC-18](test.md#ac-18) | Read model via SDK resource facade dengan state lengkap; abort superseded bukan error                 | `UT-0056-AC18`, `E2E-0056-AC18`       | Belum terbukti (BLOCKED) |
| [AC-19](test.md#ac-19) | Gate zoneless per feature lulus; util pesan error tunggal; register pengecualian lengkap              | `UT-0056-AC19`                        | Belum terbukti (BLOCKED) |
| [AC-20](test.md#ac-20) | Aksesibilitas read model: `aria-busy`, live region polite, focus error summary, tanpa secret          | `E2E-0056-AC20`, `VIS-0056-AC20`      | Belum terbukti (BLOCKED) |
| [AC-21](test.md#ac-21) | Semua overlay dan dialog memakai Dialog foundation; slice pertama menutup modal dan jalur grid        | `E2E-0056-AC21`, `VIS-0056-AC21`      | Belum terbukti (BLOCKED) |
| [AC-22](test.md#ac-22) | Register capability gap lengkap: alasan, dampak, owner, review date, bukti WCAG AA per komponen       | `MANUAL-0056-AC22`                    | Belum terbukti (BLOCKED) |
| [AC-23](test.md#ac-23) | Setiap child memiliki pola kanonis, replaces, enforcement, rollout, exceptions tertulis               | `MANUAL-0056-AC23`                    | Belum terbukti (BLOCKED) |
| [AC-24](test.md#ac-24) | Baseline performa jalur panas tercatat sebelum dan sesudah migrasi; tanpa klaim tanpa ukur            | `PERF-0056-AC24`                      | Belum terbukti (BLOCKED) |
| [AC-25](test.md#ac-25) | Cutover v2 hanya setelah seluruh gate lulus; v1 dihapus satu rilis; rollback teruji atau blocked      | `SMOKE-0056-AC25`, `MANUAL-0056-AC25` | Belum terbukti (BLOCKED) |

## Follow-up

1. Setelah spec diratifikasi, daftarkan slice pertama pada scope sebagai pekerjaan cross cutting yang merujuk ke 0056. Jangan memasukkan daftar task atomic ke scope.
2. Perbaiki bug nama parameter `pageSize` versus `page-size` pada `/jobs` v1 (server, SDK, dan test kontrak) sebagai pekerjaan segera yang terpisah; jangan menunggu cutover v2 karena v1 masih permukaan yang dipakai.
3. Inventaris seluruh client query dan generic jobs sebelum cutover v2, termasuk client luar bila ada.
4. Tetapkan lokasi register pengecualian dan hubungkan setiap entry ke evidence matrix setelah implementation dimulai.
5. Periksa pointer skill `bun-sqlite` di `AGENTS.md`; path yang tercatat belum tersedia pada preflight ini.
6. Perubahan kontrak import, export, backup, dan restore tetap membutuhkan update pada spec feature masing masing.
7. Tambahkan retention matrix operation ke contract dan implementasi dengan ketentuan `query-execution` serta `job` terminal disimpan satu jam, idempotency record disimpan satu jam, dan restart menghasilkan 404 dengan pesan aman bahwa operation sudah berakhir karena server dimulai ulang.
8. Jalankan ulang `bun run matrix:ac` setelah perubahan ini dikomit; 25 AC baru spec 0056 akan muncul sebagai blocked, dan itu jujur karena implementasinya belum dimulai.
