# Myadmin — Feature Specification V1

> Status: baseline V1 untuk disetujui sebelum coding  
> Companion document: [Struktur Monorepo dan Aturan Arsitektur](struktur.md)  
> Target stack: Angular 22.1+, Bun 1.4+, SQLite internal, PostgreSQL dan MySQL  
> UI foundation wajib: @ojiepermana/angular

## 1. Ringkasan produk

Myadmin adalah aplikasi administrasi database berbasis browser yang didistribusikan sebagai satu executable. Binary menjalankan server Bun, melayani Angular web application, menyimpan state internal Myadmin secara lokal, dan mengelola banyak koneksi PostgreSQL serta MySQL.

Hasil yang ingin dicapai pada V1:

~~~text
download binary
      ↓
myadmin serve
      ↓
buka browser
      ↓
buat admin pertama
      ↓
tambahkan koneksi PostgreSQL/MySQL
      ↓
kelola database secara aman
~~~

V1 bukan target untuk menyalin seluruh 153 fitur phpMyAdmin dan pgAdmin. V1 adalah common core yang kuat, aman, dan capability-driven, dengan ekspansi provider-specific yang sudah memiliki batas arsitektural jelas.

## 2. Istilah dan batas tanggung jawab

| Istilah | Arti dalam spesifikasi ini |
|---|---|
| Myadmin user | Akun lokal untuk masuk ke aplikasi Myadmin. Ia memiliki sesi dan role aplikasi. |
| Database principal | User, role, account, atau privilege yang hidup di PostgreSQL/MySQL target. Ini berbeda dari Myadmin user. |
| Saved connection | Konfigurasi koneksi yang dapat ditampilkan secara aman, ditambah credential payload terenkripsi bila pengguna memilih menyimpannya. |
| Connection context | Credential plaintext yang hanya di-resolve di process server sesaat ketika provider perlu membuka koneksi. |
| Provider | Adapter database yang mengimplementasikan kontrak engine-neutral untuk PostgreSQL atau MySQL. |
| Capability | Pernyataan dari provider mengenai feature yang benar-benar didukung oleh server/koneksi tertentu. |
| Common core | Feature yang mempunyai kontrak seragam dan harus dapat dipakai pada PostgreSQL maupun MySQL, sepanjang capability menyatakan tersedia. |
| Destructive operation | Operasi yang menghapus atau berpotensi menghentikan akses/data, misalnya drop, truncate, delete, restore, revoke, atau overwrite import. |

## 3. Prinsip scope V1

1. PostgreSQL dan MySQL adalah provider target V1. SQLite hanya storage internal Myadmin, bukan database target yang dapat dikelola pengguna.
2. UI tidak mengambil keputusan berdasarkan nama engine. UI membaca capability yang dikembalikan API.
3. Setiap feature V1 harus dapat diuji pada provider yang menyatakan capability-nya tersedia.
4. Tidak adanya capability harus menghasilkan UI/action yang tidak tersedia atau penjelasan yang jelas; aplikasi tidak boleh memalsukan dukungan.
5. Feature yang hanya punya UI shell tanpa implementation provider, keamanan, dan test tidak dapat diklaim selesai.
6. Desain generic UI tidak dibuat ulang. Theme, navigation, form, dialog, feedback, table/data grid, dan component umum memakai @ojiepermana/angular.
7. Angular feature menggunakan @myadmin/sdk-angular; tidak ada raw fetch, HttpClient, atau endpoint string langsung di feature.
8. Semua credential tersimpan harus terenkripsi at rest dan disensor dari log, error, audit, telemetry, fixture, serta response browser.

## 4. Klasifikasi prioritas

| Prioritas | Makna |
|---|---|
| P0 | Harus tersedia lebih dahulu untuk membentuk fondasi aman. Feature lain tidak boleh dibangun di atas pengganti sementara. |
| P1 | Harus selesai untuk menyatakan Myadmin V1 selesai. |
| V2 | Sengaja ditunda. Boleh memiliki batas package/capability, tetapi tidak menjadi janji release V1. |
| Future | Bukan komitmen roadmap dekat. |

## 5. Matriks scope V1

