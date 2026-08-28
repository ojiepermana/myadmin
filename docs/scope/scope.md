# Scope Myadmin V1

**Workflow:** default Beta (setiap feature: Design → Build → Verify → Test). Tier bisa dinaikkan per feature bila perlu.
**Approach:** fondasi dulu (fase A), lalu tiap feature sebagai irisan end to end, mengikuti urutan struktur.md bagian 7. Nomor feature = urutan build = nomor spec di [docs/specs](../specs/README.md).

## At a glance

| #   | Feature                                     | Fase | Status      |
| --- | ------------------------------------------- | ---- | ----------- |
| 01  | Fondasi repo satu manifest dan modul source | A    | in-progress |
| 02  | Quality tooling dan CI                      | A    | in-progress |
| 03  | Struktur kontrak OpenAPI v1                 | A    | in-progress |
| 04  | Pipeline codegen dan contract test          | A    | in-progress |
| 05  | SDK Angular core                            | A    | in-progress |
| 06  | CLI runtime dan data directory              | A    | in-progress |
| 07  | Perintah doctor dan migrate                 | A    | in-progress |
| 08  | SQLite core dan migration runner            | A    | in-progress |
| 09  | Internal repositories                       | A    | in-progress |
| 10  | Key provider dan password hashing           | A    | in-progress |
| 11  | Credential vault dan redaction              | A    | in-progress |
| 12  | Package config                              | A    | in-progress |
| 13  | Package observability                       | A    | in-progress |
| 14  | UI foundation dan theme                     | A    | in-progress |
| 15  | App shell dan navigation                    | A    | in-progress |
| 16  | Initial setup end to end                    | B    | in-progress |
| 17  | Login, logout, dan session                  | B    | in-progress |
| 18  | User management dan change password         | B    | in-progress |
| 19  | Subsistem audit append only                 | B    | in-progress |
| 20  | Halaman audit Admin                         | B    | in-progress |
| 21  | Kontrak database-core dan capability        | C    | in-progress |
| 22  | PostgreSQL koneksi dan capability           | C    | in-progress |
| 23  | PostgreSQL metadata                         | C    | in-progress |
| 24  | MySQL koneksi dan capability                | C    | in-progress |
| 25  | MySQL metadata                              | C    | in-progress |
| 26  | Connection manager CRUD dan vault           | C    | in-progress |
| 27  | Connection lifecycle dan status             | C    | in-progress |
| 28  | Jobs infrastructure                         | C    | in-progress |
| 29  | Realtime WebSocket                          | C    | in-progress |
| 30  | Workspace persistence                       | C    | in-progress |
| 31  | Object explorer                             | D    | in-progress |
| 32  | Object search                               | D    | in-progress |
| 33  | Query editor tab dan eksekusi               | D    | in-progress |
| 34  | Result grid dan export result               | D    | in-progress |
| 35  | Query cancel dan EXPLAIN                    | D    | in-progress |
| 36  | Query history dan saved queries             | D    | in-progress |
| 37  | Data browser jalur baca                     | D    | in-progress |
| 38  | Data browser jalur tulis                    | D    | in-progress |
| 39  | Manajemen database                          | D    | in-progress |
| 40  | Manajemen schema                            | D    | in-progress |
| 41  | Table designer kolom                        | D    | in-progress |
| 42  | Table designer index dan constraint         | D    | in-progress |
| 43  | Operasi destructive table                   | D    | in-progress |
| 44  | Manajemen view                              | D    | in-progress |
| 45  | Security database principal                 | D    | in-progress |
| 46  | Security database privilege                 | D    | in-progress |
| 47  | Export                                      | E    | in-progress |
| 48  | Import                                      | E    | in-progress |
| 49  | Backup                                      | E    | in-progress |
| 50  | Restore                                     | E    | in-progress |
| 51  | Monitoring status dasar                     | E    | in-progress |
| 52  | Settings dan preferences                    | E    | in-progress |
| 53  | Hardening keamanan lintas fitur             | F    | in-progress |
| 54  | Packaging binary dan smoke test             | F    | in-progress |
| 55  | Distribusi dan release                      | F    | in-progress |

Status in-progress berarti desainnya selesai (spec ada); pindah ke done saat Build, Verify, dan Test tercentang.

## Fase A. Fondasi

### 01. Fondasi repo satu manifest dan modul source `in-progress`

Kerangka repo: tepat satu `package.json` di akar, tiga aplikasi, modul source internal, alias TypeScript, dan dev scripts. Done when: install, typecheck, build web, health server, CLI version, serta pemeriksaan satu manifest bekerja dari checkout bersih.

- [x] Design it (spec): [0001](../specs/0001-root-manifest-source-modules/index.md)
- [x] Build it: /develop root-manifest-source-modules
  - [x] Manifest akar tunggal, tsconfig, dan seluruh skeleton modul source tanpa manifest nested (AC-1, AC-2, AC-7, AC-8)
  - [x] Tiga aplikasi hidup: web Angular, server Elysia /health, CLI version (AC-3, AC-4, AC-5)
  - [x] Dev scripts, resolusi source dari konfigurasi akar, dan dokumentasi mulai cepat (AC-6, AC-9)
- [ ] [Verify it](../specs/0001-root-manifest-source-modules/verify.md): /check verify root-manifest-source-modules
- [ ] [Test it](../specs/0001-root-manifest-source-modules/test.md): /test root-manifest-source-modules

### 02. Quality tooling dan CI `in-progress`

Lint, format, test runner, hook Git, boundary check, penjaga satu manifest, dan CI. Done when: pelanggaran format, commit, boundary, dan manifest gagal otomatis di lokal serta CI.

- [x] Design it (spec): [0002](../specs/0002-quality-tooling-ci/index.md)
- [x] Build it: /develop quality-tooling-ci
  - [x] ESLint, Prettier, husky, commitlint, vitest, playwright (AC-1 sampai AC-5)
  - [x] Boundary check dependency-cruiser dan penjaga satu manifest dari aturan struktur.md (AC-6, AC-9)
  - [x] Workflow ci.yml dan dependabot (AC-7, AC-8)
- [ ] [Verify it](../specs/0002-quality-tooling-ci/verify.md): /check verify quality-tooling-ci
- [ ] [Test it](../specs/0002-quality-tooling-ci/test.md): /test quality-tooling-ci

### 03. Struktur kontrak OpenAPI v1 `in-progress`

Sumber kebenaran API: kontrak multi file, error model, security scheme, event WS. Done when: kontrak valid terbundel dengan enam path awal dan lint nya jalan di CI.

- [x] Design it (spec): [0003](../specs/0003-openapi-contract-structure/index.md)
- [x] Build it: /develop openapi-contract-structure
  - [x] Kerangka kontrak, ApiError, pagination, Capability, security scheme (AC-3 sampai AC-6)
  - [x] Enam path awal dan skema event WebSocket (AC-7, AC-8)
  - [x] Redocly lint dan bundel di CI (AC-1, AC-2)
