# Test dan acceptance criteria 0056. Standar runtime Bun dan reaktivitas Angular

**Date**: 2026-08-29
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Belum dijalankan
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0056.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID memakai konvensi bertipe `JENIS-0056-ACn` yang dibaca `bun run matrix:ac`. Test ID adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- AC dikelompokkan mengikuti child spec: area A sampai F. Satu AC memuat satu kepedulian supaya evidence per AC bisa penuh, bukan parsial menahun.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku.
- Semua command test dijalankan dari akar repo melalui satu `package.json`.

## Acceptance criteria

### AC-1

Area A. Port query typed tersedia di `database-core` dengan opsi `AbortSignal`; adapter Bun SQL hanya hidup di provider; tidak ada fabricated `TemplateStringsArray`, pemecahan placeholder `?` manual, atau `unsafe` di luar adapter; boundary check menolak import driver di core.

### AC-2

Area A. Cancellation nyata: `AbortSignal` dari request atau resource diteruskan sampai mekanisme cancel provider (`pg_cancel_backend`, `KILL QUERY`); state akhir jujur (`cancelled` atau `failed` sesuai hasil provider) pada PostgreSQL dan MySQL nyata; cancel idempotent dan race dengan terminal state terdefinisi.

### AC-3

Area A. Timeout bersumber dari config tervalidasi dan menghentikan kerja provider nyata, bukan `Promise.race` yang hanya membatasi penantian; close dan retry meninggalkan koneksi dalam keadaan bersih.

### AC-4

Area A. `database-core` bebas I/O runtime: probe native tools keluar dari core, field `format` backup menjadi nilai opaque yang dideklarasikan provider, dan definisi kanonik `DatabaseEngine` tunggal (paket lain menurunkan darinya).

### AC-5

Area B. Asset dan artifact besar disajikan serta ditulis sebagai stream (`Bun.file`, `stream`, sink) tanpa `readFile` penuh; penulisan atomik lewat temporary path; client abort, disk full, atau hash mismatch menutup source dan sink lalu menghapus partial artifact.

### AC-6

Area B. Log sink asynchronous dengan backpressure; tidak ada penulisan sync pada request path yang sudah dimigrasikan; sink di flush saat shutdown sebelum provider ditutup.

### AC-7

Area B. Smoke binary membuktikan asset embedded dan directory mode bekerja pada target rilis yang tersedia; target yang tidak tersedia dicatat blocked.

### AC-8

Area D. `app.ts` menjadi composition root murni; route group yang masih inline pindah ke module factory per fitur; contract fixture dibangun dari factory yang sama dengan production sehingga tidak ada wiring duplikat yang bisa drift.

### AC-9

Area D. Helper HTTP bersama tunggal (cookie sesi, CSRF dan same origin, `apiError` dengan correlationId dari observability, pemetaan `DbError` ke status dan kode, paginasi) menggantikan salinan per modul route; perilaku CSRF dan kode error seragam di seluruh route.

### AC-10

Area D. Siklus import antara `apps/server` dan `apps/cli` putus (modul runtime assets pindah ke `packages/*`); dependency cruiser menegakkan `no-circular`, larangan import antar `apps/*`, larangan `packages/*` mengimport `apps/*`, larangan driver npm di core, dan larangan deep import lintas package.

### AC-11

Area D. Shutdown mengikuti urutan shared contract dan idempotent: request baru ditolak setelah fase stop dimulai; timer, WebSocket, sink, dan provider tertutup; cleanup boleh dipanggil lebih dari sekali tanpa mengulang efek.

### AC-12

Area E. Validator registry membuktikan traceability dua arah kontrak dan implementasi termasuk nama query parameter, schema requestBody, schema response per status, version header, dan event mapping; drift membuat CI gagal.

### AC-13

Area E. Operation resource v2 memuat schema lengkap (`id`, `kind`, `jobType`, `state`, `progress`, `createdAt`, `startedAt`, `cancelRequestedAt`, `endedAt`, `updatedAt`, `result`, `error`, `cancellable`, `cancel`) untuk query dan generic jobs; explain tetap sinkron sesuai spec 0035; pemetaan state `cancelling` terhadap state machine job spec 0028 terdefinisi.