| Area | Common core V1 | PostgreSQL V1 | MySQL V1 | Batas scope |
|---|---|---|---|---|
| Runtime dan UI | Single binary, Angular SPA, Bun HTTP/WebSocket, API-first, generated Angular SDK, light/dark/system theme, navigation dan generic component dari @ojiepermana/angular. | Driver, metadata, dan error mapping PostgreSQL. | Driver, metadata, dan error mapping MySQL. | Tidak ada UI kit kedua dan tidak ada raw network call dari feature Angular. |
| Auth dan internal state | Initial admin, local user, username/password, Admin/User, login/logout, session expiry, change password, settings, preference, workspace, query history, saved query, group koneksi, audit. | — | — | SSO/OIDC, custom role, DBA/Developer/Read Only granular adalah V2. |
| Connection manager | Tambah, edit, hapus, duplikasi, test, connect, disconnect, reconnect, group, tag/warna, timeout, saved credential, SSL/TLS, status koneksi. | Banyak server PostgreSQL. | Banyak server MySQL. | SSH tunnel adalah V2. |
| Workspace dan explorer | Sidebar, workspace tab, panel resizable, context menu, status/connection indicator, persistensi workspace, lazy loading metadata, capability-driven UI. | Browse database, schema, table, view, sequence, function/procedure yang disediakan metadata provider. | Browse database, table, view, function/procedure, trigger yang disediakan metadata provider. | Metadata browse tidak otomatis berarti semua object memiliki GUI editor pada V1. |
| Database, schema, table | Browse/create/drop database; property, ukuran, charset/encoding/collation, object search; table CRUD untuk column, index, PK/FK/unique/check, default, nullability, identity/auto-increment, generated column, comment. | Browse/create/rename/drop schema serta owner/property bila capability tersedia. | Semantik database-as-schema dan opsi table khas MySQL melalui provider. | Schema Diff dan provider-specific table tuning di luar kontrak V1 adalah V2. |
| Data browser | Server-side pagination, sort, filter, search, pilih kolom, insert/update/delete, bulk delete, NULL dan JSON editor, copy, export selected rows. | Type/dialect mapping PostgreSQL. | Type/dialect mapping MySQL. | Browser tidak boleh memuat seluruh tabel besar ke client. |
| Query editor | Multi-tab terikat connection + database + schema, highlighting, autocomplete, execute selected/full/multiple statement, cancel, result, error position, durasi, history, saved query, export result, EXPLAIN dasar. | PostgreSQL syntax/context/EXPLAIN. | MySQL syntax/context/EXPLAIN. | Graphical/advanced explain adalah V2. |
| Security database target | Browse/create/edit/delete user/role/account sesuai capability, reset password, basic GRANT/REVOKE. | Role dan privilege PostgreSQL. | Account dan privilege MySQL. | RLS, wizard privilege kompleks, dan policy detail adalah V2. |
| Import/export | Import SQL/CSV; export SQL/CSV/JSON dari database, table, query result, atau selected data; job progress, cancellation, dan streaming. | Dialect/format PostgreSQL. | Dialect/format MySQL. | Migration lintas engine dan scheduled export adalah V2. |
| Backup/restore | Logical backup/restore dengan progress, cancellation, validation, dan audit. | Artefak/tooling PostgreSQL yang didukung distribusi. | Artefak/tooling MySQL yang didukung distribusi. | Scheduled backup, physical backup, replication-aware backup adalah V2. |
| Monitoring | Connection status, server version/info, query duration, dan error/status dasar. | Normalisasi versi/latency/status PostgreSQL. | Normalisasi versi/latency/status MySQL. | Dashboard performa, process watcher lengkap, lock/transaction analytics, dan metric history adalah V2. |
| Audit dan safety | Audit append-only untuk event penting; confirmation eksplisit dengan target operasi. | Normalisasi target/action PostgreSQL. | Normalisasi target/action MySQL. | SELECT biasa tidak diaudit default. |

## 6. Role dan akses V1

Myadmin role tidak menggantikan privilege database target. Provider selalu menggunakan hak akses dari database principal pada connection context.

| Role Myadmin | Hak V1 |
|---|---|
| Admin | Menyelesaikan setup awal, mengelola Myadmin user, melihat/mengelola connection dan setting aplikasi, serta memakai feature database sesuai credential koneksi yang dipilih. |
| User | Login, mengelola dan menggunakan koneksi yang dimilikinya, memakai workspace/query/history sendiri, dan menjalankan operasi database sesuai credential koneksinya. |