- [ ] [Verify it](../specs/0003-openapi-contract-structure/verify.md): /check verify openapi-contract-structure
- [ ] [Test it](../specs/0003-openapi-contract-structure/test.md): /test openapi-contract-structure

### 04. Pipeline codegen dan contract test `in-progress`

Tipe dari kontrak, drift check, harness kesesuaian server. Done when: drift kontrak dan endpoint bayangan menggagalkan CI.

- [x] Design it (spec): [0004](../specs/0004-codegen-pipeline-contract-tests/index.md)
- [x] Build it: /develop codegen-pipeline-contract-tests
  - [x] Generasi tipe deterministik dan pemeriksaan drift (AC-1, AC-2, AC-6)
  - [x] Harness cakupan dua arah plus validasi response ajv (AC-3, AC-4, AC-5)
  - [x] Workflow contract.yml (AC-7)
  - code in `scripts/codegen/generate-contract-types.ts`, `tests/contract/`, dan `apps/server/src/app.ts`
- [ ] [Verify it](../specs/0004-codegen-pipeline-contract-tests/verify.md): /check verify codegen-pipeline-contract-tests
- [ ] [Test it](../specs/0004-codegen-pipeline-contract-tests/test.md): /test codegen-pipeline-contract-tests

### 05. SDK Angular core `in-progress`

Satu satunya jalur network Angular: transport, provider, SdkError. Done when: fitur web bisa memanggil API bertipe tanpa HttpClient telanjang dan boundary menegakkannya.

- [x] Design it (spec): [0005](../specs/0005-sdk-angular-core/index.md)
- [x] Build it: /develop sdk-angular-core
  - [x] Transport adapter, provider config, pemetaan SdkError (AC-2, AC-3, AC-5)
  - [x] Facade health, setup, auth di atas tipe generated plus event sessionExpired (AC-1, AC-4, AC-7)
  - [x] Aturan boundary anti raw fetch dan unit test (AC-6, AC-8)
  - code in `packages/sdk-angular/src`, `scripts/verify/check-boundaries.ts`, and `packages/sdk-angular/test/sdk.test.ts`
- [ ] [Verify it](../specs/0005-sdk-angular-core/verify.md): /check verify sdk-angular-core
- [x] [Test it](../specs/0005-sdk-angular-core/test.md): /test sdk-angular-core

### 06. CLI runtime dan data directory `in-progress`

Siklus hidup proses binary: serve, data directory, sinyal, SPA fallback. Done when: serve jalan dengan default aman, override bekerja, dan shutdown rapi.

- [x] Design it (spec): [0006](../specs/0006-cli-runtime-data-directory/index.md)
- [x] Build it: /develop cli-runtime-data-directory
  - [x] Resolusi data directory per platform plus subfolder (AC-2, AC-3)
  - [x] Perintah serve dan version, flag dan env, keluaran terminal (AC-1, AC-6, AC-7, AC-8)
  - [x] Graceful shutdown dan penyajian aset dengan SPA fallback (AC-4, AC-5)
  - code in `apps/cli/src`, `apps/server/src`, and `apps/cli/test/runtime.test.ts`
- [ ] [Verify it](../specs/0006-cli-runtime-data-directory/verify.md): /check verify cli-runtime-data-directory
- [ ] [Test it](../specs/0006-cli-runtime-data-directory/test.md): /test cli-runtime-data-directory

### 07. Perintah doctor dan migrate `in-progress`

Diagnostik aman dan migrasi eksplisit. Done when: doctor melaporkan kesehatan tanpa secret dengan exit code benar dan migrate idempotent.

- [x] Design it (spec): [0007](../specs/0007-doctor-migrate-commands/index.md)
- [x] Build it: /develop doctor-migrate-commands
  - [x] Registry DoctorCheck plus pemeriksaan dasar (AC-1, AC-2, AC-4)
  - [x] Presenter hasil dan mode json (AC-1, AC-3, AC-7)
  - [x] Perintah migrate dan migrate --status (AC-5, AC-6)
  - code in `apps/cli/src`, and `apps/cli/test/doctor.test.ts`
- [ ] [Verify it](../specs/0007-doctor-migrate-commands/verify.md): /check verify doctor-migrate-commands
- [ ] [Test it](../specs/0007-doctor-migrate-commands/test.md): /test doctor-migrate-commands

### 08. SQLite core dan migration runner `in-progress`

Penyimpanan internal: pragma benar, migrasi bernomor ber checksum, skema sebelas tabel. Done when: dari file kosong ke skema penuh secara idempotent dan gagal jelas bila rusak.

- [x] Design it (spec): [0008](../specs/0008-sqlite-core-migrations/index.md)
- [x] Build it: /develop sqlite-core-migrations
  - [x] Koneksi, pragma, transaksi, helper (AC-1, AC-6, AC-7)
  - [x] Runner migrasi ber checksum plus integrasi boot (AC-2, AC-3, AC-5)
  - [x] Migrasi 0001 sebelas tabel plus generator UUIDv7 dan integration test (AC-4, AC-8)
  - code in `packages/internal-sqlite`, `packages/kernel/ids`, `apps/cli/src`, and `tests/integration/internal-sqlite/`
- [ ] [Verify it](../specs/0008-sqlite-core-migrations/verify.md): /check verify sqlite-core-migrations
- [ ] [Test it](../specs/0008-sqlite-core-migrations/test.md): /test sqlite-core-migrations

### 09. Internal repositories `in-progress`

Port dan repository untuk semua tabel internal plus unit of work dan fake. Done when: round trip semua repository terbukti tanpa server eksternal.

- [x] Design it (spec): [0009](../specs/0009-internal-repositories/index.md)
- [x] Build it: /develop internal-repositories
  - [x] Entity, port, dan tipe EncryptedCredential di internal-domain (AC-1, AC-2)
  - [x] Implementasi SQLite semua repository plus retensi history dan audit append only (AC-3, AC-5, AC-6)
  - [x] Unit of work, fake testkit, integration test (AC-4, AC-7, AC-8)
  - code in `packages/internal-domain`, `packages/internal-sqlite`, `packages/testkit`, and `tests/integration/internal-sqlite/`
- [ ] [Verify it](../specs/0009-internal-repositories/verify.md): /check verify internal-repositories
- [ ] [Test it](../specs/0009-internal-repositories/test.md): /test internal-repositories

### 10. Key provider dan password hashing `in-progress`

ADR keamanan: keyfile plus override env, argon2id. Done when: first run menghasilkan keyfile 0600, override bekerja, hash dan verify teruji.

- [x] Design it (spec): [0010](../specs/0010-key-provider-password-hashing/index.md)
- [ ] Build it: /develop key-provider-password-hashing
  - [x] Key provider (first run atomik, permission check, keyId, override) (AC-1 sampai AC-4)
  - [x] Password hasher argon2id, policy, needsRehash (AC-6, AC-7, AC-8)
  - [ ] Doctor check keyfile dan test keamanan (AC-4, AC-5, AC-9)