### AC-14

Area E. `Idempotency-Key`: retry dengan key dan body sama mengembalikan snapshot sama; key sama dengan body berbeda menghasilkan `409 IDEMPOTENCY_KEY_REUSED`; record disimpan satu jam; setelah restart operation lama menghasilkan `404 OPERATION_RESTARTED` dengan pesan aman.

### AC-15

Area E. Hanya owner yang dapat membaca atau membatalkan operation; admin mengamati metadata lewat audit; payload, error, event, dan log bebas SQL rahasia, credential, token, dan isi data; command serta hasil akhir diaudit dengan actor, target, version header, dan correlationId setelah redaction.

### AC-16

Area E. Header `X-MyAdmin-API-Version` adalah satu satunya pemilih kontrak untuk permukaan yang dimigrasikan; segmen `v1` pada base path `/api/v1` dibekukan sebagai base path, bukan penanda versi kontrak; nilai header tidak dikenal selalu ditolak; contract test v1 dan v2 lulus selama persiapan; setelah cutover, request tanpa header v2 pada permukaan yang dimigrasikan ditolak.

### AC-17

Area E. WebSocket v2 mengikat version pada subscribe; envelope event membawa version yang sama; reconnect mengulang version; version mismatch ditolak; tidak ada event v1 yang dikirim pada connection v2.

### AC-18

Area C. Read model feature memakai SDK resource facade dengan state `loading`, `ready`, `empty`, `refreshing`, `stale`, `error` sesuai kontrak read model; abort karena request lama digantikan tidak dirender sebagai error; pesan sukses dan pesan error memakai channel berbeda (status untuk sukses, alert untuk error).

### AC-19

Area C. Gate zoneless per feature lulus: semua perubahan yang dirender berasal dari signal, resource, event Angular, atau change detection trigger eksplisit; util pesan error tunggal di `core/errors` menggantikan salinan per feature; register pengecualian terisi lengkap untuk feature yang belum lulus.

### AC-20

Area C. Aksesibilitas read model: `aria-busy` aktif pada `loading` dan `refreshing`; completion, cancellation, failure, dan stale diumumkan lewat live region polite; focus berpindah ke error summary hanya setelah aksi user; tidak ada announcement yang memuat secret.

### AC-21

Area F. Semua overlay dan dialog memakai Dialog foundation (focus trap, Escape, pengembalian focus); slice pertama menutup modal drop database dan schema, jalur keyboard untuk edit sel grid (Enter atau F2), dan roving tabindex pada result grid.

### AC-22

Area F. Register capability gap terisi: setiap custom component punya entry audit gap dengan alasan, dampak, owner, review date, dan bukti WCAG AA.

### AC-23

Lintas area. Setiap child spec memiliki pola kanonis, pola yang diganti, enforcement, rollout, dan pengecualian yang tertulis; setiap exception yang dipakai implementasi tercatat dengan alasan, dampak, owner, test, dan tanggal tinjau.

### AC-24

Lintas area. Baseline performa jalur panas dicatat sebelum dan sesudah migrasi; tidak ada klaim peningkatan performa tanpa pengukuran.

### AC-25

Lintas area. Cutover v2 hanya dilakukan setelah seluruh gate lulus; v1 dihapus dalam satu rilis; rollback memakai artefak rilis sebelumnya dan teruji, atau dicatat blocked dengan alasan environment.

## Matriks cakupan

