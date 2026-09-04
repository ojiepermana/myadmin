# Audit codebase MyAdmin

**Tanggal:** 2026-09-04
**Basis:** commit `abe2aa9` di `main`
**Cakupan:** `apps/*`, `packages/*`, `tests/*`, `scripts/*`, `tooling/*`, workflow CI, `docs/*`, `plan/*`
**Tujuan:** menilai kesehatan arsitektur dan proses, lalu memberi arah perbaikan supaya aplikasi tetap mudah dirawat ketika fitur, provider, dan kontributor bertambah.

Cara membaca dokumen ini: bagian 1 adalah ringkasan. Bagian 4 memuat temuan dengan bukti `file:baris`. Bagian 5 dan 6 adalah arah arsitektur dan roadmap. Bagian 7 memetakan temuan ke spec 0056 yang sudah diratifikasi. Bagian 8 menjelaskan metode dan batasan audit.

## 1. Ringkasan

- **Fondasi teknis kuat.** TypeScript strict tanpa `any`, boundary dependency ditegakkan oleh dependency cruiser, OpenAPI menjadi sumber kebenaran dengan drift check, kriptografi vault dan hashing password benar, dan semua gate lokal hijau.
- **Masalah utama untuk skala adalah duplikasi struktural.** Cangkang HTTP (cookie, CSRF, error, paginasi) disalin ke 12 sampai 13 file route server dan sudah saling berbeda. Builder data browser dan table designer disalin di dua provider (sekitar 700 baris identik). Pemuatan daftar koneksi disalin di 10 halaman web. Setiap fitur baru menambah salinan baru, bukan memakai yang ada.
- **Tiga bug runtime layak diperbaiki sekarang.** Filter dan pencarian data browser PostgreSQL gagal karena `ESCAPE` dua backslash (DB-1). Identitas baris kehilangan presisi untuk bigint di atas 2^53 sehingga UPDATE atau DELETE bisa mengenai baris tetangga (DB-2). Edit principal MySQL dengan `authPlugin` bisa menghasilkan akun tanpa password (DB-3).
- **Proses pembuktian tidak sekuat klaimnya.** Matrix evidence hanya mencocokkan token ID di file sumber dan tidak menjalankan test. Branch `main` tidak diproteksi. CI hosted pernah gagal dan pernah dibatalkan pada SHA yang sama dengan run yang lolos.
- **Bobot dokumentasi tinggi.** 33.420 baris markdown untuk 52.499 baris kode produksi. Dari 275 commit, 149 bertipe `docs` dan 61 bertipe `feat`. Satu perubahan acceptance criteria menyentuh sedikitnya enam file, tiga di antaranya salinan manual.
- **Spec 0056 sudah memuat arah yang tepat**, tetapi baru 2 dari 25 AC terbukti dan 0 dari 7 langkah rollout selesai. Roadmap di bagian 6 menyusun ulang prioritasnya berdasarkan bukti audit ini.

## 2. Profil kuantitatif

| Ukuran                                                 | Nilai                                                                                                     |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Kode produksi TypeScript (tanpa test, tanpa generated) | 52.499 baris                                                                                              |
| Template HTML Angular                                  | 7.719 baris                                                                                               |
| Modul source                                           | 23 package di `packages/*`, 3 app di `apps/*`                                                             |
| Spec                                                   | 56 folder, tiap folder 5 file (`index`, `plan`, `relation`, `test`, `verify`)                             |
| Dokumentasi markdown (`docs/` dan `plan/`)             | 33.420 baris dalam 338 file                                                                               |
| Commit                                                 | 275 dalam 3 hari kalender (28 sampai 30 Agustus 2026), satu penulis, semua di `main`, 0 merge, 0 tag      |
| Jenis commit                                           | docs 149, feat 61, test 38, fix 16, chore 7, refactor 1                                                   |
| Hasil `bun run test`                                   | 642 test di 152 file, 624 lulus, 18 skip, 0 gagal, 59 detik untuk `bun test`, 66 detik total dengan build |
| File test                                              | 185, termasuk 33 spec Playwright                                                                          |
| Gate lokal                                             | lint 3,9 s, typecheck 3,7 s, boundaries 0,8 s, format 5,2 s, semua lulus                                  |
| Bundle produksi initial (raw)                          | 893,99 kB dari batas warning 900 kB dan error 1 MB                                                        |
| `any`, `@ts-ignore`, `eslint-disable`, `TODO`          | 0                                                                                                         |
| `as unknown as`                                        | 25 lokasi, sekitar setengahnya di file test                                                               |
| File terbesar                                          | `apps/server/src/app.ts` 2.012 baris, `connection-manager.ts` 1.835, `packages/import/src/index.ts` 1.205 |
| File paling sering berubah                             | `docs/scope/scope.md` 64 kali, `apps/server/src/app.ts` 35 kali, `openapi.ts` generated 31 kali           |

## 3. Yang sudah baik dan perlu dipertahankan

- **Disiplin tipe.** `strict`, `noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`, dan nol `any` di 52 ribu baris.
- **Boundary yang ditegakkan.** `tooling/dependency-cruiser.cjs` melarang siklus, deep import lintas package, package mengimpor app, core mengimpor provider atau driver. Tiap aturan mengutip AC spec. Hasil cruise: 425 modul, 0 pelanggaran.
- **Kontrak sebagai sumber kebenaran.** Tipe digenerate dari OpenAPI dan dicek drift di CI. `tests/contract/contract.test.ts` menuntut kecocokan satu ke satu antara operation OpenAPI dan route Elysia. Matrix otorisasi digenerate dari OpenAPI dan diuji sebagai anonymous, user, admin.
- **Kriptografi dan sesi.** AES-256-GCM per kredensial dengan nonce acak dan AAD `connectionId`, Argon2id dengan rehash saat login, master key 0600 dibuat atomik, token sesi 256 bit disimpan sebagai hash, timeout idle dan absolut ditegakkan.
- **Integritas data internal.** Migrasi SQLite berurutan dengan checksum SHA-256 (mengubah migrasi yang sudah diterapkan menggagalkan boot), tabel audit append only lewat trigger, transaksi dengan savepoint.
- **Seam yang bisa diuji.** Service server bergantung pada `Pick<>` dan port, adapter provider menerima `sqlFactory` palsu, `testkit` menyediakan fake untuk tiap port repository.
- **Realtime hub.** Batas socket per user, batas subscription per socket, heartbeat, backpressure, dan scoping per pemilik.
- **Kebersihan proses.** Conventional commits dengan commitlint, lint staged di pre commit, generator changelog, kebijakan keamanan tertulis.

## 4. Temuan

Skala severitas:

- **Kritis**: klaim proses yang salah atau bug aktif yang merusak data atau keamanan.
- **Tinggi**: bug laten pada jalur pengguna, atau biaya maintenance yang tumbuh pada setiap fitur baru.
- **Sedang**: kerusakan terbatas, atau utang yang mengganggu tetapi belum menghambat.
- **Rendah**: kebersihan.

Tiap temuan memuat bukti, dampak, dan perbaikan. Effort: S di bawah satu hari, M satu sampai tiga hari, L satu minggu atau lebih.

### 4.1 Bug runtime dan keamanan

**DB-1 · Tinggi · Filter dan pencarian data browser PostgreSQL gagal di runtime**
Bukti: `packages/database-postgresql/src/data.ts:291` dan `:322` memakai template literal berisi `ESCAPE '\\\\'`. String runtime menjadi `ESCAPE '\\'` (dua karakter). PostgreSQL dengan `standard_conforming_strings=on` menolak dengan `invalid escape string`. Modul metadata sudah benar di `metadata/index.ts:822` karena memakai string biasa dengan satu backslash. Unit test hanya memeriksa `toContain('ILIKE ?')` (`packages/database-postgresql/test/data.test.ts:50`) dan tidak ada integration test yang memakai `filters` atau `search`.
Dampak: filter `contains`, `startsWith`, `endsWith`, dan pencarian teks pada tabel PostgreSQL menghasilkan error 500. Klaim verifikasi jalur ini di `docs/specs/0037-data-browser-read/verify.md` tidak valid.
Perbaikan: samakan dengan modul metadata (satu backslash pada string runtime), tambah integration test filter dan search pada PostgreSQL nyata. Effort S.

**DB-2 · Tinggi · Identitas baris kehilangan presisi sehingga UPDATE atau DELETE bisa mengenai baris lain**
Bukti: `writeValue` mengonversi sel numerik dengan `Number(cell.value)` (`packages/database-postgresql/src/data.ts:113`, `packages/database-mysql/src/data.ts:90`) dan hasilnya dipakai `identityWhere` sebagai kunci WHERE (`pg:165`, `my:141`). Nilai `9007199254740993` menjadi `9007199254740992`.
Dampak: primary key bigint gaya snowflake di atas 2^53 mengubah atau menghapus baris tetangga. Pemeriksaan `RETURNING` dan `ROW_COUNT` tidak bisa mendeteksinya karena satu baris memang terkena.
Perbaikan: teruskan nilai numerik sebagai string ke driver untuk kolom integer besar, tambah test dengan kunci di atas 2^53 pada kedua engine. Effort S.