- [ ] [Verify it](../specs/0010-key-provider-password-hashing/verify.md): /check verify key-provider-password-hashing
- [ ] [Test it](../specs/0010-key-provider-password-hashing/test.md): /test key-provider-password-hashing

### 11. Credential vault dan redaction `in-progress`

AES-256-GCM dengan AAD plus modul sensor tiga lapis. Done when: file db terbukti bebas plaintext dan tiga saluran keluaran tersensor.

- [x] Design it (spec): [0011](../specs/0011-credential-vault-redaction/index.md)
- [x] Build it: /develop credential-vault-redaction
  - [x] Vault encrypt decrypt dengan AAD, key_id check, API use (AC-1 sampai AC-4)
  - [x] Modul redaction tiga mekanisme plus integrasi saluran keluar (AC-5, AC-6)
  - [x] Test keamanan termasuk pemindaian byte file db (AC-7)
- [ ] [Verify it](../specs/0011-credential-vault-redaction/verify.md): /check verify credential-vault-redaction
- [ ] [Test it](../specs/0011-credential-vault-redaction/test.md): /test credential-vault-redaction

### 12. Package config `in-progress`

Loader konfigurasi tunggal tervalidasi. Done when: prioritas flag env file default bekerja dan config tak valid menggagalkan boot dengan pesan per kunci.

- [x] Design it (spec): [0012](../specs/0012-config-package/index.md)
- [x] Build it: /develop config-package
  - [x] Schema TypeBox, default, flag sensitif (AC-1)
  - [x] Loader berprioritas dengan metadata sumber plus redaction dump (AC-2 sampai AC-5)
  - [x] Integrasi CLI dan doctor check plus unit test (AC-6, AC-7)
  - code in `packages/config/`, `apps/cli/src/`, `apps/server/src/`, and `packages/config/test/config.test.ts`
- [ ] [Verify it](../specs/0012-config-package/verify.md): /check verify config-package
- [ ] [Test it](../specs/0012-config-package/test.md): /test config-package

### 13. Package observability `in-progress`

Log JSON terstruktur, correlation ID, error handler tunggal. Done when: setiap error klien membawa correlation yang bisa ditemukan di log dan log tersensor.

- [x] Design it (spec): [0013](../specs/0013-observability-package/index.md)
- [x] Build it: /develop observability-package
  - [x] Logger JSON plus file rotasi plus larangan console (AC-1, AC-7)
  - [x] Correlation AsyncLocalStorage plus middleware plus error handler ApiError 500 (AC-2, AC-3, AC-5)
  - [x] Redaction wajib di jalur tulis dan metric dasar (AC-4, AC-6)
  - code in `packages/observability/`, `apps/server/src/`, `apps/cli/src/bootstrap/runtime-lifecycle.ts`, and `tooling/eslint/eslint.config.mjs`
- [ ] [Verify it](../specs/0013-observability-package/verify.md): /check verify observability-package
- [ ] [Test it](../specs/0013-observability-package/test.md): /test observability-package

### 14. UI foundation dan theme `in-progress`

@ojiepermana/angular sebagai fondasi tunggal plus theme Myadmin. Done when: light dark system bekerja hidup, preferensi bertahan, dan design system kedua terlarang oleh lint.

- [x] Design it (spec): [0014](../specs/0014-ui-foundation-theme/index.md)
- [x] Build it: /develop ui-foundation-theme
  - [x] Instalasi paket (verifikasi npm) plus konfigurasi theme dan store preferensi (AC-1 sampai AC-4)
  - [x] Audit kapabilitas komponen V1 plus halaman demo dev (AC-5, AC-6)
  - [x] Aturan lint larangan design system kedua (AC-7)
  - code in `apps/web/src/app/core/theme/`, `apps/web/src/app/features/ui-foundation-demo/`, and `scripts/quality/check-ui-boundary.ts`
- [ ] [Verify it](../specs/0014-ui-foundation-theme/verify.md): /check verify ui-foundation-theme
- [ ] [Test it](../specs/0014-ui-foundation-theme/test.md): /test ui-foundation-theme

### 15. App shell dan navigation `in-progress`

Shell aplikasi: top bar, sidebar, tab host, panel, status bar, context menu, error presenter, routing lazy. Done when: kerangka bisa dinavigasi penuh keyboard dan tab berbentuk data.

- [x] Design it (spec): [0015](../specs/0015-app-shell-navigation/index.md)
- [x] Build it: /develop app-shell-navigation
  - [x] Komponen layout plus panel resizable (AC-1, AC-2)
  - [x] Tab host berbasis TabDescriptor plus context menu plus routing lazy semua fitur (AC-3, AC-4, AC-5)
  - [x] Error presenter dan boundary plus baseline aksesibilitas (AC-6, AC-7, AC-8)
  - code in `apps/web/src/app/layout/app-shell/`, `apps/web/src/app/core/state/`, `apps/web/src/app/core/context-menu/`, `apps/web/src/app/core/errors/`, and `apps/web/src/app/app.routes.shared.ts`
- [ ] [Verify it](../specs/0015-app-shell-navigation/verify.md): /check verify app-shell-navigation
- [ ] [Test it](../specs/0015-app-shell-navigation/test.md): /test app-shell-navigation

## Fase B. Auth dan audit

### 16. Initial setup end to end `in-progress`

Tracer bullet pertama: klaim instance lewat pembuatan Admin pertama. Done when: instance kosong memaksa setup, race menghasilkan tepat satu admin, dan setup kedua ditolak.

- [x] Design it (spec): [0016](../specs/0016-initial-setup-flow/index.md)
- [x] Build it: /develop initial-setup-flow
  - [x] Use case initial admin transaksional plus audit plus rate limit (AC-3, AC-4, AC-6, AC-7)
  - [x] Guard SETUP_REQUIRED server dan web plus halaman setup (AC-1, AC-2, AC-5, AC-8)
  - [x] Contract test dan e2e alur setup (AC-9)
- [x] [Verify it](../specs/0016-initial-setup-flow/verify.md): /check verify initial-setup-flow
- [x] [Test it](../specs/0016-initial-setup-flow/test.md): /test initial-setup-flow

### 17. Login, logout, dan session `in-progress`

Sesi opaque server side dengan cookie HttpOnly, expiry ganda, CSRF. Done when: sesi kadaluarsa dan logout benar menutup HTTP dan WS tanpa sisa di browser.

- [x] Design it (spec): [0017](../specs/0017-login-session/index.md)
- [x] Build it: /develop login-session
  - [x] Use case session (create, validate idle absolut, revoke, purge) (AC-1, AC-4, AC-10)
  - [x] Endpoint login logout me plus rate limit dan pesan seragam plus CSRF (AC-2, AC-3, AC-6, AC-7)
  - [x] Middleware sesi HTTP dan WS plus halaman login plus audit plus e2e (AC-5, AC-8, AC-9)