Keputusan keamanan V1: saved connection bersifat private terhadap pemiliknya secara default; Admin dapat mengelola semua state aplikasi. Connection sharing yang granular tidak termasuk V1. Ini menghindari kebocoran credential dan model permission tambahan sebelum kebutuhan nyata disepakati.

## 7. Functional requirements dan acceptance criteria

### 7.1 Runtime, packaging, dan API foundation

| ID | Prioritas | Requirement | Acceptance criteria |
|---|---:|---|---|
| FR-RUN-01 | P0 | Myadmin dapat dijalankan melalui perintah "myadmin serve". | Perintah memulai HTTP server dan melayani SPA pada host/port default; host dan port dapat dioverride tanpa rebuild. |
| FR-RUN-02 | P0 | Distribusi mendukung Linux x64/ARM64, macOS x64/ARM64, dan Windows x64. | Setiap target menghasilkan artefak binary, checksum, smoke test, dan dokumentasi cara menjalankan. |
| FR-RUN-03 | P0 | Angular production assets dibundel/di-embed ke runtime binary. | User tidak perlu menjalankan dev server atau memasang Node/Bun terpisah untuk memakai release binary. |
| FR-RUN-04 | P0 | API Myadmin bersifat API-first. | Endpoint REST dan event WebSocket terdokumentasi pada API contract; server dan SDK lulus contract test. |
| FR-RUN-05 | P0 | Aplikasi menyediakan diagnostic command. | "myadmin doctor" memeriksa data directory, internal storage, asset web, config penting, dan capability backup tool yang dipakai distribusi tanpa mencetak secret. |

### 7.2 UI foundation, theme, navigation, dan SDK

| ID | Prioritas | Requirement | Acceptance criteria |
|---|---:|---|---|
| FR-UI-01 | P0 | @ojiepermana/angular menjadi UI foundation resmi. | Theme, navigation, generic form/control, dialog, overlay, feedback, table/data-grid, dan component umum memakai package tersebut bila capability tersedia. |
| FR-UI-02 | P0 | Myadmin mendukung light, dark, dan system theme. | Preferensi tersimpan per Myadmin user; perubahan mode konsisten pada shell dan seluruh feature. |
| FR-UI-03 | P0 | App shell menyediakan sidebar, workspace, tab host, resizable panel, context menu, dan status bar. | Layout dapat dipakai untuk membuka lebih dari satu context/query; state dasar workspace dapat dipulihkan setelah login kembali. |
| FR-UI-04 | P0 | Feature Angular tidak membuat HTTP call langsung. | Static boundary check memastikan component/facade tidak memakai raw fetch, HttpClient, atau URL API; semua call melewati @myadmin/sdk-angular. |
| FR-UI-05 | P1 | UI bersifat responsive dan keyboard-aware. | Navigasi utama, dialog, menu, tab, dan editor action dapat digunakan tanpa mouse pada viewport desktop; layout tidak rusak pada ukuran layar lebih sempit. |

### 7.3 Initial setup, auth, dan sesi

| ID | Prioritas | Requirement | Acceptance criteria |
|---|---:|---|---|
| FR-AUTH-01 | P0 | Instance baru meminta pembuatan Admin pertama sebelum workspace tersedia. | Tidak ada route aplikasi yang dapat dipakai tanpa initial admin; setup tidak dapat dieksekusi ulang setelah admin pertama berhasil dibuat. |
| FR-AUTH-02 | P0 | Myadmin menyediakan local username/password login. | Login sukses membuat sesi; login gagal tidak mengungkap apakah username atau password yang salah secara berlebihan. |
| FR-AUTH-03 | P0 | Password Myadmin disimpan secara aman. | Tidak ada password plaintext atau reversible password encryption pada SQLite, log, error, test fixture, atau response API. |
| FR-AUTH-04 | P0 | User dapat logout dan mengganti password. | Logout menginvalidasi sesi aktif sesuai policy; change password memverifikasi password saat ini dan mencatat audit event. |
| FR-AUTH-05 | P0 | Session memiliki expiry dan enforcement server-side. | Sesi kadaluarsa menolak request/API/WS berikutnya dan browser kembali ke alur login tanpa data sesi tertinggal. |
| FR-AUTH-06 | P1 | Admin dapat membuat dan mengelola Myadmin user dasar. | Admin dapat membuat, menonaktifkan bila policy mendukung, serta mengatur role Admin/User; User tidak dapat mengakses admin-only route. |