**DB-3 · Tinggi · Edit principal MySQL dengan `authPlugin` bisa menghasilkan akun tanpa password**
Bukti: `compileOptions` menghasilkan `IDENTIFIED WITH '<plugin>'` tanpa `BY` (`packages/database-mysql/src/security/index.ts:271-279`) dan form edit mengekspos `authPlugin`. Semantik MySQL untuk `ALTER USER ... IDENTIFIED WITH plugin` tanpa `BY` adalah mengosongkan kredensial. `createPrincipal` menggabungkan `IDENTIFIED BY '...' IDENTIFIED WITH '...'` (`:357-359`) yang merupakan dua auth option berurutan dan gagal parse.
Dampak: akun database bisa login tanpa password setelah edit plugin. Integration test yang relevan di skip (`tests/integration/mysql/provider.test.ts:154`).
Perbaikan: susun satu klausa `IDENTIFIED WITH plugin BY 'password'`, tolak perubahan plugin tanpa kredensial baru, konfirmasi pada MySQL disposable. Effort S.

**INF-1 · Tinggi · Upload restore dibuffer penuh dan tidak pernah dibersihkan**
Bukti: `packages/backup/src/restore.ts:157` menulis `new Uint8Array(await file.arrayBuffer())` untuk file sampai 512 MB. `remove` hanya dipanggil pada jalur validasi gagal (`:253`), tidak setelah restore selesai, dan tidak ada timer expiry. Import sudah streaming dan punya expiry (`packages/import/src/index.ts:223-240,296-313`).
Dampak: user terautentikasi bisa memenuhi `restore-uploads/` dan memori server dengan upload paralel.
Perbaikan: pakai pola `ImportUploadStore` (streaming, expiry, cleanup), hapus upload setelah restore. Effort S.

**INF-2 · Sedang · Subprocess mewarisi seluruh environment server**
Bukti: `packages/backup/src/executor.ts:51` dan `restore-executor.ts:52` memakai `env: { ...processEnv(), ...plan.env }`. `packages/native-tools/src/index.ts:26` memanggil `Bun.spawn` tanpa `env` sehingga mewarisi default.
Dampak: bila operator memakai `MYADMIN_MASTER_KEY`, `pg_dump`, `mysqldump`, `psql`, `mysql`, dan tool yang dikonfigurasi operator menerima master key.
Perbaikan: whitelist `PATH`, `HOME`, `LANG`, `TMPDIR`, dan variabel tool yang memang dibutuhkan. Effort S.

**INF-3 · Sedang · Nama database dikirim posisional ke `mysqldump` tanpa pemisah**
Bukti: `packages/database-mysql/src/backup.ts:154` menambahkan `request.database` sebagai argumen terakhir. `normalizeCreateInput` hanya memastikan string tidak kosong (`packages/backup/src/backup-service.ts:515-539`). Jalur restore sudah memvalidasi (`restore.ts:640`), jalur backup belum.
Dampak: nilai yang diawali `--` ditafsirkan klien MySQL sebagai opsi.
Perbaikan: validasi nama database seperti `normalizeTargetDatabase` dan tambahkan `--` sebelum argumen posisional. Effort S.

**SRV-3 · Sedang · Redaction respons mengubah data user**
Bukti: `packages/crypto/src/redaction/redaction.ts:4-13` memasukkan `key`, `token`, `secret`, `credential` ke daftar nama field sensitif, dan setiap respons JSON serta event WebSocket melewati `Redaction.redactObject`. Baris data dengan kolom `key` menjadi `"[redacted]"`; SQL `WHERE token = 'abc'` menjadi `token = [redacted]`; teks EXPLAIN `(key = 1)` ikut berubah. Query history juga menyimpan teks yang sudah diredaksi (`packages/internal-sqlite/src/repositories/query-history.ts:97`).
Dampak: untuk aplikasi administrasi database, payload adalah data user. Tabel dengan kolom `key` tidak bisa dibaca dan saved SQL berubah saat dibaca kembali.
Perbaikan: pertahankan `redactObject` untuk error, audit, log, dan envelope WebSocket. Untuk payload data terapkan hanya redaksi ephemeral secret dan connection string. Catat keputusan ini pada spec 0011 dan 0053, tambah regresi kolom `key`. Effort M.

**SRV-4 · Sedang · Eksekusi query disimpan selamanya dan disiarkan ulang penuh**
Bukti: `executions.set` di `apps/server/src/query/query-execution.ts:475` tidak pernah dihapus kecuali `dispose`. Setiap `emit` menyalin seluruh snapshot termasuk baris hasil (`:935-952`, `:987`) dan `RealtimeHub.publish` meredaksi serta menserialisasi sebelum memeriksa ada subscriber (`realtime/websocket.ts:236-241,354-367`).
Dampak: memori tumbuh sejalan jumlah query. CPU per emit sebanding jumlah sel hasil pada event loop. Payload 1.000 baris berulang bisa memicu batas backpressure 1 MB dan menutup socket.
Perbaikan: evict eksekusi terminal (TTL atau LRU per user), kirim event state saja dan hasil sekali, periksa subscriber sebelum serialisasi, bersihkan `cancelPromise` di `finally`. Effort M.

**SRV-5 · Sedang · Rate limit berbasis IP dapat dipalsukan**
Bukti: `clientIp` memakai `x-forwarded-for` tanpa konfigurasi trusted proxy (`apps/server/src/app.ts:336-339`, `import/routes.ts:70-73`). `/setup/admin` dan `/import/upload` hanya dibatasi per IP, dan limiter upload dikonsumsi sebelum autentikasi (`import/routes.ts:340-348`). Login juga dibatasi per username sehingga hanya sebagian terpengaruh.
Perbaikan: tambah opsi trusted proxy di config, autentikasi dulu sebelum mengonsumsi limiter upload. Effort S.

**SRV-2b · Sedang · Pemeriksaan same origin bercabang menjadi tiga semantik**
Bukti: `apps/server/src/view-management/routes.ts:208-217` lolos bila `sec-fetch-site` tidak ada, apa pun nilai `Origin` (logika OR). `backup/routes.ts:62-69` dan lima modul lain memakai logika AND yang ketat. `app.ts:439-446`, `connections/routes.ts:79-84`, `query/routes.ts:58-65` memakai varian toleran proxy.
Dampak: masih di belakang header khusus `x-myadmin-csrf`, sehingga eksploitasi rendah, tetapi pemeriksaan keamanan yang bercabang akan terus menyimpang.
Perbaikan: satu fungsi bersama dengan satu keputusan (lihat SRV-2). Effort S.

**WEB-3 · Sedang · Notifikasi sukses dirender sebagai error**
Bukti: `data-browser.ts:420-424` menulis "N rows deleted" ke signal `error` yang dirender dengan `role="alert"` dan gaya destruktif (`data-browser.html:141-147`). `query-editor.ts:583-587` menulis notice ke `message` yang juga `role="alert"` destruktif (`query-editor.html:174-181`). `import-export.ts:217` serupa.
Dampak: screen reader mengumumkan sukses sebagai peringatan, dan pengguna melihat konfirmasi berwarna bahaya. Melanggar pemisahan channel sukses dan error pada spec 0056 AC-18.
Perbaikan: signal `notice` terpisah dengan `role="status"`. Effort S.

**DB-4 · Sedang · Pemecahan `?` manual pada PostgreSQL adalah bahaya kebenaran**
Bukti: teks DDL dan COMMENT dijalankan lewat `sql.split('?')` tanpa nilai (`packages/database-postgresql/src/table-designer.ts:1020-1026`). Komentar kolom `Is this flag active?` lolos preview tetapi gagal saat apply. Berlaku juga untuk ekspresi CHECK atau DEFAULT dengan operator jsonb `?` dan identifier yang mengandung `?` (`data.ts:373,406,440,479,515`, `security/index.ts:303,421`, `query-adapter.ts:44-46`). `TemplateStringsArray` difabrikasi di `connection/postgresql-connection.ts:126,130`.
Dampak: kegagalan acak yang sulit dilacak. Spec 0056 AC-1 sudah menuntut penggantiannya.
Perbaikan: port parameter nyata (`executeParameterized(text dengan $N, values)` memakai `sql.unsafe` di adapter), hapus fabrikasi `TemplateStringsArray`. Effort M.