- [x] [Verify it](../specs/0017-login-session/verify.md): /check verify login-session
- [x] [Test it](../specs/0017-login-session/test.md): /test login-session

### 18. User management dan change password `in-progress`

Ganti password sendiri plus kelola user oleh Admin dengan invariant Admin terakhir. Done when: dua peran ditegakkan dua lapis dan deactivate memutus sesi seketika.

- [x] Design it (spec): [0018](../specs/0018-user-management-change-password/index.md)
- [ ] Build it: /develop user-management-change-password
  - [ ] Use case change password, create user, role status, reset password (AC-1, AC-3 sampai AC-6)
  - [ ] Endpoint admin only plus kontrak plus audit (AC-2, AC-8)
  - [ ] Halaman ganti password dan manajemen user plus e2e otorisasi (AC-7, AC-9)
- [ ] [Verify it](../specs/0018-user-management-change-password/verify.md): /check verify user-management-change-password
- [ ] [Test it](../specs/0018-user-management-change-password/test.md): /test user-management-change-password

### 19. Subsistem audit append only `in-progress`

Taksonomi event, writer tersensor, sukses menunggu audit. Done when: aksi wajib audit tidak pernah sukses tanpa baris audit dan payload selalu tersensor.

- [x] Design it (spec): [0019](../specs/0019-audit-subsystem/index.md)
- [x] Build it: /develop audit-subsystem
  - [x] Taksonomi tertutup plus writer dengan redaction dan correlation (AC-1, AC-2, AC-4, AC-5)
  - [x] Helper withAudit dengan semantik urutan (AC-3)
  - [x] Migrasi penulisan audit fitur sebelumnya plus doctor check ukuran plus test (AC-6, AC-7, AC-8)
- [ ] [Verify it](../specs/0019-audit-subsystem/verify.md): /check verify audit-subsystem
- [ ] [Test it](../specs/0019-audit-subsystem/test.md): /test audit-subsystem

### 20. Halaman audit Admin `in-progress`

Jalur baca audit dengan filter dan pagination. Done when: Admin bisa menelusuri kejadian dan role user ditolak.

- [x] Design it (spec): [0020](../specs/0020-audit-admin-page/index.md)
- [x] Build it: /develop audit-admin-page
  - [x] Query berfilter berindeks plus endpoint admin plus daftar action (AC-1 sampai AC-4, AC-6)
  - [x] Halaman grid dengan panel filter dan baris expandable plus e2e (AC-5, AC-7)
  - code in `apps/server/src/app.ts`, `packages/internal-sqlite/src/repositories/audit.ts`, `packages/sdk-angular/src/facades/audit-client.ts`, and `apps/web/src/app/features/audit/`
- [ ] [Verify it](../specs/0020-audit-admin-page/verify.md): /check verify audit-admin-page
- [ ] [Test it](../specs/0020-audit-admin-page/test.md): /test audit-admin-page

## Fase C. Provider dan koneksi

### 21. Kontrak database-core dan capability `in-progress`

Port kecil per domain, capability model, registry, error ternormalisasi, context tak serializable. Done when: suite kontrak generik lulus atas provider fake referensi.

- [x] Design it (spec): [0021](../specs/0021-database-core-contracts/index.md)
- [x] Build it: /develop database-core-contracts
  - [x] Model umum, DbError berkategori, seluruh port termasuk ViewPort (AC-1, AC-6, AC-7, AC-8)
  - [x] Capability model tertutup plus ConnectionContext aman plus registry (AC-2 sampai AC-5)
  - [x] Suite test kontrak generik plus provider fake (AC-9)
- [ ] [Verify it](../specs/0021-database-core-contracts/verify.md): /check verify database-core-contracts
- [ ] [Test it](../specs/0021-database-core-contracts/test.md): /test database-core-contracts

### 22. PostgreSQL koneksi dan capability `in-progress`

Bun.sql, TLS tegas, capability, mapping SQLSTATE, infrastruktur cancel. Done when: suite kontrak lulus di dua versi PostgreSQL nyata dan TLS gagal tertutup.

- [x] Design it (spec): [0022](../specs/0022-postgresql-connection-capability/index.md)
- [x] Build it: /develop postgresql-connection-capability
  - [x] Driver adaptor, registry sesi, timeout, lingkungan test dua versi (AC-1, AC-3, AC-8)
  - [x] Mode TLS lengkap plus mapper SQLSTATE plus capability per versi (AC-2, AC-5, AC-6)
  - [x] test() dan cancel ganda plus boundary antar provider (AC-4, AC-7, AC-9)
- [ ] [Verify it](../specs/0022-postgresql-connection-capability/verify.md): /check verify postgresql-connection-capability
- [ ] [Test it](../specs/0022-postgresql-connection-capability/test.md): /test postgresql-connection-capability

### 23. PostgreSQL metadata `in-progress`

Introspeksi pg_catalog lazy dan paginated. Done when: describeTable cukup untuk designer dan 2000 table tetap responsif.

- [x] Design it (spec): [0023](../specs/0023-postgresql-metadata/index.md)
- [ ] Build it: /develop postgresql-metadata
  - [x] Quoting terpusat plus daftar database schema object paginated (AC-1, AC-2, AC-6)
  - [ ] describeTable lengkap, definisi view, routine (AC-3, AC-4)
  - [ ] Pencarian object plus ukuran malas plus test performa (AC-5, AC-7, AC-8)
- [ ] [Verify it](../specs/0023-postgresql-metadata/verify.md): /check verify postgresql-metadata
- [ ] [Test it](../specs/0023-postgresql-metadata/test.md): /test postgresql-metadata

### 24. MySQL koneksi dan capability `in-progress`

Cermin feature 22 untuk MySQL dengan KILL QUERY. Done when: suite kontrak lulus di dua versi MySQL nyata.

- [x] Design it (spec): [0024](../specs/0024-mysql-connection-capability/index.md)
- [x] Build it: /develop mysql-connection-capability
  - [x] Driver adaptor plus connection_id plus lingkungan test (AC-1, AC-7)
  - [x] TLS lengkap plus mapper kode error plus capability dengan reasons (AC-2, AC-4, AC-5)
  - [x] test() dan cancel KILL QUERY plus boundary (AC-3, AC-6, AC-8)
- [ ] [Verify it](../specs/0024-mysql-connection-capability/verify.md): /check verify mysql-connection-capability
- [ ] [Test it](../specs/0024-mysql-connection-capability/test.md): /test mysql-connection-capability

### 25. MySQL metadata `in-progress`

Introspeksi information_schema dengan hierarki datar. Done when: bentuk hasil identik lintas provider dibuktikan test bentuk.

- [x] Design it (spec): [0025](../specs/0025-mysql-metadata/index.md)
- [ ] Build it: /develop mysql-metadata
  - [x] Quoting backtick plus daftar database dan object termasuk trigger (AC-1, AC-2, AC-6)
  - [x] describeTable lengkap plus definisi view dan routine (AC-3, AC-4)
  - [ ] Pencarian plus test bentuk lintas provider dan performa (AC-5, AC-7, AC-8)
  - code in `packages/database-mysql/src/metadata/`, `packages/database-mysql/test/metadata.test.ts`, and `packages/database-core/src/models/index.ts`