### 7.4 Internal SQLite, credential vault, dan audit

| ID | Prioritas | Requirement | Acceptance criteria |
|---|---:|---|---|
| FR-INT-01 | P0 | Myadmin memiliki SQLite internal yang termigrasi saat startup. | Data directory berisi database internal dan subdirectory config/logs/backups/temp; migration idempotent dan dapat diverifikasi oleh doctor. |
| FR-INT-02 | P0 | Internal storage menyimpan user, session, connections, server group, workspace, history, saved query, settings, preferences, dan audit. | Repository integration test membuktikan data tersimpan dan dipulihkan tanpa memerlukan server PostgreSQL/MySQL target. |
| FR-INT-03 | P0 | Saved credential dienkripsi at rest. | SQLite hanya menyimpan ciphertext dan metadata enkripsi; key material tidak disimpan bersebelahan dengan ciphertext. |
| FR-INT-04 | P0 | Plaintext credential hidup seminimal mungkin. | Decrypt hanya terjadi dalam process server saat membentuk connection context; plaintext tidak dipersist, dipancarkan WebSocket, atau masuk log. |
| FR-AUD-01 | P0 | Audit event bersifat append-only dan disensor. | Login penting, perubahan connection, destructive DDL, perubahan database user/privilege, import destructive, backup, serta restore menghasilkan event tanpa secret; success response untuk aksi mutatif yang wajib diaudit tidak dikirim sebelum event berhasil ditulis. |
| FR-AUD-02 | P1 | Admin dapat melihat audit history. | Halaman audit mendukung filter waktu, actor, action, connection/object target, serta pagination server-side. |

### 7.5 Connection manager

| ID | Prioritas | Requirement | Acceptance criteria |
|---|---:|---|---|
| FR-CONN-01 | P0 | User dapat menambah PostgreSQL atau MySQL connection. | Form memiliki engine, nama/label, host, port, database awal bila relevan, username, secret, SSL/TLS, timeout, group, tag/warna; validasi dilakukan sebelum disimpan. |
| FR-CONN-02 | P0 | Connection dapat dites tanpa menyimpan credential yang tidak dipilih untuk disimpan. | Hasil test menampilkan sukses/gagal yang ternormalisasi, server version, dan capability dasar; pesan error tidak memuat secret. |
| FR-CONN-03 | P0 | Saved connection mendukung create, edit, delete, duplicate, connect, disconnect, dan reconnect. | Setiap operasi mengubah state dengan benar; delete meminta confirmation eksplisit, membuat descriptor/credential tidak lagi dapat dipakai, dan mutasi diaudit. |
| FR-CONN-04 | P0 | Myadmin mendukung banyak server dan server group. | Sidebar dapat menampilkan banyak saved connection pada group yang berbeda; status setiap koneksi independen. |
| FR-CONN-05 | P0 | Connection mendukung SSL/TLS dan timeout. | Nilai ditransfer hanya ke provider context; parameter TLS/timeout invalid ditolak sebelum koneksi digunakan dan konfigurasi TLS tidak boleh diam-diam downgrade ke plaintext. |
| FR-CONN-06 | P1 | Status connection mudah dilihat. | Shell/status bar menampilkan connected/disconnected/error, engine, server version bila tersedia, dan latency atau waktu test terbaru. |

### 7.6 Provider abstraction dan capability

| ID | Prioritas | Requirement | Acceptance criteria |
|---|---:|---|---|
| FR-PROV-01 | P0 | Database core mendefinisikan port kecil yang agnostik engine. | Kontrak connection, capability, metadata, database, schema, table, data, query, security, import/export, backup/restore, dan monitoring tidak mengimpor driver konkret. |
| FR-PROV-02 | P0 | PostgreSQL dan MySQL mengimplementasikan provider terpisah. | Tidak ada import antar provider; query/metadata/error mapping spesifik engine tinggal pada package provider masing-masing. |
| FR-PROV-03 | P0 | Provider registry memilih adapter berdasarkan tipe connection. | Application layer tidak menggunakan percabangan business "if PostgreSQL/MySQL" untuk perilaku database. |
| FR-PROV-04 | P0 | API mengekspos engine, version, dan capability per connection. | UI dapat menentukan feature tanpa nama engine hard-coded; test membuktikan capability berbeda dirender secara tepat dan server menolak request unsupported meskipun UI dimanipulasi. |
| FR-PROV-05 | P1 | Perbedaan hierarchy object dihormati. | PostgreSQL dapat menampilkan database → schema → object; MySQL dapat menampilkan database → object sesuai metadata provider. |