| AC              | Unit           | Integration    | Contract       | E2E             | Security        | Performance      | Visual          | Smoke             | Manual atau external |
| --------------- | -------------- | -------------- | -------------- | --------------- | --------------- | ---------------- | --------------- | ----------------- | -------------------- |
| [AC-1](#ac-1)   | n/a            | `IT-0056-AC1`  | n/a            | n/a             | n/a             | n/a              | n/a             | n/a               | n/a                  |
| [AC-2](#ac-2)   | n/a            | `IT-0056-AC2`  | n/a            | n/a             | n/a             | n/a              | n/a             | n/a               | n/a                  |
| [AC-3](#ac-3)   | n/a            | `IT-0056-AC3`  | n/a            | n/a             | n/a             | n/a              | n/a             | n/a               | n/a                  |
| [AC-4](#ac-4)   | n/a            | `IT-0056-AC4`  | n/a            | n/a             | n/a             | n/a              | n/a             | n/a               | n/a                  |
| [AC-5](#ac-5)   | n/a            | `IT-0056-AC5`  | n/a            | n/a             | n/a             | n/a              | n/a             | n/a               | n/a                  |
| [AC-6](#ac-6)   | n/a            | `IT-0056-AC6`  | n/a            | n/a             | n/a             | n/a              | n/a             | n/a               | n/a                  |
| [AC-7](#ac-7)   | n/a            | n/a            | n/a            | n/a             | n/a             | n/a              | n/a             | `SMOKE-0056-AC7`  | n/a                  |
| [AC-8](#ac-8)   | n/a            | `IT-0056-AC8`  | `CT-0056-AC8`  | n/a             | n/a             | n/a              | n/a             | n/a               | n/a                  |
| [AC-9](#ac-9)   | n/a            | `IT-0056-AC9`  | n/a            | n/a             | `SEC-0056-AC9`  | n/a              | n/a             | n/a               | n/a                  |
| [AC-10](#ac-10) | n/a            | `IT-0056-AC10` | n/a            | n/a             | n/a             | n/a              | n/a             | n/a               | n/a                  |
| [AC-11](#ac-11) | n/a            | `IT-0056-AC11` | n/a            | n/a             | n/a             | n/a              | n/a             | n/a               | n/a                  |
| [AC-12](#ac-12) | n/a            | n/a            | `CT-0056-AC12` | n/a             | n/a             | n/a              | n/a             | n/a               | n/a                  |
| [AC-13](#ac-13) | n/a            | n/a            | `CT-0056-AC13` | n/a             | n/a             | n/a              | n/a             | n/a               | n/a                  |
| [AC-14](#ac-14) | n/a            | `IT-0056-AC14` | n/a            | n/a             | n/a             | n/a              | n/a             | n/a               | n/a                  |
| [AC-15](#ac-15) | n/a            | n/a            | n/a            | n/a             | `SEC-0056-AC15` | n/a              | n/a             | n/a               | n/a                  |
| [AC-16](#ac-16) | n/a            | n/a            | `CT-0056-AC16` | n/a             | n/a             | n/a              | n/a             | n/a               | n/a                  |
| [AC-17](#ac-17) | n/a            | `IT-0056-AC17` | n/a            | n/a             | n/a             | n/a              | n/a             | n/a               | n/a                  |
| [AC-18](#ac-18) | `UT-0056-AC18` | n/a            | n/a            | `E2E-0056-AC18` | n/a             | n/a              | n/a             | n/a               | n/a                  |
| [AC-19](#ac-19) | `UT-0056-AC19` | n/a            | n/a            | n/a             | n/a             | n/a              | n/a             | n/a               | n/a                  |
| [AC-20](#ac-20) | n/a            | n/a            | n/a            | `E2E-0056-AC20` | n/a             | n/a              | `VIS-0056-AC20` | n/a               | n/a                  |
| [AC-21](#ac-21) | n/a            | n/a            | n/a            | `E2E-0056-AC21` | n/a             | n/a              | `VIS-0056-AC21` | n/a               | n/a                  |
| [AC-22](#ac-22) | n/a            | n/a            | n/a            | n/a             | n/a             | n/a              | n/a             | n/a               | `MANUAL-0056-AC22`   |
| [AC-23](#ac-23) | n/a            | n/a            | n/a            | n/a             | n/a             | n/a              | n/a             | n/a               | `MANUAL-0056-AC23`   |
| [AC-24](#ac-24) | n/a            | n/a            | n/a            | n/a             | n/a             | `PERF-0056-AC24` | n/a             | n/a               | n/a                  |
| [AC-25](#ac-25) | n/a            | n/a            | n/a            | n/a             | n/a             | n/a              | n/a             | `SMOKE-0056-AC25` | `MANUAL-0056-AC25`   |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

| ID             | AC              | Fokus                     | Scenario terencana                                                                                                          | Expected result                                                              |
| -------------- | --------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `UT-0056-AC18` | [AC-18](#ac-18) | Lifecycle resource facade | Focused DOM test: transisi loading, ready, empty, refreshing, stale, error; abort superseded; channel sukses vs error       | Semua state dirender sesuai kontrak, abort superseded tidak jadi error       |
| `UT-0056-AC19` | [AC-19](#ac-19) | Gate zoneless per feature | Focused DOM test tanpa zone.js: callback external, timer, form, reconnect memicu render lewat signal atau trigger eksplisit | Tidak ada behavior yang bergantung Zone.js; util pesan error tunggal dipakai |

## Integration test

| ID             | AC              | Fokus                       | Scenario terencana                                                                                                          | Expected result                                                                |
| -------------- | --------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `IT-0056-AC1`  | [AC-1](#ac-1)   | Port dan adapter Bun SQL    | Typecheck plus boundary check pada fixture pelanggaran (driver di core, `unsafe` di luar adapter)                           | Pelanggaran terdeteksi; jalur sah lulus                                        |
| `IT-0056-AC2`  | [AC-2](#ac-2)   | Cancel nyata dua engine     | Query panjang dibatalkan lewat `AbortSignal` pada PostgreSQL dan MySQL disposable; cancel ganda; race dengan selesai normal | Kerja provider berhenti; state akhir `cancelled` atau `failed`; idempotent     |
| `IT-0056-AC3`  | [AC-3](#ac-3)   | Timeout dari config         | Query melebihi timeout config pada engine nyata                                                                             | Kerja provider dihentikan, koneksi bersih setelah close dan retry              |
| `IT-0056-AC4`  | [AC-4](#ac-4)   | Netralitas database-core    | Boundary dan typecheck: core tanpa I/O runtime, `format` opaque, `DatabaseEngine` kanonik tunggal                           | Tidak ada kebocoran provider atau I/O di core                                  |
| `IT-0056-AC5`  | [AC-5](#ac-5)   | Streaming artifact besar    | File besar disajikan dan ditulis via stream; abort di tengah; disk full disimulasikan                                       | Memory datar; partial artifact terhapus; error aman                            |
| `IT-0056-AC6`  | [AC-6](#ac-6)   | Log sink async              | Beban log pada request path; shutdown di tengah beban                                                                       | Tidak ada tulis sync di request path; sink ter flush sebelum provider tutup    |
| `IT-0056-AC8`  | [AC-8](#ac-8)   | Composition factory tunggal | Production dan contract fixture dirakit dari factory yang sama; route terdaftar identik                                     | Tidak ada wiring duplikat; daftar route kedua assembly sama                    |
| `IT-0056-AC9`  | [AC-9](#ac-9)   | Helper HTTP bersama         | Uji perilaku CSRF, kode error, correlationId, dan paginasi lewat helper bersama pada beberapa route                         | Perilaku seragam; correlationId response cocok dengan log                      |
| `IT-0056-AC10` | [AC-10](#ac-10) | Aturan boundary baru        | Fixture pelanggaran: siklus, import antar apps, packages ke apps, driver di core, deep import                               | Setiap pelanggaran membuat check gagal dengan pesan aturan                     |
| `IT-0056-AC11` | [AC-11](#ac-11) | Shutdown terurut idempotent | Shutdown saat ada operation aktif, timer, WebSocket, dan stream terbuka; cleanup dipanggil dua kali                         | Urutan sesuai kontrak; request baru ditolak; tanpa efek ganda                  |
| `IT-0056-AC14` | [AC-14](#ac-14) | Idempotency dan retention   | Retry key sama, body beda, kadaluarsa satu jam, restart proses                                                              | Snapshot sama; `409 IDEMPOTENCY_KEY_REUSED`; `404 OPERATION_RESTARTED`         |
| `IT-0056-AC17` | [AC-17](#ac-17) | Version binding WebSocket   | Subscribe v2, reconnect, mismatch, dan connection campuran                                                                  | Version terikat dan diulang; mismatch ditolak; tanpa event v1 di connection v2 |

## Test tambahan

### Contract test

| ID             | AC              | Fokus                          | Scenario terencana                                                                                                           | Expected result                                                     |
| -------------- | --------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `CT-0056-AC8`  | [AC-8](#ac-8)   | Kontrak pada wiring production | Contract test berjalan pada assembly dari factory production                                                                 | Bukti kontrak berlaku untuk wiring yang dirilis                     |
| `CT-0056-AC12` | [AC-12](#ac-12) | Traceability penuh             | Registry membandingkan kontrak dan implementasi: path, method, nama query parameter, requestBody, response per status, event | Drift apa pun membuat test gagal dengan pesan yang menyebut operasi |
| `CT-0056-AC13` | [AC-13](#ac-13) | Schema operation resource      | Response query dan jobs v2 divalidasi AJV terhadap schema operation; explain divalidasi tetap sinkron                        | Schema lengkap dan seragam; pemetaan `cancelling` terdefinisi       |
| `CT-0056-AC16` | [AC-16](#ac-16) | Aturan version header          | Tanpa header, header v2, header tidak dikenal, pada fase persiapan dan pasca cutover                                         | Perilaku sesuai fase; nilai tidak dikenal selalu ditolak            |

### E2E

| ID              | AC              | Fokus                      | Scenario terencana                                                                                             | Expected result                                           |
| --------------- | --------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `E2E-0056-AC18` | [AC-18](#ac-18) | Read model di browser      | Alur loading, empty, error, refresh, stale, cancel pada fitur nyata                                            | State dan nilai lama dipertahankan sesuai kontrak         |
| `E2E-0056-AC20` | [AC-20](#ac-20) | Aksesibilitas read model   | Periksa `aria-busy`, live region, focus setelah aksi user, isi announcement                                    | Semua perilaku aksesibilitas sesuai kontrak, tanpa secret |
| `E2E-0056-AC21` | [AC-21](#ac-21) | Dialog dan grid foundation | Keyboard only: buka modal drop, Escape, focus restore; edit sel lewat Enter atau F2; Tab keluar grid satu stop | Semua jalur keyboard bekerja tanpa mouse                  |

### Security

| ID              | AC              | Fokus                             | Scenario terencana                                                                      | Expected result                                    |
| --------------- | --------------- | --------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `SEC-0056-AC9`  | [AC-9](#ac-9)   | Keseragaman guard HTTP            | Mutasi tanpa CSRF, origin salah, sesi kadaluarsa pada route yang memakai helper bersama | Ditolak seragam dengan kode error yang sama        |
| `SEC-0056-AC15` | [AC-15](#ac-15) | Ownership dan redaction operation | User lain membaca dan membatalkan operation; audit admin; inspeksi payload, event, log  | Owner only ditegakkan; tanpa secret; audit lengkap |

### Performance

| ID               | AC              | Fokus                | Scenario terencana                                                         | Expected result                                             |
| ---------------- | --------------- | -------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `PERF-0056-AC24` | [AC-24](#ac-24) | Baseline jalur panas | Ukur jalur panas sebelum dan sesudah migrasi (query, streaming asset, log) | Baseline tercatat; regresi terlihat; tanpa klaim tanpa ukur |

### Visual dan accessibility

| ID              | AC              | Fokus                          | Scenario terencana                                                          | Expected result                    |
| --------------- | --------------- | ------------------------------ | --------------------------------------------------------------------------- | ---------------------------------- |
| `VIS-0056-AC20` | [AC-20](#ac-20) | Bukti visual read model        | Screenshot state loading, empty, stale notice, error pada viewport terkunci | Bukti visual tercatat dan direview |
| `VIS-0056-AC21` | [AC-21](#ac-21) | Bukti visual dialog foundation | Screenshot modal drop dengan focus trap dan indikator focus                 | Bukti visual tercatat dan direview |

### Smoke dan operational acceptance

| ID                | AC              | Fokus                   | Scenario terencana                                                                           | Expected result                                          |
| ----------------- | --------------- | ----------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `SMOKE-0056-AC7`  | [AC-7](#ac-7)   | Asset pada binary rilis | Jalankan binary tiap target tersedia; akses asset embedded dan directory mode                | Asset tersaji benar; target tak tersedia dicatat blocked |
| `SMOKE-0056-AC25` | [AC-25](#ac-25) | Gate cutover            | Jalankan seluruh gate lalu cutover pada build rilis; verifikasi v1 terhapus dan header wajib | Cutover hanya lolos setelah semua gate hijau             |

### Manual atau external proof

| ID                 | AC              | Fokus                          | Scenario terencana                                                                                | Expected result                                                  |
| ------------------ | --------------- | ------------------------------ | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `MANUAL-0056-AC22` | [AC-22](#ac-22) | Review register capability gap | Baca setiap entry custom component                                                                | Entry lengkap: alasan, dampak, owner, review date, bukti WCAG AA |
| `MANUAL-0056-AC23` | [AC-23](#ac-23) | Review kelengkapan child spec  | Baca enam child: pola kanonis, replaces, enforcement, rollout, exceptions; cek register exception | Semua bagian ada dan exception tercatat lengkap                  |
| `MANUAL-0056-AC25` | [AC-25](#ac-25) | Rollback artefak               | Uji rollback ke artefak rilis sebelumnya atau catat blocked beralasan                             | Prosedur rollback terbukti atau blocked jujur                    |

## Critical test scenarios

- Query berjalan lama dibatalkan dari UI: provider berhenti nyata, state `cancelled`, event WebSocket konsisten, verifikasi **AC-2**, **AC-13**, **AC-17**.
- Cancel dua kali lalu retry command dengan `Idempotency-Key` sama: tidak ada operation kedua, snapshot identik, verifikasi **AC-2**, **AC-14**.
- Export artifact besar lalu client abort di tengah: stream berhenti, partial artifact hilang, error aman, verifikasi **AC-5**.
- Shutdown saat query aktif dan stream terbuka: urutan kontrak dijalankan, request baru ditolak, cleanup idempotent, verifikasi **AC-11**, **AC-6**.
- Header version tidak dikenal ditolak pada fase persiapan dan pasca cutover, verifikasi **AC-16**.
- User lain mencoba membaca dan membatalkan operation milik orang lain: ditolak; admin hanya melihat metadata via audit, verifikasi **AC-15**.
- Refresh gagal setelah ada value: UI menampilkan stale notice, value lama bertahan, live region mengumumkan tanpa secret, verifikasi **AC-18**, **AC-20**.
- Pengguna keyboard menghapus database lewat modal drop tanpa mouse, lalu batal dengan Escape dan focus kembali, verifikasi **AC-21**.

## Staged, environment, dan external proof

- Bukti AC-2, AC-3, AC-14, AC-17 membutuhkan PostgreSQL dan MySQL disposable dengan versi terpin (lane `tests/environments/`).
- Bukti AC-7 dan AC-25 membutuhkan target binary rilis spec 0054; target yang tidak tersedia pada host dicatat blocked, bukan diklaim lulus.
- Test unit atau build yang lulus pada host developer tidak membuktikan database nyata, browser, binary target, atau cancellation provider. Evidence jenis itu tetap blocked sampai environment yang sesuai dijalankan.

## Fixture dan environment

| Area         | Aturan                                                                                                         |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| Data         | Gunakan data sintetis atau tersanitasi. Jangan memakai credential, token, atau data produksi nyata.            |
| Resource     | Database, file, port, process, dan container harus disposable serta memiliki cleanup deterministik.            |
| Version      | Pin versi environment yang dibuktikan. Jangan memakai label dinamis seperti `latest` sebagai bukti acceptance. |
| Root command | Instalasi dan command test selalu dimulai dari akar repo dan satu `package.json`.                              |

## Exit criteria test

- Setiap AC memiliki test ID atau jalur proof yang eksplisit pada [verify.md](verify.md).
- Test yang tidak relevan ditandai `n/a` dengan alasan yang tetap benar setelah implementasi.
- External proof tidak boleh diganti local smoke test. Staged proof tidak boleh ditutup sebelum dependency yang disebut tersedia.
- Tidak ada test yang dianggap lulus hanya karena file atau placeholder tersedia.