- [ ] [Verify it](../specs/0025-mysql-metadata/verify.md): /check verify mysql-metadata
- [ ] [Test it](../specs/0025-mysql-metadata/test.md): /test mysql-metadata

### 26. Connection manager CRUD dan vault `in-progress`

Kelola koneksi tersimpan dengan credential terenkripsi dan batas Admin yang jelas. Done when: alur buat, test, ubah, duplikasi, hapus bekerja dua engine tanpa satu pun secret bocor.

- [x] Design it (spec): [0026](../specs/0026-connection-manager-crud/index.md)
- [ ] Build it: /develop connection-manager-crud
  - [ ] Use case CRUD koneksi plus vault plus policies otorisasi plus audit (AC-1, AC-2, AC-4 sampai AC-9)
  - [ ] Endpoint test dengan secret transient plus rate limit (AC-3)
  - [ ] Halaman connections lengkap plus server group plus e2e dan test keamanan (AC-7, AC-10)
- [ ] [Verify it](../specs/0026-connection-manager-crud/verify.md): /check verify connection-manager-crud
- [ ] [Test it](../specs/0026-connection-manager-crud/test.md): /test connection-manager-crud

### 27. Connection lifecycle dan status `in-progress`

Connect eksplisit, registry sesi aktif, status jujur di sidebar dan status bar. Done when: status yang tampil selalu sama dengan kenyataan server dan reconnect memulihkan error.

- [x] Design it (spec): [0027](../specs/0027-connection-lifecycle-status/index.md)
- [ ] Build it: /develop connection-lifecycle-status
  - [ ] Registry sesi aktif plus transisi plus idle timeout plus pembersihan (AC-2, AC-5, AC-6, AC-9)
  - [ ] Endpoint connect disconnect reconnect status plus audit (AC-1, AC-3, AC-4, AC-8)
  - [ ] UI status sidebar dan status bar plus dialog password transient plus e2e (AC-4, AC-7)
- [ ] [Verify it](../specs/0027-connection-lifecycle-status/verify.md): /check verify connection-lifecycle-status
- [ ] [Test it](../specs/0027-connection-lifecycle-status/test.md): /test connection-lifecycle-status

### 28. Jobs infrastructure `in-progress`

Mesin pekerjaan panjang dalam proses: progress, cancel kooperatif, kepemilikan. Done when: job berjalan berbatas konkurensi, bisa dibatalkan, dan tidak pernah merobohkan proses.

- [x] Design it (spec): [0028](../specs/0028-jobs-infrastructure/index.md)
- [x] Build it: /develop jobs-infrastructure
  - [x] Model job, state machine, JobManager dengan antrean dan pembersihan (AC-1, AC-2, AC-6)
  - [x] Cancellation AbortSignal plus progress throttled plus normalisasi error (AC-3, AC-4, AC-7)
  - [x] API jobs berkepemilikan plus unit test lengkap (AC-5, AC-8)
  - code in `packages/jobs/src`, `apps/server/src/app.ts`, `packages/api-contract/openapi/v1`, `packages/sdk-angular/src`, and `tests/`
- [ ] [Verify it](../specs/0028-jobs-infrastructure/verify.md): /check verify jobs-infrastructure
- [ ] [Test it](../specs/0028-jobs-infrastructure/test.md): /test jobs-infrastructure

### 29. Realtime WebSocket `in-progress`

Kanal multiplexed berotorisasi plus klien SDK dengan reconnect. Done when: progress job dan status koneksi mengalir push dan pulih otomatis setelah putus.

- [x] Design it (spec): [0029](../specs/0029-realtime-websocket/index.md)
- [ ] Build it: /develop realtime-websocket
  - [ ] Transport WS server: upgrade bersesi, protokol, otorisasi channel, heartbeat, batas (AC-1, AC-2, AC-3, AC-5)
  - [ ] Penyambungan sumber event jobs dan status plus redaction jalur WS (AC-4, AC-7)
  - [ ] RealtimeClient SDK dengan backoff dan resubscribe plus peralihan status ke push plus test (AC-6, AC-8)
- [ ] [Verify it](../specs/0029-realtime-websocket/verify.md): /check verify realtime-websocket
- [ ] [Test it](../specs/0029-realtime-websocket/test.md): /test realtime-websocket

### 30. Workspace persistence `in-progress`

Tab, panel, dan konteks bertahan lintas login. Done when: susunan pulih setelah login dan referensi mati dibuang dengan pemberitahuan.

- [x] Design it (spec): [0030](../specs/0030-workspace-persistence/index.md)
- [ ] Build it: /develop workspace-persistence
  - [ ] Kontrak dan endpoint workspace dengan schema berversi dan batas ukuran (AC-1, AC-2, AC-6)
  - [ ] Sinkronisasi store klien: debounce, flush, restore tersanitasi (AC-3, AC-4, AC-5)
  - [ ] E2e restore dua skenario (AC-7)
- [ ] [Verify it](../specs/0030-workspace-persistence/verify.md): /check verify workspace-persistence
- [ ] [Test it](../specs/0030-workspace-persistence/test.md): /test workspace-persistence

## Fase D. Fitur database inti

### 31. Object explorer `in-progress`

Pohon lazy data driven dengan context menu bergerbang capability. Done when: telusur dua engine bekerja tanpa satu pun cabang nama engine di UI.

- [x] Design it (spec): [0031](../specs/0031-object-explorer/index.md)
- [ ] Build it: /develop object-explorer
  - [ ] Endpoint metadata generik plus pemeriksaan koneksi (AC-1)
  - [ ] Pohon virtualized lazy dengan halaman berikutnya dan error per node (AC-2, AC-3, AC-4, AC-7)
  - [ ] Registry aksi context menu plus refresh per node plus e2e (AC-5, AC-6, AC-8)
- [ ] [Verify it](../specs/0031-object-explorer/verify.md): /check verify object-explorer
- [ ] [Test it](../specs/0031-object-explorer/test.md): /test object-explorer

### 32. Object search `in-progress`

Pencarian nama object server side dari panel explorer. Done when: pencarian pada 2000 table cepat dan hasil bisa dilompati ke node.

- [x] Design it (spec): [0032](../specs/0032-object-search/index.md)
- [ ] Build it: /develop object-search
  - [ ] Endpoint search paginated (AC-1, AC-2)
  - [ ] UI pencarian dengan debounce, abort, dan lompat ke node (AC-3, AC-4, AC-5)
  - [ ] E2e pada fixture besar (AC-6)
- [ ] [Verify it](../specs/0032-object-search/verify.md): /check verify object-search
- [ ] [Test it](../specs/0032-object-search/test.md): /test object-search

### 33. Query editor tab dan eksekusi `in-progress`