**DB-5 · Sedang · Transaksi PostgreSQL berjalan di koneksi lain dari sesi yang di pin**
Bukti: `withTransaction` memanggil `session.client.begin()` pada pool (`postgresql-connection.ts:263-273`), sementara `queryClient` adalah koneksi `reserve()` dan `backendPid` untuk cancel diambil dari koneksi reserve (`:145-194`). MySQL sudah benar memakai koneksi reserve (`mysql-connection.ts:263`).
Dampak: statement di dalam `data.insert/update/delete`, `tableDesigner.apply`, dan `security.apply` berjalan di backend lain. Cancel mengarah ke backend yang idle. `SET search_path` dan tabel temporer tidak terlihat di dalam transaksi.
Perbaikan: jalankan `BEGIN` pada koneksi reserve. Effort S.

**INF-4 · Sedang · Nama file backup bisa saling menimpa**
Bukti: `allocate` memakai check then act pada nama berresolusi detik (`packages/backup/src/backup-service.ts:143-153`), lalu `rename` ke `artifactPath` yang sama (`:177,191`).
Perbaikan: reservasi dengan `open(..., 'wx')` saat alokasi atau sertakan id job pada nama. Effort S.

**INF-5 · Sedang · Tidak ada jalur rotasi master key**
Bukti: `assertKeyIdMatches` gagal keras saat mismatch (`packages/crypto/src/vault/decrypt-credential.ts:92-99`) dan tidak ada perintah yang mengenkripsi ulang.
Dampak: rotasi atau kehilangan key membuat semua kredensial tersimpan tidak terpakai tanpa alat pemulihan.
Perbaikan: perintah `myadmin rotate-key` yang mengenkripsi ulang `connection_credentials` dalam satu transaksi dengan provider lama dan baru. Effort L.

### 4.2 Struktur server

**SRV-1 · Tinggi · `app.ts` adalah god file dengan tiga composition root yang saling menyimpang**
Bukti: `apps/server/src/app.ts` (2.012 baris) mencampur wiring 20 service (`:1333-1725`), delapan keluarga route inline (`:661-1231`), primitif cookie dan CSRF (`:336-458`), parser query audit (`:529-616`), adapter WebSocket (`:1233-1287`), disposal (`:1295-1331`), dan wiring kedua yang lengkap di `createApp` untuk fixture kontrak (`:1728-1947`) tanpa guard, WebSocket, dan static asset. `ServerStartOptions` dan `ServerAppOptions` adalah salinan identik (`:94-170`). `startServer` menyalin opsi satu per satu dan melewatkan `exportService`, `importService`, `schemaManagementService`, `tableDesignerService`, `tableOperationsService` (`:1964-1993`). `export const app = createServerApp()` (`:1949`) membangun app tanpa database sebagai efek samping import. File ini berubah 35 kali dalam 275 commit.
Dampak: setiap fitur dikawinkan dua kali, override menyimpang, dan contract test tidak pernah melihat lapisan guard. Ini juga alasan `app.ts` menjadi hotspot konflik ketika lebih dari satu orang bekerja.
Perbaikan: lihat bagian 5.1. Spec 0056 AC-8 sudah menuntut hal ini. Effort M.

**SRV-2 · Tinggi · Cangkang HTTP disalin ke 12 sampai 13 file dan sudah menyimpang**
Bukti: `function cookieValue` di 12 file, `jsonResponse` 12, `apiError` 11, `sameOrigin` 9, `csrfAllowed` 9, `actorForRequest` 9, `interface SetupService` 13, `readJson` 7. Penyimpangan yang terjadi: (a) tiga semantik same origin (SRV-2b); (b) respons 401 menghapus cookie di `app.ts`, connections, table-designer, table-operations, database-management, tetapi tidak di query, data-browser, security, backup, export, import, schema-management, view-management, object-explorer; (c) literal `'myadmin_session'` di 9 file versus konstanta `SESSION_COOKIE_NAME`; (d) kode CSRF `CSRF_INVALID` versus `CSRF_REQUIRED` (`backup/routes.ts:235`, `security/routes.ts:343`); (e) paginasi: connections menerima integer apa pun, query membatasi 100.000/100, app.ts dan backup 10.000, security dan object-explorer memperlakukan `page` sebagai cursor dengan ukuran maksimal 500.
Dampak: perilaku keamanan dan kode error tidak seragam antar fitur, dan setiap perbaikan harus diulang belasan kali.
Perbaikan: kernel `apps/server/src/http/` (bagian 5.1). Spec 0056 AC-9. Effort S untuk kernel, M untuk migrasi bertahap.

**SRV-6 · Tinggi · Correlation id route fitur tidak pernah cocok dengan log**
Bukti: `app.ts:239` memakai `getCorrelationId()` dari observability. Semua 31 lokasi di route fitur memakai `request.headers.get('x-correlation-id') ?? crypto.randomUUID()` (`connections/routes.ts:42`, `query/routes.ts:44`, dan lainnya). Observability mencetak id sendiri ke log (`packages/observability/src/transport.ts:116-121,156-161`). Id yang dikirim klien dipantulkan apa adanya.
Dampak: id yang dilaporkan pengguna tidak dapat ditemukan di log untuk route fitur mana pun. Ini menggagalkan tujuan correlation id.
Perbaikan: satu `apiError` bersama yang memakai `getCorrelationId()`. Effort S, tercakup oleh kernel HTTP.

**SRV-7 · Sedang · `connection-manager.ts` mencampur enam tanggung jawab**
Bukti: validasi (`:599-708`), CRUD plus audit (`:1187-1535`), vault (`:1644-1696`), open dan test provider (`:1698-1768`), state machine (`:211-493`), dua registri sesi `activeSessions` dan `lifecycleSessions` dengan komentar "legacy" (`:296,802-828,1335-1338`). Entri `states` tidak pernah dihapus saat koneksi dihapus (`:449-458`). `status()` melakukan ping berurutan (`:1017-1033`). `withMutationProvider` melakukan decrypt, open, serverInfo, describe, ping, close untuk setiap edit baris (`:1103-1130,1748-1754`).
Perbaikan: pecah menjadi `connection-store`, `connection-sessions`, `provider-gateway` di belakang facade yang ada, hapus registri legacy, evict `states` saat delete, ping dengan `Promise.allSettled`. Effort M.

**SRV-8 · Sedang · Validasi request ditulis tangan dan menggandakan OpenAPI**
Bukti: tidak ada schema TypeBox pada route server. Parser manual sekitar 190 baris di connections (`routes.ts:90-283`), 350 di table-designer (`:118-469`), 300 di data-browser (`:81-384`). `@myadmin/api-contract` hanya diimpor dua file server. Contract test memeriksa body respons dan cakupan route, tetapi tidak schema request.
Dampak: bentuk request menyimpang diam diam dari kontrak.
Perbaikan: generate validator request dari OpenAPI dan pakai `body:` Elysia, mulai dari connections dan table-designer. Effort L.

**SRV-9 · Rendah · Kebersihan**
Angka ajaib `60_000` dan batas WebSocket tersebar (`app.ts:1397,1403,1480-1481,1676,1688`). Disposal lewat `WeakMap` berkunci instance Elysia (`:216-222`) gagal diam diam bila `register*` mengembalikan instance baru. Mapper HTTP di dalam file service menarik `Response` ke layer aplikasi (`table-designer.ts:223-304`, `schema-management.ts:247-304`, `database-management.ts:203-260`, `table-operations.ts:227-281`). Deteksi uniqueness lewat pesan SQLite (`connection-manager.ts:781-794`).

### 4.3 Web dan SDK Angular

**WEB-1 · Tinggi · Pindah tab pada route yang sama kemungkinan menampilkan konten basi**
Bukti: data browser, query editor, table designer, query history, dan view editor membaca parameter dari `route.snapshot` pada field initializer atau konstruktor (`data-browser.ts:93-94`, `query-editor.ts:113`, `table-designer.ts:187`, `query-history.ts:73`, `view-editor.ts:52`). Tidak ada `RouteReuseStrategy` atau `onSameUrlNavigation`. Navigasi `/data-browser?ref=A` ke `?ref=B` memakai ulang instance komponen. `database-management.ts:111` sudah benar dengan `queryParamMap.pipe(takeUntilDestroyed())`. E2E "isolates tabs" hanya memeriksa `aria-selected` (`tests/e2e/web/z-shell-navigation.spec.ts:62-87`).
Status: perlu konfirmasi runtime di browser.
Perbaikan: `toSignal(route.queryParamMap)` plus `linkedSignal` untuk state turunan pada lima pembaca snapshot, tambah e2e yang memastikan konten dua tab berbeda. Effort M.