Contoh minimum response capability:

~~~json
{
  "engine": "postgresql",
  "version": "18.1",
  "capabilities": {
    "schemas": true,
    "materializedViews": false,
    "vacuum": false,
    "rowLevelSecurity": false,
    "events": false,
    "binlog": false
  }
}
~~~

Nilai "false" pada contoh dapat berarti feature belum didukung versi server, belum didukung V1, atau secara natural tidak berlaku pada engine tersebut. API dapat menambahkan reason/availability untuk memberi pesan yang jelas.

### 7.7 Workspace dan object explorer

| ID | Prioritas | Requirement | Acceptance criteria |
|---|---:|---|---|
| FR-EXP-01 | P1 | Object explorer menggunakan lazy loading. | Membuka server tidak mengambil seluruh database/schema/table/column sekaligus; child diambil ketika node diekspansi. |
| FR-EXP-02 | P1 | Explorer menampilkan hierarchy provider dan common object. | User dapat menelusuri database, schema bila didukung, table, view, routine/object lain yang provider paparkan. |
| FR-EXP-03 | P1 | Object search tersedia untuk metadata yang provider dukung. | Pencarian berjalan pada server/provider dengan pagination dan tidak mengunduh seluruh catalog ke browser. |
| FR-EXP-04 | P1 | Workspace mempertahankan context operasi. | Tab query/data/table terkait pada connection, database, dan schema/object context yang eksplisit; context tidak tertukar ketika beberapa koneksi dibuka. |

### 7.8 Database, schema, dan table designer

| ID | Prioritas | Requirement | Acceptance criteria |
|---|---:|---|---|
| FR-DB-01 | P1 | User dapat browse database dan melihat basic property. | Daftar/property mencakup informasi yang provider dukung seperti size, charset/encoding, collation, owner. |
| FR-DB-02 | P1 | User dapat create dan drop database dengan aman. | Create divalidasi provider; drop memerlukan confirmation yang menyebut target secara spesifik dan audit event. |
| FR-SCH-01 | P1 | Schema management tersedia bila capability "schemas" bernilai true. | Browse/create/rename/drop schema bekerja pada PostgreSQL/provider pendukung; UI tidak menampilkan operasi jika tidak berlaku pada MySQL. |
| FR-TBL-01 | P1 | User dapat create dan alter table dengan column editor. | Column name, type, length/precision/scale, nullability, default, identity/auto-increment, generated column, dan comment divalidasi oleh provider. |
| FR-TBL-02 | P1 | User dapat mengelola index dan constraint utama. | Primary key, foreign key, unique, check, dan composite index dapat dibuat/diubah/dihapus sejauh capability/provider mendukungnya. |
| FR-TBL-03 | P1 | Operasi drop/rename/truncate table aman. | Operasi memerlukan confirmation eksplisit, menampilkan target dan dampak, serta menghasilkan audit event. |
| FR-TBL-04 | P1 | GUI tidak memalsukan object administration yang belum didukung. | View/routine/trigger boleh tampil di explorer dan dibuka pada query editor; GUI editor hanya ditampilkan bila provider contract V1 benar-benar mendukungnya. |

### 7.9 Data browser dan editor

| ID | Prioritas | Requirement | Acceptance criteria |
|---|---:|---|---|
| FR-DATA-01 | P1 | Data browse memakai server-side pagination. | UI menerima page/cursor, total/estimate bila tersedia, limit, filter, sort, dan selected columns; tabel besar tidak di-load seluruhnya. |
| FR-DATA-02 | P1 | User dapat sort, filter, search, dan memilih kolom. | Semua parameter divalidasi/diterjemahkan provider, tidak disusun dari input bebas yang dapat mengubah maksud query. |
| FR-DATA-03 | P1 | User dapat insert, edit, delete, dan bulk delete row. | Type conversion, NULL, JSON, binary-safe behavior, dan key/row identity ditangani provider; edit/delete hanya tersedia bila provider dapat menentukan row identity yang aman; delete/bulk delete memerlukan confirmation, jumlah affected row, dan audit. |
| FR-DATA-04 | P1 | User dapat menyalin/export data yang dipilih. | Copy tidak mengubah data; export melewati job/streaming untuk volume besar dan menghormati context/filter saat ini. |