Inti produk: tab CodeMirror berkonteks, sesi per tab, eksekusi asinkron, autocomplete, history. Done when: multi statement, transaksi lintas eksekusi, dan posisi error bekerja di dua engine.

- [x] Design it (spec): [0033](../specs/0033-query-editor-execution/index.md)
- [ ] Build it: /develop query-editor-execution
  - [ ] Kontrak eksekusi plus bentuk sel berlabel tipe plus pemecah statement per engine (AC-4, AC-6, AC-8)
  - [ ] Use case eksekusi: sesi per tab, urutan statement, event WS, history (AC-4, AC-5, AC-7)
  - [ ] Editor CodeMirror, konteks tab, autocomplete malas, render hasil dan error berposisi (AC-1, AC-2, AC-3, AC-6)
  - [ ] E2e dua engine termasuk transaksi manual (AC-9)
- [ ] [Verify it](../specs/0033-query-editor-execution/verify.md): /check verify query-editor-execution
- [ ] [Test it](../specs/0033-query-editor-execution/test.md): /test query-editor-execution

### 34. Result grid dan export result `in-progress`

ResultGrid bertipe aman dengan multiple result set dan export klien. Done when: NULL, JSON, dan presisi tampil benar dan 5000 baris mulus.

- [x] Design it (spec): [0034](../specs/0034-result-grid-export/index.md)
- [ ] Build it: /develop result-grid-export
  - [ ] ResultGrid virtualized dengan render sel bertipe dan viewer JSON (AC-1, AC-3, AC-7)
  - [ ] Sub tab result set, panel error, salin dan export klien (AC-2, AC-4, AC-5, AC-6)
  - [ ] Test render, kinerja, dan e2e (AC-8)
- [ ] [Verify it](../specs/0034-result-grid-export/verify.md): /check verify result-grid-export
- [ ] [Test it](../specs/0034-result-grid-export/test.md): /test result-grid-export

### 35. Query cancel dan EXPLAIN `in-progress`

Membatalkan eksekusi berjalan dan rencana eksekusi teks. Done when: query tidur dibatalkan cepat dengan sesi tetap hidup dan explain bergerbang capability.

- [x] Design it (spec): [0035](../specs/0035-query-cancel-explain/index.md)
- [ ] Build it: /develop query-cancel-explain
  - [ ] Cancel di use case query dengan konfirmasi provider dan idempotensi (AC-1, AC-2, AC-4)
  - [ ] EXPLAIN per engine plus endpoint (AC-5, AC-6, AC-7)
  - [ ] UI tombol cancel bergerbang, aksi darurat, panel explain plus test (AC-3, AC-8)
- [ ] [Verify it](../specs/0035-query-cancel-explain/verify.md): /check verify query-cancel-explain
- [ ] [Test it](../specs/0035-query-cancel-explain/test.md): /test query-cancel-explain

### 36. Query history dan saved queries `in-progress`

Riwayat otomatis dan query bernama, privat per user. Done when: pencarian riwayat, buka ulang berkonteks, dan isolasi antar user terbukti.

- [x] Design it (spec): [0036](../specs/0036-query-history-saved-queries/index.md)
- [ ] Build it: /develop query-history-saved-queries
  - [ ] Endpoint history berfilter plus saved queries CRUD berkepemilikan (AC-1, AC-2, AC-4, AC-6)
  - [ ] Halaman dua tab plus panel cepat editor plus simpan cepat (AC-5, AC-7)
  - [ ] E2e dan test otorisasi (AC-3, AC-8)
- [ ] [Verify it](../specs/0036-query-history-saved-queries/verify.md): /check verify query-history-saved-queries
- [ ] [Test it](../specs/0036-query-history-saved-queries/test.md): /test query-history-saved-queries

### 37. Data browser jalur baca `in-progress`

Browse table berhalaman dengan filter terstruktur aman. Done when: table sejuta baris dibuka ringan dan injeksi lewat filter mustahil.

- [x] Design it (spec): [0037](../specs/0037-data-browser-read/index.md)
- [ ] Build it: /develop data-browser-read
  - [ ] Kontrak read plus penerjemah filter sort pagination di kedua provider (AC-1 sampai AC-5)
  - [ ] Tab data dengan grid mode browser, filter kolom, pemilih kolom (AC-6, AC-7)
  - [ ] Test NFR-01, injeksi, dan e2e (AC-8, AC-9)
- [ ] [Verify it](../specs/0037-data-browser-read/verify.md): /check verify data-browser-read
- [ ] [Test it](../specs/0037-data-browser-read/test.md): /test data-browser-read

### 38. Data browser jalur tulis `in-progress`

Insert, edit, delete berbasis identitas baris aman. Done when: konflik terdeteksi lewat affected count dan table tanpa PK read only dengan penjelasan.

- [x] Design it (spec): [0038](../specs/0038-data-browser-write/index.md)
- [ ] Build it: /develop data-browser-write
  - [ ] Penentuan rowIdentity plus mutasi berparameter dengan semantik affected dan transaksi (AC-1, AC-2, AC-3, AC-6, AC-8)
  - [ ] Delete dan bulk delete berkonfirmasi berjumlah plus audit (AC-4, AC-7)
  - [ ] Editor sel bertipe termasuk NULL dan JSON plus e2e konflik (AC-5, AC-9)
- [ ] [Verify it](../specs/0038-data-browser-write/verify.md): /check verify data-browser-write
- [ ] [Test it](../specs/0038-data-browser-write/test.md): /test data-browser-write

### 39. Manajemen database `in-progress`

Properti, create data driven per engine, drop ketik nama. Done when: pola konfirmasi destructive baku lahir dan teruji dua engine.

- [x] Design it (spec): [0039](../specs/0039-database-management/index.md)
- [ ] Build it: /develop database-management
  - [ ] DatabasePort create drop properties di kedua provider (AC-1, AC-2, AC-3)
  - [ ] Komponen destructive-action-confirmation plus verifikasi confirmName server plus audit (AC-3, AC-4)
  - [ ] Halaman properti dan form create data driven plus e2e (AC-2, AC-5, AC-6)
- [ ] [Verify it](../specs/0039-database-management/verify.md): /check verify database-management
- [ ] [Test it](../specs/0039-database-management/test.md): /test database-management

### 40. Manajemen schema `in-progress`

Schema PostgreSQL bergerbang capability, absen total di MySQL. Done when: gerbang terbukti dua arah dan drop hanya schema kosong.

- [x] Design it (spec): [0040](../specs/0040-schema-management/index.md)
- [ ] Build it: /develop schema-management
  - [ ] SchemaPort PostgreSQL create rename drop restrict (AC-1)
  - [ ] Endpoint bergerbang tegas plus audit (AC-2, AC-3, AC-5)
  - [ ] UI form dan peringatan rename plus e2e dua arah (AC-4, AC-6)
- [ ] [Verify it](../specs/0040-schema-management/verify.md): /check verify schema-management
- [ ] [Test it](../specs/0040-schema-management/test.md): /test schema-management