**WEB-2 · Tinggi · Read model tidak sesuai spec 0056 dan helper error digandakan 12 kali**
Bukti: 131 pemanggilan `firstValueFrom` di 26 file, tidak ada `resource()`. SDK tidak menyediakan `AbortSignal` (`packages/sdk-angular/src/transport/transport.ts:7-13`). Dua belas helper pesan error dengan dua semantik: `instanceof Error` (`table-designer.ts:69`, `data-browser.ts:56`, `explorer.store.ts:55`, `query-history.ts:353`, `schema-management.ts:250`, `database-management.ts:283`, sepuluh inline di `query-editor.ts`, tujuh di `import-export.ts`) versus `isSdkError` (`connections.ts:546`, `security.ts:490`, `monitoring.ts:215`, `audit.ts:162`). Dua bentuk `SdkError`: class SDK (`packages/sdk-angular/src/errors/sdk-error.ts:15`) dan interface web (`apps/web/src/app/core/errors/sdk-error.ts:1-22`).
Dampak: state loading, empty, error, refreshing, stale ditulis tangan per halaman dan tidak seragam. Spec 0056 AC-18 dan AC-19 belum dimulai.
Perbaikan: `core/errors/error-message.ts` tunggal, lalu `sdkResource()` (bagian 5.3). Effort M lalu L.

**WEB-4 · Tinggi · God component dan template raksasa**
Bukti: `query-editor.ts` 769 baris dengan sekitar 40 signal, memiliki lifecycle CodeMirror (`:190-234`), autocomplete (`:600-638`), splitter statement SQL tulisan tangan (`:640-687`), eksekusi, explain, simpan, quick library, export. `table-designer.ts` 761 baris dengan algoritma diff 120 baris `changeSet()` (`:627-750`) yang hanya diuji lewat pencocokan string sumber (`apps/web/test/table-designer.test.ts:27-30`). Template di atas 400 baris: `connections.html` 884, `app-shell.html` 597 (180 baris SVG inline dalam `@switch`), `security.html` 554, `table-designer.html` 549, `backup-restore.html` 493, `query-editor.html` 481, `query-history.html` 477, `data-browser.html` 419. Dua setup CodeMirror hampir identik (`query-editor.ts:192-233`, `view-editor.ts:81-108`).
Dampak: perubahan kecil berisiko besar, review sulit, dan logika murni tidak bisa diuji tanpa merender halaman.
Perbaikan: konvensi folder fitur pada bagian 5.3, ekstrak `sql-editor`, `state-panel`, `nav-icon`, `download.util`; pindahkan `changeSet()` ke `table-change-set.ts` dengan test lebih dulu. Effort L.

**WEB-5 · Sedang · Overlay tidak konsisten dan `window.prompt` untuk alur destruktif**
Bukti: overlay `role="dialog"` tulisan tangan tanpa focus trap dan tanpa penanganan Escape di `schema-management.html:149,201,251`, `database-management.html:150,221`, `backup-restore.html:213,335`, `table-designer.html:501-537`. `window.prompt` di `connections.ts:309` dan `backup-restore.ts:281`. Foundation `Dialog` dan `AlertDialog` sudah dipakai benar di connections, data browser, user management, query history.
Perbaikan: migrasi ke `Dialog` dan `AlertDialog` foundation, mulai dari drop database dan schema sesuai 0056 AC-21. Effort M.

**WEB-6 · Sedang · Aksesibilitas keyboard result grid**
Bukti: setiap sel `tabindex="0"` tanpa roving (`result-grid.html:183`), edit hanya lewat `dblclick` (`:189`, `result-grid.ts:250-258`), Enter dan Space menyalin alih alih mengedit (`:336-343`), klik tunggal memulai timer 220 ms yang menulis ke clipboard (`:327-333`). Pohon explorer sudah benar (`object-explorer.html:177-196`).
Perbaikan: roving tabindex, Enter atau F2 untuk edit, tombol salin eksplisit. Effort M.

**WEB-7 · Sedang · Pemuatan daftar koneksi digandakan 10 kali**
Bukti: `security.ts:427-433`, `schema-management.ts:204-212`, `database-management.ts:234-241`, `backup-restore.ts:320-348`, `import-export.ts:87-91`, `view-editor.ts:302`, `query-editor.ts:691`, `query-history.ts:341`, `monitoring.ts:73`, `explorer.store.ts:120`, tiap satu dengan signal `connections` dan aturan pilihan default sendiri.
Perbaikan: `ConnectionsStore` di `core/connections` dan komponen `app-connection-picker` bersama. Effort M.

**WEB-8 · Sedang · Guard memanggil API pada setiap navigasi**
Bukti: `setupGateGuard` memanggil `/setup/status` (`setup-gate.guard.ts:16`) dan `authGuard` memanggil `/auth/me` (`auth.guard.ts:17`) tanpa cache; `adminGuard` sudah memakai cache user. `core/auth/admin.guard.ts` adalah duplikat mati tanpa importer.
Perbaikan: cache status setup dan sesi di store, hapus duplikat. Effort S.

**WEB-9 · Sedang · Reaktivitas: `effect()` dan polling tanpa lifecycle**
Bukti: `monitoring.ts:59-65` menjalankan loader async di dalam `effect()` dan membaca `this.info()` secara sinkron sehingga effect melacak `info` dan berjalan ulang pada tiap penulisan (`:175,189`). `ImportExport` menjalankan `setInterval(load, 750)` sepanjang hidup tab di samping subscription realtime yang juga memanggil `load()` (`import-export.ts:54,235-238`). `QueryClient.watch` selalu polling bersamaan realtime (`query-client.ts:214-218`).
Perbaikan: `untracked()`, polling hanya saat ada job aktif atau realtime terputus. Effort S.

**WEB-10 · Sedang · Test komponen hampir tidak ada dan lima suite menguji teks sumber**
Bukti: 28 komponen, satu yang dirender lewat TestBed (`apps/web/src/app/app.test.ts:40-51`). `apps/web/test/security.test.ts:8-13`, `table-designer.test.ts`, `view-editor.test.ts`, `settings.test.ts`, `backup-restore.test.ts` membaca file sumber dan memeriksa `toContain`. Cakupan nyata ada di 33 spec Playwright yang tidak berjalan di CI (CI-3).
Dampak: refactor legal mematahkan test tanpa perubahan perilaku, dan perilaku komponen tidak terlindungi.
Perbaikan: ganti dengan TestBed memakai harness `ɵresolveComponentResources` yang sudah ada, mulai dari komponen shared. Effort M.

**WEB-11 · Rendah · Zoneless tidak dideklarasikan, tanpa `OnPush`, sisa debug**
Bukti: tidak ada `zone.js` di dependency dan tidak ada `provideZonelessChangeDetection()` (spec 0056 child `0056-angular-reactivity.md` menuntut deklarasi eksplisit). Nol komponen memakai `OnPush`. Item menu "Preview error boundary" dan placeholder "Ada Lovelace" dikirim ke produksi (`app-shell.html:541-543,163-164`). Route loader berupa ternary bersarang 15 tingkat (`app.routes.shared.ts:67-150`). `beforeunload` mengirim PUT tanpa `keepalive` (`workspace-persistence.service.ts:133-148`).

**SDK-1 · Sedang · Facade tulisan tangan tanpa abort, path tidak diturunkan dari OpenAPI**
Bukti: 20 facade di `packages/sdk-angular/src/facades/`, path sebagai string literal, query string dibangun 8 cara berbeda (`audit-client.ts:13-26`, `query-client.ts:32-38`, `views-client.ts:23-30`, `explorer-client.ts:33-46`, dan lainnya). `HttpTransport` mengulang opsi empat kali (`http-transport.ts:24-79`). Tidak ada `AbortSignal`, retry, atau timeout. Menambah facade menyentuh tiga tempat (`public-api.ts`, `provideMyadminSdk()`, field `MyadminSdk`), yang menjelaskan churn 20 kali pada `provide-myadmin-sdk.ts`.
Perbaikan: `SdkRequestOptions { signal }`, `queryString()` bersama, konstanta path dari tipe `paths` generated, registrasi facade lewat satu tabel. Effort M.

### 4.4 Lapisan database provider

**DB-6 · Tinggi · Dua provider menggandakan sekitar 2.000 baris logika yang seharusnya di core**
Bukti berdampingan: identitas baris dan koersi nilai `pg/data.ts:64-125` identik dengan `my/data.ts:42-102`; builder query data `pg/data.ts:238-345` identik dengan `my/data.ts:247-349` kecuali fungsi quote, `ILIKE` versus `LIKE`, dan `RETURNING`; table designer (`identifier`, `validateColumn`, `mergedColumn`, `compile`, `compileAlteration`) `pg/table-designer.ts:71-89,157-277,414-457,538-860` identik dengan `my/table-designer.ts:68-82,133-247,387-430,504-814`, sekitar 700 baris; `withHandle` 21 salinan, `rowsOf` 11, `normalizePage` 8 dengan default berbeda; `import-export.ts` hampir identik di kedua provider.
Dampak: setiap bug seperti DB-2 harus diperbaiki dua kali, dan provider ketiga (SQLite, MSSQL) berarti menyalin 5.000 baris lagi.
Perbaikan: `database-core/dialect` dan builder bersama (bagian 5.2). Effort L, bertahap file demi file di belakang unit test yang ada.