### 7.10 Query editor

| ID | Prioritas | Requirement | Acceptance criteria |
|---|---:|---|---|
| FR-QRY-01 | P1 | Query editor mendukung banyak tab dan context eksplisit. | Setiap tab menyimpan connection, database, schema, SQL draft, status execution, dan hasilnya sendiri. |
| FR-QRY-02 | P1 | Editor mendukung syntax highlighting dan autocomplete metadata. | Autocomplete menggunakan metadata provider/context aktif dan tidak men-download seluruh catalog saat tab dibuka. |
| FR-QRY-03 | P1 | User dapat menjalankan selected SQL, full SQL, dan multi-statement yang provider izinkan. | Result/error disajikan per execution; context dan connection yang dipakai selalu terlihat. |
| FR-QRY-04 | P1 | User dapat membatalkan query aktif. | Cancel diarahkan ke provider/connection yang tepat; UI menyatakan cancelled/failed/completed tanpa mengganti hasil tab lain. |
| FR-QRY-05 | P1 | Result grid mendukung multiple result set dan export result. | Result menampilkan column/value secara aman, durasi execution, error position bila tersedia, dan export berjalan tanpa menahan browser. |
| FR-QRY-06 | P1 | Query history dan saved query tersedia. | Riwayat tersimpan terpisah per Myadmin user; user dapat menyimpan, membuka, menamai, dan menghapus query miliknya. |
| FR-QRY-07 | P1 | EXPLAIN dasar tersedia bila provider capability mendukungnya. | SQL plan text/structured result ditampilkan tanpa mengklaim graphical/advanced explain sebagai V1. |

### 7.11 Database user, role, dan privilege

| ID | Prioritas | Requirement | Acceptance criteria |
|---|---:|---|---|
| FR-SEC-01 | P1 | User dapat browse principal database sesuai provider capability. | Provider mengembalikan model aman untuk role/user/account dan privilege terkait, tanpa secret/password sebelumnya. |
| FR-SEC-02 | P1 | User dapat create/edit/delete principal target dan reset credential bila capability tersedia. | Semua input tervalidasi provider; perubahan membutuhkan confirmation bila destruktif dan dicatat audit. |
| FR-SEC-03 | P1 | Basic GRANT/REVOKE tersedia. | UI membatasi pilihan pada capability/object yang provider dukung; request akan gagal jelas jika credential koneksi tidak memiliki hak yang cukup. |

### 7.12 Import, export, backup, dan restore

| ID | Prioritas | Requirement | Acceptance criteria |
|---|---:|---|---|
| FR-IEX-01 | P1 | Myadmin mendukung import SQL dan CSV. | Upload divalidasi tipe/ukuran/target; progress, error ringkas, cancellation, dan hasil akhir tersedia; destructive overwrite memerlukan confirmation. |
| FR-IEX-02 | P1 | Myadmin mendukung export SQL, CSV, dan JSON. | Export dapat berasal dari database/table/query result/selected data sesuai provider; file dibuat streaming untuk data besar. |
| FR-JOB-01 | P1 | Pekerjaan import/export/backup/restore memiliki progress dan cancellation. | Request HTTP tidak menunggu operasi panjang selesai; user dapat melihat state job melalui UI/event dan membatalkan jika provider mendukungnya. |
| FR-BKR-01 | P1 | Myadmin mendukung logical backup/restore PostgreSQL dan MySQL. | Operasi menghasilkan/menelan artefak yang tervalidasi, menampilkan progress/error, memerlukan confirmation untuk restore, dan mencatat audit. |
| FR-BKR-02 | P1 | Kebutuhan native tooling harus transparan. | Bila adapter memakai tool seperti pg_dump/pg_restore atau ekuivalen MySQL, binary release harus menyediakannya atau doctor harus menyatakan feature tidak tersedia sebelum user memulai operasi; tidak ada kegagalan diam-diam. |