### 41. Table designer kolom `in-progress`

Create dan alter kolom lewat change set dengan pratinjau DDL wajib. Done when: yang tampil di pratinjau persis yang dijalankan dan validasi per field bekerja.

- [x] Design it (spec): [0041](../specs/0041-table-designer-columns/index.md)
- [ ] Build it: /develop table-designer-columns
  - [ ] Modul tipe engine plus kompilator change set dengan test snapshot (AC-1, AC-2, AC-3, AC-5)
  - [ ] Endpoint preview apply dengan semantik transaksi per engine plus audit (AC-4, AC-6)
  - [ ] UI editor kolom plus panel pratinjau plus invalidasi metadata plus e2e (AC-3, AC-7, AC-8)
- [ ] [Verify it](../specs/0041-table-designer-columns/verify.md): /check verify table-designer-columns
- [ ] [Test it](../specs/0041-table-designer-columns/test.md): /test table-designer-columns

### 42. Table designer index dan constraint `in-progress`

PK, FK, unique, check, index komposit di mesin change set yang sama. Done when: FK dengan aturan ON dan composite unique bekerja dua engine lewat pratinjau.

- [x] Design it (spec): [0042](../specs/0042-table-designer-indexes-constraints/index.md)
- [ ] Build it: /develop table-designer-indexes-constraints
  - [ ] Perluasan change set dan kompilator plus snapshot (AC-2 sampai AC-5)
  - [ ] UI tab index dan constraint plus editor FK (AC-1, AC-3, AC-5)
  - [ ] Konfirmasi destructive, peringatan dampak PK FK, audit, e2e (AC-6, AC-7, AC-8)
- [ ] [Verify it](../specs/0042-table-designer-indexes-constraints/verify.md): /check verify table-designer-indexes-constraints
- [ ] [Test it](../specs/0042-table-designer-indexes-constraints/test.md): /test table-designer-indexes-constraints

### 43. Operasi destructive table `in-progress`

Rename, truncate, drop dengan dialog berinformasi dampak. Done when: ketiganya berkonfirmasi ketik nama terverifikasi server dan teraudit.

- [x] Design it (spec): [0043](../specs/0043-table-destructive-operations/index.md)
- [ ] Build it: /develop table-destructive-operations
  - [ ] Operasi provider plus query dampak dependensi (AC-1, AC-2, AC-3)
  - [ ] Endpoint dengan confirmName plus audit (AC-4)
  - [ ] Tiga dialog berinformasi plus penanganan tab basi plus e2e (AC-1, AC-5, AC-6)
- [ ] [Verify it](../specs/0043-table-destructive-operations/verify.md): /check verify table-destructive-operations
- [ ] [Test it](../specs/0043-table-destructive-operations/test.md): /test table-destructive-operations

### 44. Manajemen view `in-progress`

CRUD GUI penuh untuk view sesuai keputusan produk. Done when: create, ubah definisi (termasuk jalur drop create PostgreSQL berkonfirmasi), dan drop bekerja dua engine.

- [x] Design it (spec): [0044](../specs/0044-view-management/index.md)
- [ ] Build it: /develop view-management
  - [ ] ViewPort kedua provider dengan analisis strategi update (AC-3)
  - [ ] Endpoint bergerbang viewEditor plus audit (AC-3, AC-4, AC-5)
  - [ ] Halaman editor view dengan pratinjau DDL plus aksi explorer plus e2e (AC-1, AC-2, AC-6, AC-7, AC-8)
- [ ] [Verify it](../specs/0044-view-management/verify.md): /check verify view-management
- [ ] [Test it](../specs/0044-view-management/test.md): /test view-management

### 45. Security database principal `in-progress`

Kelola role dan account database target lewat form dinamis. Done when: create, edit, reset password, drop bekerja dua engine tanpa satu pun rahasia di response.

- [x] Design it (spec): [0045](../specs/0045-database-security-principals/index.md)
- [ ] Build it: /develop database-security-principals
  - [ ] SecurityPort principal di kedua provider plus deklarasi form (AC-1, AC-2, AC-3)
  - [ ] Reset password aman plus drop berkonfirmasi plus audit plus gerbang (AC-4 sampai AC-7)
  - [ ] UI daftar dan form dinamis plus e2e dan test kebersihan rahasia (AC-2, AC-8)
- [ ] [Verify it](../specs/0045-database-security-principals/verify.md): /check verify database-security-principals
- [ ] [Test it](../specs/0045-database-security-principals/test.md): /test database-security-principals

### 46. Security database privilege `in-progress`

Grant dan revoke level database dan table lewat matriks berpratinjau. Done when: efek grant terbukti nyata di server target dan revoke selalu berkonfirmasi.

- [x] Design it (spec): [0046](../specs/0046-database-security-privileges/index.md)
- [ ] Build it: /develop database-security-privileges
  - [ ] Introspeksi grant efektif plus katalog privilege plus kompilator di kedua provider (AC-1, AC-2)
  - [ ] Endpoint preview apply dengan konfirmasi revoke plus audit plus gerbang (AC-3 sampai AC-6)
  - [ ] UI matriks privilege plus e2e efek nyata (AC-3, AC-7)
- [ ] [Verify it](../specs/0046-database-security-privileges/verify.md): /check verify database-security-privileges
- [ ] [Test it](../specs/0046-database-security-privileges/test.md): /test database-security-privileges

## Fase E. Operasi data

### 47. Export `in-progress`

Export SQL CSV JSON streaming sebagai job dengan unduhan terautentikasi. Done when: sejuta baris terekspor dengan memori datar dan cancel membersihkan.

- [x] Design it (spec): [0047](../specs/0047-export-jobs/index.md)
- [ ] Build it: /develop export-jobs
  - [ ] Penulis format streaming plus pembaca cursor dan quoting per engine (AC-1, AC-2, AC-3)
  - [ ] Executor job export plus unduhan berkadaluarsa plus pembersih temp plus audit (AC-3, AC-4, AC-5, AC-7)
  - [ ] Dialog export, integrasi tombol grid, panel jobs plus e2e skala (AC-6, AC-8)
- [ ] [Verify it](../specs/0047-export-jobs/verify.md): /check verify export-jobs
- [ ] [Test it](../specs/0047-export-jobs/test.md): /test export-jobs

### 48. Import `in-progress`

Import SQL dan CSV sebagai job dengan unggah streaming dan pemetaan kolom. Done when: roundtrip export import utuh dan kegagalan menunjuk posisi persis.

- [x] Design it (spec): [0048](../specs/0048-import-jobs/index.md)
- [ ] Build it: /develop import-jobs
  - [ ] Unggah streaming berbatas plus pratinjau server (AC-1, AC-7)
  - [ ] Executor SQL (mode transaksi, posisi error) dan CSV (pemetaan, batch, ambang gagal) (AC-2, AC-3, AC-5)
  - [ ] Truncate first berkonfirmasi plus audit plus UI alur import plus e2e roundtrip (AC-4, AC-6, AC-8)