**DB-7 · Sedang · Pemetaan error bocor dan satu salah klasifikasi**
Bukti: MySQL memeriksa regex `/timed out|timeout/` pada pesan sebelum errno (`my/mappers/mysql-errors.ts:82-85`), sehingga `Table 'app.session_timeout' doesn't exist` (1146) dipetakan sebagai `timeout`. Kode umum yang belum dipetakan jatuh ke `internal` dengan pesan tetap: PostgreSQL `42P07/42710/42701` (duplikat, seharusnya `conflict`), `22001/22003/22P02` (error nilai saat edit grid), `40001/40P01`, `53300`, `0A000`; MySQL `1050/1396`, `1227`, `1048/1406/1264/1366`, `1213`, `1235`.
Perbaikan: tabel sqlState dan errno berbasis data, kode sebelum regex pesan. Effort S.

**DB-8 · Sedang · Dua sumber kebenaran capability per provider**
Bukti: `pg/table-designer.ts:980-1013` mengimplementasikan ulang `createPostgresqlCapabilities` dengan teks alasan berbeda; `my/table-designer.ts:934-970` menggandakan `mysql-capabilities.ts:34-84`. Validasi designer mengabaikan `describe()` yang sadar backup.
Perbaikan: hapus salinan, satu factory per provider. Effort S.

**DB-9 · Sedang · Query tanpa batas baris dan tanpa statement timeout**
Bukti: `QueryPort.execute` tidak punya batas baris (`core/contracts/query.ts:92`); server memotong setelah hasil penuh dimaterialisasi (`apps/server/src/query/query-execution.ts:822-826`). Tidak ada `statement_timeout` atau `max_execution_time` di kedua provider. Timeout koneksi memakai `Promise.race` (`pg…connection.ts:101-118`, `my…connection.ts:117-131`), yang oleh 0056 AC-3 disebut harus diganti.
Perbaikan: `LIMIT maxRows+1` sisi server atau cursor, timeout dari config yang menghentikan kerja provider. Effort M.

**DB-10 · Rendah · Core membocorkan detail engine dan memuat kontrak mati**
Bukti: `TableTypeCatalog.engine: 'postgresql' | 'mysql'` (`core/contracts/table-designer.ts:115`), `Principal.user/host` khusus MySQL (`core/models/index.ts:83-85`), `template/encoding`, `exclusion`, `method/predicate` khusus PostgreSQL. `TablePort` dan `BackupRestorePort` tidak punya implementor. `alter()` melempar unsupported di tiga port sementara `listSchemas` MySQL mengembalikan `[]`, tidak konsisten dengan 0021 AC-8. `total()` membangun COUNT dengan memotong teks SQL di antara `' FROM '` dan `' LIMIT '` (`pg/data.ts:551-555`), rapuh terhadap identifier berkutip yang mengandung token itu. Regex tipe `/int/` juga cocok `interval` dan `point`; kolom `time` tidak pernah bisa diedit.

### 4.5 Package infrastruktur dan CLI

**INF-6 · Sedang · Adapter SQLite bergantung pada service aplikasi**
Bukti: `packages/internal-sqlite/src/repositories/unit-of-work.ts:3,31,44` mengimpor dan membangun `SettingsService` dari `@myadmin/settings`; `shared.ts:3` mengimpor `RuntimeSettingsReader` dari `settings`; `query-history.ts:9` mengimpor `Redaction` dari `crypto`. `app.ts` membuat empat `SqliteUnitOfWork` di atas satu database (`:1342,1364,1391,1395`), tiap satu dengan cache settings sendiri.
Dampak: arah dependency terbalik (adapter tahu aplikasi), dan konsistensi cache hanya kebetulan.
Perbaikan: pindahkan port `RuntimeSettingsReader` ke `internal-domain`, injeksikan reader dan fungsi redaksi lewat `RepositoryOptions`, satu unit of work di `app.ts`. Effort M.

**INF-7 · Sedang · Package satu file yang menjadi god module**
Bukti: `packages/import/src/index.ts` 1.205 baris (upload store, parser CSV, parser SQL, service), `packages/jobs/src/index.ts` 603, `packages/export/src/index.ts` 524, `packages/settings/src/index.ts` 411. `packages/backup` 2.300 baris dengan `restore.ts` 786. Parser `csvRecords` dan `sqlRecords` bersifat privat modul sehingga hanya bisa diuji lewat service (`import/index.ts:468,530`). `native-tools` 86 baris hanya dipakai backup dan CLI.
Perbaikan: pecah `import` menjadi `upload-store`, `csv/records`, `sql/statements`, `import-service`; `backup` menjadi `artifact-store`, `backup-service`, `restore-upload-store`, `restore-service`; `jobs` menjadi `model`, `manager`, `serialize`; gabungkan `native-tools` ke `backup`. Effort M.

**INF-8 · Sedang · Registrasi config key tersebar dan satu key mati**
Bukti: `history.maxEntriesPerUser` dideklarasikan, diparse dari env dan flag, dan divalidasi di `packages/config`, tetapi runtime hanya membaca dari settings service dan database (`packages/internal-sqlite/src/repositories/shared.ts:86-107`, `apps/server/src/app.ts:1425,1768`). Menambah satu key integer menyentuh sekitar sembilan tempat: schema, `configKeys`, `configFieldMetadata`, `defaultConfigValues`, `createDefaultConfig`, `ConfigOverrides`, `flagPaths`, dan daftar integer yang digandakan di `env.ts:42-50` dan `cli.ts:159-166`.
Perbaikan: satu tabel metadata key yang menurunkan schema, env, flag, dan default; hubungkan atau hapus key yang mati. Effort S.

**INF-9 · Sedang · Job: error opak, tanpa backpressure untuk backup dan restore, tanpa pemulihan setelah restart**
Bukti: `normalizedError` hanya meneruskan `DbError` (`packages/jobs/src/index.ts:199-210`), sehingga `ImportServiceError('IMPORT_UNSUPPORTED')` dan `unsupported(...)` restore sampai ke user sebagai "The job could not be completed." Export dan import punya batas aktif per user, backup dan restore tidak. Satu antrean bersama dengan 4 worker membuat backup panjang menahan export. Crash meninggalkan `backups/*.partial` dan `temp/exports/*` tanpa sweep saat boot; registri artefak export hanya di memori (`packages/export/src/index.ts:220,295-309`).
Perbaikan: protokol `SafeJobError {code,message,status}`, batas per user untuk backup dan restore, konkurensi per tipe, sweep artefak parsial saat boot. Effort M.

**INF-10 · Rendah · Redaksi hidup di `crypto` sehingga tujuh package bergantung pada crypto**
Bukti: `observability`, `jobs`, `audit`, `native-tools`, `internal-sqlite`, `backup`, dan CLI mengimpor `@myadmin/crypto` hanya untuk `Redaction`. Regex redaksi juga disalin tiga kali (`core/errors/index.ts:34`, `pg/mappers:91`, `my/mappers:72`).
Perbaikan: package `@myadmin/redaction` atau letakkan di `kernel`. Effort S.

**INF-11 · Rendah · Kebersihan**
`migrationChecksum` jatuh ke `up.toString()` bila `checksumSource` kosong (`migration-runner.ts:61`), rapuh terhadap minify pada binary; jadikan wajib. `InternalUnitOfWork.transaction<T>` menerima `T = Promise<...>` sehingga callback async akan commit sebelum kerja selesai (`ports/unit-of-work.ts:4-5`). `deleteExpired` menghapus dengan `IN (...)` tanpa batas (`sessions.ts:110-118`). Filter audit pada `action`, `connection_id`, `result` tidak berindeks pada tabel yang tumbuh tanpa retensi (`0001-initial.ts:130-131`). Duplikasi `contextFor`, `vaultCredential`, `processEnv`, `collectStderr`, `isAbortError` (4 kali), `usernameViolations`, `safeFilePart` antar package. Dead code: `internal-domain/value-objects.ts`, `config/schema/defaults.ts`, 11 shim satu baris di `testkit/fakes/*-repository.ts`.

### 4.6 Test, CI, dan tooling