### 7.13 Status dasar, error, dan safety

| ID | Prioritas | Requirement | Acceptance criteria |
|---|---:|---|---|
| FR-OPS-01 | P1 | Myadmin menampilkan connection status, server version/info, dan duration operasi dasar. | Status dapat diperbarui saat connect/reconnect/error dan tidak mengungkap credential/connection string. |
| FR-OPS-02 | P1 | Error dinormalisasi dan actionable. | Browser mendapat message aman, correlation ID bila berlaku, dan category yang cukup untuk tindakan; raw driver stack/secret tidak diekspos. |
| FR-SAFE-01 | P0 | Semua destructive operation memiliki confirmation eksplisit. | Confirmation menyebut connection dan object target; operasi tidak dapat dijalankan hanya dari accidental click. |
| FR-SAFE-02 | P0 | Aksi destructive dan privilege change dicatat audit. | Audit mencatat actor, waktu, action, target, hasil, dan correlation/reference tanpa secret atau payload sensitif. |

## 8. Data dan perilaku keamanan V1

### 8.1 Data internal minimum

SQLite internal menyimpan:

~~~text
users
sessions
connections
connection_credentials
server_groups
workspaces
query_history
saved_queries
settings
preferences
audit_logs
~~~

Connection record dibagi dua:

| Bagian | Contoh isi | Boleh ditampilkan |
|---|---|---|
| Descriptor | label, engine, host, port, database awal, SSL mode, timeout, tag/group | Ya, sesuai authorization. |
| Secret payload | password, token, client-key passphrase, secret connection option | Tidak. Hanya ciphertext pada storage. |

### 8.2 Keamanan wajib

1. Password Myadmin memakai password hash modern dan tidak pernah dapat dipulihkan.
2. Saved credential memakai authenticated encryption at rest; key material dikelola di luar SQLite melalui key-provider yang disetujui ADR.
3. Credential hanya didekripsi sesaat di server untuk membuat connection context dan tidak dipancarkan ke browser.
4. Log, error, audit, telemetry, trace, screenshot fixture, dan test data harus menjalankan redaction untuk credential, token, connection string, dan query/value sensitif.
5. Semua endpoint dan channel WebSocket melakukan session/authorization enforcement server-side.
6. Akses database target tidak pernah melebihi hak credential yang dipakai provider.
7. Confirmation untuk drop, truncate, delete, restore, overwrite import, revoke, dan reset credential harus menyebut target yang spesifik.
8. Default audit tidak merekam setiap SELECT, isi data baris, atau secret. Sistem hanya merekam metadata action yang diperlukan untuk accountability.

## 9. Non-functional requirements

| ID | Area | Requirement | Bukti penerimaan |
|---|---|---|---|
| NFR-01 | Performance | Object explorer dan data browser harus lazy/server-side paginated. | Integration/performance test membuktikan UI tidak meminta seluruh catalog/tabel besar pada initial load. |
| NFR-02 | Reliability | Migration internal idempotent dan startup gagal jelas bila storage tidak dapat dipakai. | Test migration/up-down atau recovery yang relevan; doctor memberi diagnostic aman. |
| NFR-03 | Security | Tidak ada secret plaintext pada persistence/observability/browser. | Automated secret/redaction/security test dan code review boundary lulus. |
| NFR-04 | Accessibility | Control umum mengikuti capability/a11y dari @ojiepermana/angular; action penting dapat diakses keyboard. | E2E keyboard dan automated accessibility check untuk shell/auth/connection/destructive dialog. |
| NFR-05 | Compatibility | Release binary bekerja pada target platform yang ditetapkan. | CI/release menjalankan binary smoke test per target yang tersedia. |
| NFR-06 | Maintainability | Provider, internal storage, transport, UI, dan SDK mematuhi dependency direction. | Boundary test menolak forbidden import dan code generation drift. |
| NFR-07 | Observability | Error penting memiliki structured, redacted log/correlation data. | Test memastikan error client aman dan log tidak berisi secret. |
| NFR-08 | UX safety | Operasi long-running punya progress/state yang benar dan destructive action tidak ambigu. | E2E untuk cancel, failure, reconnect, confirmation, dan audit event. |