- [ ] [Verify it](../specs/0048-import-jobs/verify.md): /check verify import-jobs
- [ ] [Test it](../specs/0048-import-jobs/test.md): /test import-jobs

### 49. Backup `in-progress`

Logical backup lewat native tool dengan deteksi jujur. Done when: backup valid dihasilkan dua engine dan tanpa tool fitur menyatakan diri tidak tersedia.

- [x] Design it (spec): [0049](../specs/0049-backup/index.md)
- [ ] Build it: /develop backup
  - [ ] Deteksi tool plus doctor check plus capability (AC-1, AC-7)
  - [ ] Executor subprocess aman (password tanpa argv, gzip streaming, validasi artefak, manifest) (AC-2, AC-3, AC-4)
  - [ ] Endpoint daftar unduh hapus plus audit plus UI plus e2e (AC-5, AC-6, AC-8)
- [ ] [Verify it](../specs/0049-backup/verify.md): /check verify backup
- [ ] [Test it](../specs/0049-backup/test.md): /test backup

### 50. Restore `in-progress`

Pemulihan dari artefak dengan konfirmasi paling ketat. Done when: roundtrip backup restore identik dan dump engine salah ditolak sebelum kerusakan.

- [x] Design it (spec): [0050](../specs/0050-restore/index.md)
- [ ] Build it: /develop restore
  - [ ] Validasi artefak (format, engine) plus endpoint validate (AC-1)
  - [ ] Executor restore (database baru opsional, subprocess, parsial jujur) plus audit started completed (AC-2, AC-4, AC-5)
  - [ ] Konfirmasi ketik nama terverifikasi plus UI alur plus e2e roundtrip (AC-3, AC-6, AC-7)
- [ ] [Verify it](../specs/0050-restore/verify.md): /check verify restore
- [ ] [Test it](../specs/0050-restore/test.md): /test restore

### 51. Monitoring status dasar `in-progress`

Kartu kesehatan per koneksi, event driven, batas V1 dinyatakan. Done when: kartu reaktif terhadap push tanpa polling dan bebas data sensitif.

- [x] Design it (spec): [0051](../specs/0051-monitoring-status/index.md)
- [ ] Build it: /develop monitoring-status
  - [ ] MonitoringPort statusInfo ringan plus endpoint (AC-2)
  - [ ] Halaman kartu status dengan riwayat latency klien dan uji sekarang (AC-1, AC-3, AC-6)
  - [ ] E2e reaktivitas dan kebersihan network (AC-4, AC-5, AC-7)
- [ ] [Verify it](../specs/0051-monitoring-status/verify.md): /check verify monitoring-status
- [ ] [Test it](../specs/0051-monitoring-status/test.md): /test monitoring-status

### 52. Settings dan preferences `in-progress`

Registry key tertutup: preferensi per user dan pengaturan aplikasi Admin. Done when: theme mengikuti akun lintas perangkat dan perubahan settings efektif tanpa restart.

- [x] Design it (spec): [0052](../specs/0052-settings-preferences/index.md)
- [x] Build it: /develop settings-preferences
  - [x] Registry key plus SettingsService bercache (AC-1, AC-3, AC-6)
  - [x] Endpoint preferences dan settings plus audit settings (AC-1, AC-3, AC-4)
  - [x] Sambungan theme dan halaman settings dua bagian plus e2e (AC-2, AC-5, AC-7)
  - code in `packages/settings/`, `apps/server/src/app.ts`, `packages/sdk-angular/src/`, `apps/web/src/app/`, and `tests/`
- [ ] [Verify it](../specs/0052-settings-preferences/verify.md): /check verify settings-preferences
- [ ] [Test it](../specs/0052-settings-preferences/test.md): /test settings-preferences

## Fase F. Penutup

### 53. Hardening keamanan lintas fitur `in-progress`

Standar redaction, header keamanan, matriks otorisasi, gerbang security.yml. Done when: seluruh suite keamanan hijau dan menjadi prasyarat rilis.

- [x] Design it (spec): [0053](../specs/0053-security-hardening/index.md)
- [ ] Build it: /develop security-hardening
  - [ ] Sweep redaction plus test suntik per saluran plus pemindai fixture (AC-1, AC-2)
  - [ ] Header keamanan plus konsolidasi rate limiter (AC-3, AC-4)
  - [ ] Matriks otorisasi dari kontrak, test at rest, kelengkapan audit destructive, security.yml (AC-5 sampai AC-8)
- [ ] [Verify it](../specs/0053-security-hardening/verify.md): /check verify security-hardening
- [ ] [Test it](../specs/0053-security-hardening/test.md): /test security-hardening

### 54. Packaging binary dan smoke test `in-progress`

Dari kode ke lima binary terverifikasi. Done when: artefak per target lahir dari release.yml dengan checksum dan smoke test lulus di runner tersedia.

- [x] Design it (spec): [0054](../specs/0054-binary-packaging-smoke/index.md)
- [ ] Build it: /develop binary-packaging-smoke
  - [ ] Build web plus embed manifest aset plus penyajian release (AC-1)
  - [ ] Kompilasi lima target dengan injeksi versi plus checksum (AC-2, AC-3)
  - [ ] Harness smoke lengkap plus release.yml bergerbang plus README rilis (AC-4 sampai AC-7)
- [ ] [Verify it](../specs/0054-binary-packaging-smoke/verify.md): /check verify binary-packaging-smoke
- [ ] [Test it](../specs/0054-binary-packaging-smoke/test.md): /test binary-packaging-smoke

### 55. Distribusi dan release `in-progress`

Signing bergerbang sertifikat, Docker multi arch, service file, dokumentasi operator. Done when: pemasangan dari artefak nyata mengikuti dokumen sendiri berhasil di platform tersedia.

- [x] Design it (spec): [0055](../specs/0055-distribution-release/index.md)
- [ ] Build it: /develop distribution-release
  - [ ] GitHub Releases plus changelog plus langkah signing bergerbang (AC-1, AC-2, AC-3)
  - [ ] Docker multi arch plus varian tools plus service file systemd launchd (AC-4, AC-5)
  - [ ] Dokumentasi operator lengkap, SECURITY.md, README, uji penerimaan (AC-6, AC-7, AC-8)
- [ ] [Verify it](../specs/0055-distribution-release/verify.md): /check verify distribution-release
- [ ] [Test it](../specs/0055-distribution-release/test.md): /test distribution-release

## Deferred (V2 dan sesudahnya)

Dari keputusan desain dan dokumen perencanaan: SSH tunnel, monitoring sesi dan lock, EXPLAIN ANALYZE dan visual plan, materialized view, RLS, event scheduler MySQL, scheduled backup, format pg_restore custom, bulk load native (COPY, LOAD DATA), OS keychain sebagai key provider, rotasi key, force change password, connection sharing granular, SSO OIDC, custom role, installer native per platform, ERD, Schema Diff.