**CI-1 · Kritis · Matrix evidence hanya mencocokkan string dan disajikan sebagai gate bukti**
Bukti: `scripts/quality/generate-ac-evidence-matrix.ts` tidak pernah menjalankan test. `PASS` berarti token ID muncul di file `.ts` atau `.yaml` mana pun (`indexSourceReferences`, `:107-125`), ditambah string yang dikodekan keras di file evidence bertanggal seperti `'182 pass'` (`:152`) dan `'54 tests: 40 passed'` (`:193`). ID di dalam judul `test.skip(...)` tetap terhitung: `tests/integration/mysql/provider.test.ts:154` membuat `IT-0045-AC1` tampil sebagai terbukti. Angka keras itu bertentangan dengan dokumen lain (`progres.md` 615 lulus, `0056/verify.md` 624). `AGENTS.md` menyebut `scope.md` sebagai "evidence gate, not a plan", tetapi tooling tidak mampu menopang klaim itu.
Dampak: test yang diubah menjadi `.skip` saat hotfix akan terus dilaporkan PASS selamanya. Keputusan rilis dibuat di atas angka yang tidak terverifikasi.
Perbaikan: konsumsi output `bun test --reporter=junit` sehingga PASS menuntut kasus yang benar benar dijalankan dan lulus dengan ID di judulnya, abaikan skip, hapus angka keras, tambah `matrix:ac --check` di CI. Bila tidak, turunkan statusnya menjadi "planned versus referenced" dan berhenti menyebutnya evidence. Effort M.

**CI-2 · Kritis · `main` tidak diproteksi dan CI hosted rapuh**
Bukti: `gh api .../branches/main/protection` mengembalikan 404 dan rulesets kosong. Pada SHA `2f64429` run event `push` lulus sementara run event `pull_request` gagal di `tests/integration/realtime/realtime.test.ts` dengan timeout 10 detik. Pada SHA `a47796c` run `push` dibatalkan oleh timeout job 10 menit di langkah test. Tidak ada tag, sehingga `release.yml` belum pernah dijalankan.
Dampak: commit merah bisa masuk `main` langsung, dan flakiness menutupi regresi nyata.
Perbaikan: wajibkan check CI, Contract, Security pada `main`; buat test realtime deterministik atau naikkan timeout khususnya; tambah `concurrency` dengan `cancel-in-progress`. Effort S.

**CI-3 · Tinggi · `bun run test` adalah suite smoke yang menyamar sebagai unit test**
Bukti: `package.json` menjalankan `ng build` sebelum test apa pun. `tests/quality/foundation-acceptance.test.ts` menjalankan `ng build` lagi (`:135`), membuka dev server web dan server pada port tetap 4200 dan 8080 (`:151-163`), menjalankan lint, format, typecheck (`:275-279`), dan `bun test` bersarang (`:323`). Dua test menulis ke source yang di track: `tests/contract/contract.test.ts:29-34` menulis ulang `packages/api-contract/src/generated/openapi.ts`, `tests/quality/verification-scripts.test.ts:40-47` menulis fixture ke `packages/database-core/src/`. Playwright tidak berjalan di CI mana pun. Integration PostgreSQL dan MySQL tidak pernah berjalan hosted.
Dampak: suite gagal saat `bun run dev` aktif, tidak ada jalur cepat untuk iterasi, crash meninggalkan tree kotor, dan 33 spec e2e tidak melindungi apa pun di CI.
Perbaikan: tiering `test:fast`, `test:contract`, `test:acceptance`, `test:full` (bagian 5.5); pindahkan test yang spawn proses ke `tests/smoke/`; generate ke `mkdtemp`; jalankan e2e dan integration di CI dengan service container. Effort M.

**CI-4 · Tinggi · Pipeline rilis belum pernah dieksekusi dan sebagian usang**
Bukti: `release.yml` hanya berjalan pada tag, dan tidak ada tag. Tiga job menyalin `ci.yml`, `contract.yml`, `security.yml` secara verbatim (`:14-64`). Matriks memakai `macos-13` (`:80`); image ini sudah dipensiunkan GitHub menurut pengumuman akhir 2025 dan perlu dikonfirmasi saat tag pertama. `ubuntu-24.04` bercampur dengan `ubuntu-latest`.
Perbaikan: reusable workflow `workflow_call` yang dipanggil `release.yml`, ganti runner, uji dengan tag pra rilis. Effort M.

**CI-5 · Tinggi · Dokumen generated menyimpang tanpa gate**
Bukti: `git status` menunjukkan `docs/specs/ac-evidence-matrix.md` berubah setelah HEAD (0056 AC-4 dari BLOCKED ke PASS, header 405 ke 407). `security:authorization-matrix --check` menjaga file generated miliknya (`security.yml`), sementara matrix AC tidak punya `--check`. `docs/specs/README.md` mengodekan keras "405 fully evidenced, 26 blocked" yang sudah basi.
Perbaikan: kebijakan satu kalimat: dokumen generated yang di commit harus punya gate `--check` di CI, atau menjadi artefak CI dan tidak di commit. Effort S.

**CI-6 · Sedang · Cakupan engine nyata hanya ada di laptop penulis**
Bukti: integration PostgreSQL (6 file) dan MySQL (5 file), performance (4), dan e2e engine nyata (5) di skip tanpa env. Konvensi env berbeda: PostgreSQL memakai `MYADMIN_POSTGRES_*` (`tests/integration/postgresql/provider.test.ts:6-18`), MySQL menuntut `MYSQL_8_0_URL` dan `MYSQL_LATEST_URL` sekaligus tanpa prefix `MYADMIN_` (`tests/integration/mysql/provider.test.ts:6-14`), e2e mengodekan port 55433 dan 3380.
Perbaikan: service container PostgreSQL 18.1 dan 17.7, MySQL 8.0 dan 8.4 di CI sesuai compose; satu konvensi `MYADMIN_TEST_POSTGRES_URLS` dan `MYADMIN_TEST_MYSQL_URLS`. Effort M.

**CI-7 · Sedang · Test yang mengunci teks, bukan perilaku**
Bukti: `tests/quality/distribution-release.test.ts:14` menuntut literal `runs-on: ubuntu-latest`, `:25` menuntut YAML `needs:` persis, `foundation-acceptance.test.ts:354-369` menuntut string langkah `ci.yml`. Lima suite web membaca file sumber (WEB-10). `scripts/quality/ui-foundation-smoke.test.ts:41-74` memeriksa prosa markdown.
Dampak: refactor CI atau komponen yang sah mematahkan sekitar 15 assertion tanpa perubahan perilaku, sehingga tim belajar mengabaikan test.
Perbaikan: hapus test teks saat mengerjakan CI-3 dan CI-4, ganti dengan test perilaku. Effort S.

**CI-8 · Tinggi · Gate lint dan template terlalu longgar untuk ukuran ini**
Bukti: `tooling/eslint/eslint.config.mjs` hanya `eslint.configs.recommended` dan `tseslint.configs.recommended` plus satu aturan. Tidak ada `angular-eslint` (tidak terpasang), tidak ada aturan type aware seperti `no-floating-promises`. `strictTemplates` tidak diaktifkan di `tsconfig.json` maupun `apps/web/tsconfig.app.json`, sehingga 7.719 baris template hanya dicek mode dasar saat `ng build`. Ini menjelaskan mengapa lint 85 ribu baris selesai dalam 3,9 detik.
Dampak: kelas error yang biasa ditangkap compiler dan linter (promise tidak ditunggu, binding template salah tipe, lifecycle Angular salah) lolos ke runtime dan hanya tertangkap oleh e2e yang tidak berjalan di CI.
Perbaikan: `strictTemplates: true`, pasang `angular-eslint` dengan aturan template, aktifkan `tseslint.configs.strictTypeChecked` bertahap dengan `--max-warnings` sebagai ratchet. Effort M, risiko sedang karena akan memunculkan error yang harus dibereskan.

**CI-9 · Sedang · Ruang bundle di bawah 1 persen**
Bukti: initial 893,99 kB dari warning 900 kB. `docs/specs/README.md` mencatat keputusan tidak menaikkan threshold.
Dampak: dependency kecil berikutnya memecahkan build produksi. Tidak ada analisis komposisi bundle yang tercatat.
Perbaikan: jalankan analisis bundle, pertimbangkan lazy load CodeMirror dan ikon SVG inline app shell (180 baris), lalu tetapkan budget dengan ruang 15 persen. Effort S untuk analisis.

**CI-10 · Rendah · Kebersihan tooling**
Tidak ada pengukuran coverage. `contract.yml` tanpa blok `permissions`. Action dipin ke tag major, bukan SHA. Dependabot bulanan tanpa grouping; tiga PR action major terbuka. `ignoreDeprecations: "6.0"` di `tsconfig.base.json` tidak diperlukan (tsc lulus tanpanya). `ajv`, `ajv-formats`, dan `openapi-typescript` dipin ke major saja padahal `bunfig.toml` menuntut `exact`. `jsdom` dipreload ke semua 152 file test termasuk server (overhead terukur kecil, tetapi menyembunyikan asumsi lingkungan). Log JSON server tercetak ke stdout selama test sehingga output CI bising. Dependency tertinggal: TypeScript 7.0.2 tersedia (evaluasi dukungan Angular dulu), jsdom 30, `@ojiepermana/angular` 22.1.11.