## 10. Capability rules

Capability adalah kontrak antara provider dan UI. Setiap feature yang mungkin berbeda antar engine harus mengikuti pola ini:

~~~text
Provider mendeteksi server/version/configuration
            ↓
Provider mengembalikan capability
            ↓
Server/API menormalkan capability
            ↓
SDK Angular memberi model bertipe ke feature
            ↓
Feature merender, menyembunyikan, atau menjelaskan availability
~~~

Contoh:

| Capability | Perilaku UI |
|---|---|
| schemas | Menampilkan feature/schema tree dan route schema hanya jika true. |
| materializedViews | V1 tidak menampilkan management UI kecuali capability dan scope release diaktifkan; false tetap aman. |
| rowLevelSecurity | Ditunda V2; V1 tidak menyajikan kontrol RLS walaupun server PostgreSQL mendukungnya. |
| events | Hanya dipakai nanti oleh provider MySQL V2; tidak ada menu event pada V1. |
| backupRestore | Menampilkan backup/restore hanya ketika adapter/distribusi telah lulus availability check. |
| cancelQuery | Tombol cancel query hanya aktif ketika provider/connection mendukung pembatalan. |

## 11. Explicitly deferred ke V2

| PostgreSQL V2 | MySQL V2 | General V2 |
|---|---|---|
| VACUUM/VACUUM ANALYZE, REINDEX, materialized view management, RLS, replication slot, publication, subscription, WAL administration, advanced EXPLAIN. | OPTIMIZE, CHECK, REPAIR, event scheduler, storage engine administration, replication, binlog administration. | Monitoring dashboard lengkap, process watcher, locks/transactions analytics, metric history, ERD, Schema Diff, SSH tunnel, scheduled backup, advanced permission wizard, SSO/OIDC, custom role, granular connection sharing. |

Hal berikut di luar V1 dan bukan komitmen roadmap dekat:

- AI SQL assistant atau natural-language-to-SQL;
- query optimization advisor;
- database migration lintas engine;
- plugin marketplace/system;
- MariaDB, SQLite sebagai target provider, SQL Server, ClickHouse, Oracle, atau provider lain;
- job scheduler/alerts dan performance history;
- collaborative query editing atau versioned database change workflow.

## 12. Definition of Done untuk V1

Myadmin tidak boleh disebut selesai V1 sebelum seluruh kondisi berikut terpenuhi:

1. P0 dan P1 pada dokumen ini telah diimplementasikan, bukan hanya dibuatkan folder/UI mock.
2. PostgreSQL dan MySQL mempunyai test integration nyata untuk setiap common-core contract yang diklaim didukung.
3. API contract, server implementation, dan Angular SDK lulus contract test dan tidak drift.
4. Binary target lulus smoke test: start, setup/login, serve web assets, buka connection, dan graceful shutdown.
5. Semua saved credential terbukti terenkripsi at rest dan tidak muncul pada log/error/audit/fixture/browser.
6. Initial admin, login/logout/session expiry, Admin/User authorization, dan audit penting lulus security/E2E test.
7. Explorer, data browser, query editor, import/export, dan backup/restore membuktikan behaviour pada database disposable dengan data representative.
8. Destructive operations melakukan explicit confirmation dan audit event yang dapat dilihat Admin.
9. UI memakai @ojiepermana/angular sesuai boundary yang telah dikunci; tidak ada design system kedua atau generic component duplicate.
10. Documentation operator menjelaskan menjalankan binary, lokasi data directory, backup/restore behavior, native-tool availability, upgrade/migration, dan recovery dasar.

## 13. Artefak lanjutan setelah spesifikasi ini disetujui

Urutan artefak sebelum coding feature:

1. ADR yang mengunci UI foundation, API-first, provider abstraction, internal SQLite/credential key provider, serta binary packaging.
2. OpenAPI V1 untuk P0: initial setup, auth, session, connection, provider capability, dan error model.
3. Implementation order yang memecah P0/P1 menjadi milestone dan test gate.
4. Test strategy/fixture plan untuk PostgreSQL, MySQL, SQLite internal, browser E2E, security, dan binary smoke test.

Setelah empat artefak tersebut selesai dan disetujui, implementasi dapat dimulai dari P0 tanpa memperluas scope V1 secara tidak terkontrol.