### 4.7 Dokumentasi dan proses

**DOC-1 · Tinggi · Overhead dokumentasi per perubahan**
Bukti: satu perubahan AC menyentuh `test.md` (normatif), salinan AC di `index.md` yang "wajib identik" (`0033/index.md:26`), `verify.md`, `plan.md` (56 file, semuanya turunan), `scope.md` (790 baris, file paling sering berubah), `progres.md` (salinan manual), lalu regenerasi matrix. 181 dari 275 commit tidak menyentuh direktori kode. Spec 0056 sendiri 13 file dan 1.232 baris. `docs/specs/evidence/` memuat 35 file bertanggal, tujuh di antaranya dirujuk keras oleh generator.
Dampak: setiap jam kerja fitur ditemani lebih dari satu jam kerja dokumentasi, dan sebagian besar dokumen itu adalah salinan yang pasti menyimpang.
Perbaikan: hapus salinan AC di `index.md` (cukup tautan ke `test.md`), hapus `plan.md` dan `progres.md` atau jadikan generated, jadikan `scope.md` ringkas dan generated dari status spec, satu file evidence per spec alih alih per tanggal. Effort M, hasil langsung terasa.

**DOC-2 · Sedang · Navigasi untuk pendatang baru**
Bukti: tidak ada `ARCHITECTURE.md`, indeks ADR, atau peta modul. `docs/architecture/` berisi satu file. Dokumen arsitektur de facto adalah `plan/struktur.md` (1.113 baris) berlabel baseline dengan keputusan yang sudah digantikan tertulis inline. 56 spec hanya bisa dinavigasi lewat tabel `README.md` yang bercampur paragraf status.
Perbaikan: `docs/architecture/ARCHITECTURE.md` (angkat bagian 1, 4, 5, 8 dari `struktur.md`), indeks spec sebagai tabel murni (nomor, judul, status, satu baris keputusan), peta modul digenerate dari `dependency-cruiser --output-type json`. Effort M.

**DOC-3 · Sedang · Dua bahasa untuk satu sistem**
Bukti: spec dan scope berbahasa Indonesia, sementara kode, `AGENTS.md`, `README.md`, dan pesan error berbahasa Inggris. Generator matrix mencetak kalimat verdict Indonesia ke tabel berjudul Inggris.
Dampak: istilah di spec tidak pernah cocok dengan pencarian di kode. Kontributor atau agen yang tidak membaca Indonesia tidak bisa membaca AC normatif.
Perbaikan: pilih satu bahasa untuk dokumen durable. Bila Indonesia dipertahankan untuk spec, wajibkan judul, ringkasan, dan daftar AC berbahasa Inggris per spec, dan glosarium istilah yang dipakai di kode. Effort S untuk kebijakan, berkelanjutan untuk penerapan.

**DOC-4 · Rendah · `AGENTS.md` menyimpang dari praktik**
Bukti: `AGENTS.md` menyatakan integrasi git dengan prefix branch `codex/` dan commit per milestone, tetapi riwayat hanya memakai `main` tanpa branch dan tanpa merge. `AGENTS.md` menyebut empat file per spec, padahal semua 56 spec memiliki lima file termasuk `plan.md`. Perintah untuk menjalankan integration test database disebut tetapi variabel env tidak dinamai.
Perbaikan: putuskan alur branch yang nyata dan tulis itu, perbaiki daftar file spec, tambah variabel env. Usulan baris persis ada di ringkasan audit.

## 5. Arah arsitektur untuk skala besar

Prinsip yang mendasari semua usulan: **satu konsep, satu tempat.** Cangkang HTTP, dialect SQL, read model Angular, dan registrasi fitur masing masing harus punya satu implementasi yang dipakai semua fitur.

### 5.1 Server: kernel HTTP dan composition root tipis

Struktur target `apps/server/src/`:

```text
http/            response.ts (jsonResponse, apiError memakai getCorrelationId)
                 session.ts  (requireSession, requireAdmin, requireCsrf, satu aturan same origin)
                 body.ts     (readJson), paging.ts (normalize), db-error.ts (satu tabel DbError ke HTTP)
composition/     services.ts (ServerServices bertipe, dibangun sekali)
                 routes.ts   (satu daftar registrasi berurutan, dipakai production dan fixture)
                 dispose.ts  (Disposable[], bukan WeakMap)
<feature>/       <feature>.ts (service), routes.ts (module factory memakai http/*), <feature>.test.ts
realtime/        hub, route
lifecycle/       start, stop, shutdown terurut
```

Aturan: `app.ts` hanya memanggil `composition`. `createApp` untuk contract test memakai daftar route yang sama dengan production dengan prefix sebagai parameter. `ServerStartOptions = ServerAppOptions & { host?; port? }` lalu spread, bukan salinan manual. Tidak ada `export const app` sebagai efek samping import.

Urutan migrasi yang aman: buat `http/` dengan menyalin satu implementasi yang paling benar, ganti file route satu per satu (contract test dan matrix otorisasi menjaga perilaku), baru pecah `app.ts`.

### 5.2 Provider: dialect di core, provider menjadi tipis

```text
packages/database-core/src/
  dialect/       SqlDialect { quoteIdentifier, quoteLiteral, likeOperator, escapeClause,
                 returning, typeKind(dataType), identifierLimit, referentialActions }
  data/          buildDataPage(request, columns, dialect), resolveRowIdentity, coerceCellForWrite
  ddl/           TableChangeCompiler(dialect, catalog)
  session/       runWithSession(connection, ctx, fn), Paging.normalize
  errors/        redactSecrets tunggal, DbError
packages/database-<engine>/src/
  dialect.ts, catalog SQL metadata, error-table.ts, capabilities.ts (satu sumber), driver adapter
```

Provider ketiga menjadi: satu `Dialect`, SQL metadata, tabel pemetaan error, factory capability. Jalankan bertahap: mulai dari `resolveRowIdentity` dan `coerceCellForWrite` (sekaligus memperbaiki DB-2), lalu builder data, lalu table designer.

### 5.3 Web: konvensi fitur dan read model tunggal

```text
apps/web/src/app/features/<name>/
  <name>.page.ts / .html    tipis: params -> store -> template
  <name>.store.ts           signal store yang disediakan per route
  <name>.model.ts           logika murni dengan unit test (contoh: table-change-set.ts)
  components/               presentasional, input() dan output()
apps/web/src/app/core/
  connections/connections.store.ts  daftar koneksi, pilihan default, status realtime
  errors/error-message.ts           satu toErrorMessage(unknown, fallback), satu SdkError
apps/web/src/app/shared/
  sql-editor/  state-panel/ (loading, empty, error dengan aria-busy)  nav-icon/  download.util.ts
packages/sdk-angular/src/
  resource/sdk-resource.ts  resource() dengan state loading, ready, empty, refreshing, stale, error
  transport: SdkRequestOptions { signal?: AbortSignal }, queryString(), path dari tipe paths
```

Deklarasikan `provideZonelessChangeDetection()` secara eksplisit. Ganti ternary route dengan `Record<RouteId, () => Promise<Type>>`. Turunkan `WorkspaceTabType` dari id route supaya menambah halaman tidak menyentuh enam tempat.

### 5.4 Platform internal

Balik dependency `internal-sqlite` ke `settings` (port ke `internal-domain`, injeksi lewat opsi). Satu `SqliteUnitOfWork` di composition. Pecah `import`, `backup`, `export` sesuai INF-7. Keluarkan `redaction` dari `crypto`. Tabel metadata config tunggal. Protokol error job yang aman dan sweep artefak parsial saat boot.

### 5.5 Proses: test tiering, CI reusable, dokumen ramping

Skrip:

```text
test:fast        bun test apps packages tests/unit tests/integration tests/security tests/verification
test:contract    bundle:contract lalu bun test tests/contract
test:acceptance  tests/smoke/** (spawn proses, port, build)
test:e2e         playwright
test:full        semuanya
```

CI: satu `quality.yml` dengan `workflow_call` berisi job quality, unit, contract, security, integration-postgresql (service container 18.1 dan 17.7), integration-mysql (8.0 dan 8.4), e2e (Playwright dengan artefak trace). `ci.yml` dan `release.yml` memanggilnya. Cache `~/.bun/install/cache` dan `.angular/cache`. Coverage dengan threshold yang di ratchet. Branch protection yang mewajibkan check.

Dokumen: `ARCHITECTURE.md`, indeks spec sebagai tabel, hapus salinan manual, kebijakan dokumen generated (di commit berarti ada `--check`), satu bahasa durable.

## 6. Roadmap bertahap

Tiap gelombang bisa selesai tanpa gelombang berikutnya. Urutan di dalam gelombang adalah rekomendasi prioritas.

### Gelombang 1: hentikan kebocoran (1 sampai 2 minggu, risiko rendah)

| #   | Pekerjaan                                                                                                        | Temuan              | Effort |
| --- | ---------------------------------------------------------------------------------------------------------------- | ------------------- | ------ |
| 1   | Perbaiki `ESCAPE`, presisi identitas baris, komposisi `IDENTIFIED WITH`, tambah integration test untuk ketiganya | DB-1, DB-2, DB-3    | S      |
| 2   | Expiry dan streaming upload restore, whitelist env subprocess, validasi nama database backup                     | INF-1, INF-2, INF-3 | S      |
| 3   | Proteksi `main`, buat test realtime deterministik, `concurrency` di workflow                                     | CI-2                | S      |
| 4   | `test:fast` dan pindahkan test yang spawn proses ke `tests/smoke/`; hentikan test yang menulis ke source         | CI-3, CI-7          | S      |
| 5   | `matrix:ac --check` di CI dan hapus angka keras di generator; atau turunkan labelnya                             | CI-1, CI-5          | S      |
| 6   | `strictTemplates: true` dan pasang `angular-eslint`; bereskan error yang muncul                                  | CI-8                | M      |
| 7   | Signal `notice` dengan `role="status"`; `provideZonelessChangeDetection()`; hapus sisa debug                     | WEB-3, WEB-11       | S      |
| 8   | Satu `apiError` bersama dengan `getCorrelationId()` sebagai langkah pertama kernel HTTP                          | SRV-6               | S      |
| 9   | Tabel error PostgreSQL dan MySQL berbasis data; kode sebelum regex pesan                                         | DB-7                | S      |
| 10  | Analisis bundle dan tetapkan ruang budget                                                                        | CI-9                | S      |

### Gelombang 2: satukan yang digandakan (3 sampai 6 minggu, risiko sedang)

| #   | Pekerjaan                                                                                      | Temuan              | Effort |
| --- | ---------------------------------------------------------------------------------------------- | ------------------- | ------ |
| 1   | Kernel `http/` lengkap, migrasi 13 route module, satu tabel `DbError` ke HTTP                  | SRV-2, SRV-2b       | M      |
| 2   | Pecah `app.ts`: `composition/`, satu daftar route untuk production dan fixture, `Disposable[]` | SRV-1               | M      |
| 3   | `toErrorMessage` tunggal, `ConnectionsStore`, `connection-picker`, cache guard                 | WEB-2, WEB-7, WEB-8 | M      |
| 4   | Param route reaktif pada lima halaman plus e2e dua tab                                         | WEB-1               | M      |
| 5   | Port parameter PostgreSQL nyata, transaksi pada koneksi reserve                                | DB-4, DB-5          | M      |
| 6   | `database-core/dialect` tahap 1: identitas baris, koersi, builder data                         | DB-6                | M      |
| 7   | Reusable workflow dengan service container PostgreSQL dan MySQL, e2e di CI, cache, coverage    | CI-4, CI-6          | M      |
| 8   | Balik dependency `internal-sqlite`, satu unit of work, pecah `import` dan `backup`             | INF-6, INF-7        | M      |
| 9   | `ARCHITECTURE.md`, indeks spec tabel, hapus `plan.md` dan salinan AC, kebijakan generated      | DOC-1, DOC-2        | M      |
| 10  | Evict eksekusi query, event state saja, cek subscriber sebelum serialisasi                     | SRV-4               | M      |

### Gelombang 3: bangun untuk provider dan fitur berikutnya (satu kuartal)

| #   | Pekerjaan                                                                           | Temuan        | Effort |
| --- | ----------------------------------------------------------------------------------- | ------------- | ------ |
| 1   | `sdkResource()` dan migrasi read model per fitur (mulai audit, monitoring, history) | WEB-2, SDK-1  | L      |
| 2   | `TableChangeCompiler` di core, satu sumber capability                               | DB-6, DB-8    | L      |
| 3   | Pecah god component sesuai konvensi 5.3; test TestBed untuk komponen shared         | WEB-4, WEB-10 | L      |
| 4   | Overlay ke `Dialog` foundation, roving tabindex grid                                | WEB-5, WEB-6  | M      |
| 5   | Validator request dari OpenAPI                                                      | SRV-8         | L      |
| 6   | Job: error aman, batas per user, sweep saat boot; rotasi master key                 | INF-9, INF-5  | M, L   |
| 7   | Batas baris dan timeout statement dari config                                       | DB-9          | M      |
| 8   | Kebijakan bahasa dokumen dan glosarium                                              | DOC-3         | S      |

## 7. Peta ke spec 0056

Spec 0056 (Accepted 2026-08-29) sudah memutuskan arah untuk sebagian temuan. Audit ini menambahkan bukti dan temuan yang belum dicakup.

| Temuan audit                                          | AC 0056      | Status 0056 saat audit                           |
| ----------------------------------------------------- | ------------ | ------------------------------------------------ |
| DB-4 pemecahan `?`, fabrikasi `TemplateStringsArray`  | AC-1         | belum dimulai                                    |
| DB-9 timeout `Promise.race`, tanpa batas baris        | AC-3         | belum dimulai                                    |
| DB-10 tipe `engine` di core masih literal per engine  | AC-4         | dinyatakan selesai, tetapi bocoran ini masih ada |
| SRV-1 `app.ts` composition root                       | AC-8         | belum dimulai                                    |
| SRV-2, SRV-2b, SRV-6 helper HTTP bersama              | AC-9         | belum dimulai                                    |
| WEB-2, SDK-1 read model resource, abort               | AC-18        | belum dimulai                                    |
| WEB-2 helper error tunggal, WEB-11 zoneless eksplisit | AC-19        | belum dimulai                                    |
| WEB-3 channel sukses dan error, aria                  | AC-18, AC-20 | belum dimulai                                    |
| WEB-5, WEB-6 Dialog foundation, roving tabindex       | AC-21        | belum dimulai                                    |

Tidak dicakup 0056 dan perlu keputusan sendiri: DB-1, DB-2, DB-3, DB-6, DB-7, INF-1 sampai INF-9, CI-1 sampai CI-9, DOC-1 sampai DOC-4, SRV-3, SRV-4, SRV-5, WEB-1, WEB-7, WEB-8.

Saran urutan: kerjakan Gelombang 1 sebelum melanjutkan rollout 0056, karena beberapa AC 0056 (AC-8, AC-9) akan lebih mudah setelah kernel HTTP minimal ada, dan gate CI yang jujur (CI-1, CI-2) diperlukan supaya klaim adopsi 0056 dapat dipercaya.

## 8. Metode dan batasan

**Yang dijalankan:** `bun run lint`, `typecheck`, `check:boundaries`, `format:check`, `bun run test` penuh, `bun outdated`, `tsc` tanpa `ignoreDeprecations`, analisis churn git, `gh api` dan `gh run list` (hanya baca). Lima reviewer paralel membaca seluruh `apps/server/src`, `apps/web/src`, `packages/sdk-angular`, `packages/database-*`, package infrastruktur, `apps/cli`, `tests`, `scripts`, workflow, dan sampel spec. Setiap temuan berlabel Kritis dan Tinggi, serta sebagian Sedang, diverifikasi ulang dengan membaca baris sumber yang dikutip.

**Konfirmasi eksekusi:** reviewer lapisan database menjalankan builder SQL nyata dengan koneksi palsu untuk DB-1, DB-2, dan DB-4, serta menjalankan `SELECT` hanya baca terhadap PostgreSQL dan MySQL lokal (Herd, port 5432 dan 3306) untuk mengonfirmasi perilaku `ESCAPE` dan `NO_BACKSLASH_ESCAPES`. Tidak ada penulisan ke database lokal.

**Belum dikonfirmasi di runtime:** WEB-1 (konten tab basi) memerlukan pengujian di browser. DB-3 (akun tanpa password) mengikuti semantik terdokumentasi MySQL dan perlu dikonfirmasi pada server disposable. Status pensiun runner `macos-13` mengikuti pengumuman GitHub dan perlu dicek saat tag pertama.

**Yang tidak diaudit:** kualitas UX visual, konten `docs/operations`, Dockerfile secara mendalam, dan `@ojiepermana/angular` sebagai library eksternal.

**Hasil sampingan audit:** dokumen konteks bersarang ditambahkan di `apps/server/AGENTS.md`, `apps/web/AGENTS.md`, `packages/sdk-angular/AGENTS.md`, `packages/database-core/AGENTS.md`, `packages/internal-sqlite/AGENTS.md`, dan `tests/AGENTS.md`, memuat konvensi dan gotcha yang terverifikasi selama audit ini.
