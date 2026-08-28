# Myadmin — Struktur Monorepo dan Aturan Arsitektur

> Status: baseline spesifikasi V1  
> Stack: Angular 22.1+, Bun 1.4+, SQLite internal, PostgreSQL dan MySQL  
> UI foundation wajib: @ojiepermana/angular

Dokumen ini membekukan struktur kode yang disarankan untuk Myadmin sebelum implementasi dimulai. Myadmin adalah aplikasi administrasi database berbasis browser yang berjalan sebagai satu executable: binary Bun menjalankan API HTTP/WebSocket, melayani aset Angular, menyimpan data internal secara lokal, lalu terhubung ke banyak server PostgreSQL atau MySQL.

Target distribusi:

~~~text
Linux   : x64, ARM64
macOS   : x64, ARM64
Windows : x64

myadmin serve
  └── http://localhost:8080
~~~

## 1. Keputusan struktur yang sudah dikunci

- Monorepo memakai Bun workspaces dan Angular CLI; tidak menambah Nx atau Turborepo pada V1 tanpa kebutuhan yang terbukti.
- Angular hanya berada di aplikasi web. Backend Bun dan entrypoint executable dipisahkan agar packaging tidak mencemari kode server.
- OpenAPI adalah source of truth API. Angular SDK dihasilkan dari kontrak, sehingga tipe dan endpoint tidak ditulis dua kali.
- @ojiepermana/angular adalah UI foundation satu-satunya untuk theme, navigation primitive, generic components, form, dialog, table/data-grid, feedback, dan infrastructure Angular SDK yang tersedia dari package tersebut.
- Myadmin hanya membuat UI yang spesifik domain database, misalnya object explorer, query editor, result grid, table designer, connection status, dan explain plan.
- SQLite dipakai hanya untuk data internal Myadmin. Ia bukan database target/provider V1 dan tidak pernah diperlakukan seperti koneksi PostgreSQL/MySQL pengguna.
- PostgreSQL dan MySQL adalah adapter/provider terpisah. Business logic dan UI tidak boleh berisi percabangan engine seperti "if engine is postgresql".
- Binary yang dikompilasi adalah aplikasi CLI. Ia melakukan bootstrap runtime, menentukan data directory, menjalankan migrasi internal, memulai server, dan menyajikan Angular build yang sudah di-embed.

## 2. Struktur folder lengkap

~~~text
myadmin/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug-report.yml
│   │   └── feature-request.yml
│   ├── workflows/
│   │   ├── ci.yml
│   │   ├── contract.yml
│   │   ├── integration.yml
│   │   ├── release.yml
│   │   └── security.yml
│   └── dependabot.yml
│
├── .husky/
│   ├── pre-commit
│   └── commit-msg
│
├── .vscode/
│   ├── extensions.json
│   ├── settings.json
│   └── tasks.json
│
├── apps/
│   ├── web/                                      # Angular 22.1+ SPA
│   │   ├── public/
│   │   │   ├── icons/
│   │   │   ├── images/
│   │   │   ├── locales/
│   │   │   ├── manifest.webmanifest
│   │   │   └── robots.txt
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── app.component.ts
│   │   │   │   ├── app.config.ts
│   │   │   │   ├── app.routes.ts
│   │   │   │   ├── app.bootstrap.ts
│   │   │   │   │
│   │   │   │   ├── core/                        # singleton dan cross-cutting UI
│   │   │   │   │   ├── auth/
│   │   │   │   │   │   ├── auth.facade.ts
│   │   │   │   │   │   ├── auth.guard.ts
│   │   │   │   │   │   ├── session.interceptor.ts
│   │   │   │   │   │   └── current-user.store.ts
│   │   │   │   │   ├── config/
│   │   │   │   │   │   ├── runtime-config.ts
│   │   │   │   │   │   └── runtime-config.loader.ts
│   │   │   │   │   ├── navigation/
│   │   │   │   │   │   ├── navigation.models.ts
│   │   │   │   │   │   ├── navigation.adapter.ts
│   │   │   │   │   │   └── navigation.state.ts
│   │   │   │   │   ├── realtime/
│   │   │   │   │   │   ├── realtime.client.ts
│   │   │   │   │   │   ├── realtime-events.ts
│   │   │   │   │   │   └── realtime.store.ts
│   │   │   │   │   ├── sdk/
│   │   │   │   │   │   ├── sdk.config.ts
│   │   │   │   │   │   ├── sdk.provider.ts
│   │   │   │   │   │   └── sdk-error.mapper.ts
│   │   │   │   │   ├── state/
│   │   │   │   │   │   ├── app.store.ts
│   │   │   │   │   │   ├── active-connection.store.ts
│   │   │   │   │   │   └── workspace.store.ts
│   │   │   │   │   ├── theme/
│   │   │   │   │   │   ├── myadmin-theme.ts
│   │   │   │   │   │   ├── theme.config.ts
│   │   │   │   │   │   └── theme-preference.store.ts
│   │   │   │   │   └── errors/
│   │   │   │   │       ├── error-boundary.component.ts
│   │   │   │   │       └── error-presenter.service.ts
│   │   │   │   │
│   │   │   │   ├── layout/                      # shell aplikasi, bukan fitur database
│   │   │   │   │   ├── app-shell/
│   │   │   │   │   ├── top-bar/
│   │   │   │   │   ├── sidebar/
│   │   │   │   │   ├── workspace-host/
│   │   │   │   │   ├── tab-host/
│   │   │   │   │   ├── panel-layout/
│   │   │   │   │   └── status-bar/
│   │   │   │   │
│   │   │   │   ├── features/                    # lazy-loaded feature/domain UI
│   │   │   │   │   ├── initial-setup/
│   │   │   │   │   │   ├── pages/
│   │   │   │   │   │   ├── components/
│   │   │   │   │   │   ├── setup.store.ts
│   │   │   │   │   │   └── initial-setup.routes.ts
│   │   │   │   │   ├── auth/
│   │   │   │   │   │   ├── pages/
│   │   │   │   │   │   ├── components/
│   │   │   │   │   │   ├── auth.feature.store.ts
│   │   │   │   │   │   └── auth.routes.ts
│   │   │   │   │   ├── connections/
│   │   │   │   │   │   ├── pages/
│   │   │   │   │   │   ├── components/
│   │   │   │   │   │   ├── forms/
│   │   │   │   │   │   ├── connection.facade.ts
│   │   │   │   │   │   ├── connection.store.ts
│   │   │   │   │   │   └── connections.routes.ts
│   │   │   │   │   ├── workspace/
│   │   │   │   │   │   ├── components/
│   │   │   │   │   │   ├── workspace.facade.ts
│   │   │   │   │   │   └── workspace.routes.ts
│   │   │   │   │   ├── explorer/
│   │   │   │   │   │   ├── components/
│   │   │   │   │   │   ├── tree/
│   │   │   │   │   │   ├── explorer.facade.ts
│   │   │   │   │   │   ├── explorer.store.ts
│   │   │   │   │   │   └── explorer.routes.ts
│   │   │   │   │   ├── database/
│   │   │   │   │   │   ├── pages/
│   │   │   │   │   │   ├── components/
│   │   │   │   │   │   ├── database.facade.ts
│   │   │   │   │   │   └── database.routes.ts
│   │   │   │   │   ├── schema/
│   │   │   │   │   │   ├── pages/
│   │   │   │   │   │   ├── components/
│   │   │   │   │   │   ├── schema.facade.ts
│   │   │   │   │   │   └── schema.routes.ts
│   │   │   │   │   ├── table-designer/
│   │   │   │   │   │   ├── pages/
│   │   │   │   │   │   ├── components/
│   │   │   │   │   │   ├── forms/
│   │   │   │   │   │   ├── table-designer.facade.ts
│   │   │   │   │   │   └── table-designer.routes.ts
│   │   │   │   │   ├── data-browser/
│   │   │   │   │   │   ├── pages/
│   │   │   │   │   │   ├── components/
│   │   │   │   │   │   ├── data-browser.facade.ts
│   │   │   │   │   │   ├── data-browser.store.ts
│   │   │   │   │   │   └── data-browser.routes.ts
│   │   │   │   │   ├── query-editor/
│   │   │   │   │   │   ├── pages/
│   │   │   │   │   │   ├── components/
│   │   │   │   │   │   ├── editor/
│   │   │   │   │   │   ├── result/
│   │   │   │   │   │   ├── explain/
│   │   │   │   │   │   ├── query-editor.facade.ts
│   │   │   │   │   │   ├── query-editor.store.ts
│   │   │   │   │   │   └── query-editor.routes.ts
│   │   │   │   │   ├── query-history/
│   │   │   │   │   │   ├── pages/
│   │   │   │   │   │   ├── components/
│   │   │   │   │   │   └── query-history.routes.ts
│   │   │   │   │   ├── security/
│   │   │   │   │   │   ├── pages/
│   │   │   │   │   │   ├── components/
│   │   │   │   │   │   ├── security.facade.ts
│   │   │   │   │   │   └── security.routes.ts
│   │   │   │   │   ├── import-export/
│   │   │   │   │   │   ├── pages/
│   │   │   │   │   │   ├── components/
│   │   │   │   │   │   ├── jobs/
│   │   │   │   │   │   └── import-export.routes.ts
│   │   │   │   │   ├── backup-restore/
│   │   │   │   │   │   ├── pages/
│   │   │   │   │   │   ├── components/
│   │   │   │   │   │   ├── jobs/
│   │   │   │   │   │   └── backup-restore.routes.ts
│   │   │   │   │   ├── monitoring/
│   │   │   │   │   │   ├── pages/
│   │   │   │   │   │   ├── components/
│   │   │   │   │   │   └── monitoring.routes.ts
│   │   │   │   │   ├── audit/
│   │   │   │   │   │   ├── pages/
│   │   │   │   │   │   ├── components/
│   │   │   │   │   │   └── audit.routes.ts
│   │   │   │   │   └── settings/
│   │   │   │   │       ├── pages/
│   │   │   │   │       ├── components/
│   │   │   │   │       ├── settings.facade.ts
│   │   │   │   │       └── settings.routes.ts
│   │   │   │   │
│   │   │   │   └── shared/                    # bukan generic design system
│   │   │   │       ├── database-components/
│   │   │   │       │   ├── object-explorer/
│   │   │   │       │   ├── result-grid/
│   │   │   │       │   ├── connection-status/
│   │   │   │       │   ├── capability-badge/
│   │   │   │       │   └── destructive-action-confirmation/
│   │   │   │       ├── directives/
│   │   │   │       ├── pipes/
│   │   │   │       ├── types/
│   │   │   │       └── utils/
│   │   │   ├── assets/
│   │   │   │   ├── i18n/
│   │   │   │   └── illustrations/
│   │   │   ├── environments/
│   │   │   │   ├── environment.ts
│   │   │   │   └── environment.production.ts
│   │   │   ├── styles/
│   │   │   │   ├── styles.scss
│   │   │   │   └── myadmin-overrides.scss
│   │   │   └── main.ts
│   │   ├── project.json
│   │   ├── tsconfig.app.json
│   │   └── tsconfig.spec.json
│   │
│   ├── server/                                # Bun API, HTTP/WS delivery, composition root
│   │   ├── src/
│   │   │   ├── server.ts
│   │   │   ├── bootstrap/
│   │   │   │   ├── composition-root.ts
│   │   │   │   ├── database-providers.ts
│   │   │   │   ├── internal-platform.ts
│   │   │   │   ├── runtime-lifecycle.ts
│   │   │   │   └── static-web.ts
│   │   │   ├── config/
│   │   │   │   ├── server-config.ts
│   │   │   │   └── security-config.ts
│   │   │   ├── transport/
│   │   │   │   ├── http/
│   │   │   │   │   ├── routes/
│   │   │   │   │   │   └── v1/
│   │   │   │   │   ├── controllers/
│   │   │   │   │   ├── middleware/
│   │   │   │   │   ├── presenters/
│   │   │   │   │   ├── validators/
│   │   │   │   │   ├── openapi.ts
│   │   │   │   │   └── error-handler.ts
│   │   │   │   └── websocket/
│   │   │   │       ├── channels/
│   │   │   │       ├── handlers/
│   │   │   │       ├── protocol/
│   │   │   │       └── connection-registry.ts
│   │   │   ├── modules/                       # use case per domain, bukan CRUD global
│   │   │   │   ├── initial-setup/
│   │   │   │   │   ├── application/
│   │   │   │   │   └── policies/
│   │   │   │   ├── auth/
│   │   │   │   │   ├── application/
│   │   │   │   │   └── policies/
│   │   │   │   ├── connections/
│   │   │   │   │   ├── application/
│   │   │   │   │   ├── policies/
│   │   │   │   │   └── mappers/
│   │   │   │   ├── workspace/
│   │   │   │   │   └── application/
│   │   │   │   ├── explorer/
│   │   │   │   │   └── application/
│   │   │   │   ├── database/
│   │   │   │   │   └── application/
│   │   │   │   ├── schema/
│   │   │   │   │   └── application/
│   │   │   │   ├── table/
│   │   │   │   │   └── application/
│   │   │   │   ├── data/
│   │   │   │   │   └── application/
│   │   │   │   ├── query/
│   │   │   │   │   ├── application/
│   │   │   │   │   └── policies/
│   │   │   │   ├── security/
│   │   │   │   │   └── application/
│   │   │   │   ├── import-export/
│   │   │   │   │   └── application/
│   │   │   │   ├── backup-restore/
│   │   │   │   │   └── application/
│   │   │   │   ├── monitoring/
│   │   │   │   │   └── application/
│   │   │   │   ├── audit/
│   │   │   │   │   └── application/
│   │   │   │   └── settings/
│   │   │   │       └── application/
│   │   │   ├── infrastructure/
│   │   │   │   ├── filesystem/
│   │   │   │   ├── native-tools/
│   │   │   │   ├── jobs/
│   │   │   │   └── observability/
│   │   │   ├── static-web/
│   │   │   │   ├── serve-assets.ts
│   │   │   │   └── spa-fallback.ts
│   │   │   ├── health/
│   │   │   │   ├── health.controller.ts
│   │   │   │   └── readiness.service.ts
│   │   │   └── errors/
│   │   │       ├── application-error.ts
│   │   │       └── error-codes.ts
│   │   ├── test/
│   │   │   ├── transport/
│   │   │   ├── modules/
│   │   │   └── fixtures/
│   │   └── tsconfig.json
│   │
│   └── cli/                                   # satu-satunya Bun Compile entrypoint
│       ├── src/
│       │   ├── main.ts
│       │   ├── commands/
│       │   │   ├── serve.ts
│       │   │   ├── doctor.ts
│       │   │   ├── migrate.ts
│       │   │   └── version.ts
│       │   ├── runtime/
│       │   │   ├── data-directory.ts
│       │   │   ├── embedded-assets.ts
│       │   │   ├── signal-handling.ts
│       │   │   └── platform.ts
│       │   └── output/
│       │       ├── terminal-presenter.ts
│       │       └── diagnostics.ts
│       ├── test/
│       └── tsconfig.json
│
├── packages/
│   ├── kernel/                                 # pure primitives lintas package
│   │   ├── src/
│   │   │   ├── errors/
│   │   │   ├── ids/
│   │   │   ├── pagination/
│   │   │   ├── result/
│   │   │   ├── time/
│   │   │   └── validation/
│   │   └── test/
│   │
│   ├── api-contract/                           # source of truth API dan WS
│   │   ├── openapi/
│   │   │   └── v1/
│   │   │       ├── openapi.yaml
│   │   │       ├── paths/
│   │   │       │   ├── auth.yaml
│   │   │       │   ├── connections.yaml
│   │   │       │   ├── explorer.yaml
│   │   │       │   ├── query.yaml
│   │   │       │   └── operations.yaml
│   │   │       └── components/
│   │   │           ├── schemas/
│   │   │           ├── parameters/
│   │   │           ├── responses/
│   │   │           └── security-schemes.yaml
│   │   ├── events/
│   │   │   ├── websocket-events.yaml
│   │   │   └── websocket-protocol.yaml
│   │   ├── src/
│   │   │   └── generated/                      # hanya output code generation
│   │   ├── scripts/
│   │   │   ├── generate-types.ts
│   │   │   └── validate-contract.ts
│   │   └── test/
│   │
│   ├── sdk-angular/                            # @myadmin/sdk-angular
│   │   ├── src/
│   │   │   ├── generated/                      # dari api-contract; jangan edit manual
│   │   │   ├── transport/                      # adapter tipis ke SDK infra @ojiepermana/angular
│   │   │   ├── providers/
│   │   │   ├── realtime/
│   │   │   ├── facades/
│   │   │   └── public-api.ts
│   │   ├── scripts/
│   │   │   └── generate-sdk.ts
│   │   └── test/
│   │
│   ├── internal-domain/                        # model dan port internal Myadmin
│   │   ├── src/
│   │   │   ├── entities/
│   │   │   │   ├── audit-event/
│   │   │   │   ├── connection/
│   │   │   │   ├── preference/
│   │   │   │   ├── query-history/
│   │   │   │   ├── saved-query/
│   │   │   │   ├── server-group/
│   │   │   │   ├── session/
│   │   │   │   ├── setting/
│   │   │   │   ├── user/
│   │   │   │   └── workspace/
│   │   │   ├── ports/
│   │   │   │   ├── audit-writer.ts
│   │   │   │   ├── credential-vault.ts
│   │   │   │   ├── repositories/
│   │   │   │   └── unit-of-work.ts
│   │   │   ├── policies/
│   │   │   └── value-objects/
│   │   └── test/
│   │
│   ├── internal-sqlite/                        # adapter persistence SQLite
│   │   ├── src/
│   │   │   ├── database/
│   │   │   │   ├── connection.ts
│   │   │   │   ├── pragmas.ts
│   │   │   │   ├── transaction.ts
│   │   │   │   └── health.ts
│   │   │   ├── schema/
│   │   │   ├── migrations/
│   │   │   │   ├── 0001-initial.ts
│   │   │   │   └── migration-runner.ts
│   │   │   ├── repositories/
│   │   │   │   ├── audit/
│   │   │   │   ├── connections/
│   │   │   │   ├── preferences/
│   │   │   │   ├── queries/
│   │   │   │   ├── server-groups/
│   │   │   │   ├── sessions/
│   │   │   │   ├── settings/
│   │   │   │   ├── users/
│   │   │   │   └── workspaces/
│   │   │   └── mappers/
│   │   └── test/
│   │
│   ├── crypto/                                 # pemilik security primitive
│   │   ├── src/
│   │   │   ├── key-management/
│   │   │   │   ├── key-provider.ts
│   │   │   │   ├── os-keychain.ts
│   │   │   │   └── passphrase.ts
│   │   │   ├── password/
│   │   │   │   ├── password-hasher.ts
│   │   │   │   └── password-policy.ts
│   │   │   ├── tokens/
│   │   │   ├── vault/
│   │   │   │   ├── encrypt-credential.ts
│   │   │   │   └── decrypt-credential.ts
│   │   │   └── redaction/
│   │   └── test/
│   │
│   ├── auth/                                   # user Myadmin, bukan user database target
│   │   ├── src/
│   │   │   ├── authorization/
│   │   │   ├── initial-admin/
│   │   │   ├── sessions/
│   │   │   ├── use-cases/
│   │   │   └── ports/
│   │   └── test/
│   │
│   ├── audit/                                  # event/policy audit append-only
│   │   ├── src/
│   │   │   ├── events/
│   │   │   ├── policies/
│   │   │   ├── redaction/
│   │   │   └── writers/
│   │   └── test/
│   │
│   ├── database-core/                          # kontrak agnostik engine
│   │   ├── src/
│   │   │   ├── capabilities/
│   │   │   ├── connection-context/
│   │   │   ├── contracts/
│   │   │   │   ├── backup-restore.ts
│   │   │   │   ├── connection.ts
│   │   │   │   ├── data.ts
│   │   │   │   ├── database.ts
│   │   │   │   ├── import-export.ts
│   │   │   │   ├── metadata.ts
│   │   │   │   ├── monitoring.ts
│   │   │   │   ├── provider.ts
│   │   │   │   ├── query.ts
│   │   │   │   ├── schema.ts
│   │   │   │   ├── security.ts
│   │   │   │   └── table.ts
│   │   │   ├── errors/
│   │   │   ├── models/
│   │   │   └── registry/
│   │   └── test/
│   │
│   ├── database-postgresql/                    # seluruh SQL/semantik PostgreSQL
│   │   ├── src/
│   │   │   ├── provider.ts
│   │   │   ├── capabilities/
│   │   │   ├── connection/
│   │   │   ├── data/
│   │   │   ├── database/
│   │   │   ├── driver/
│   │   │   ├── import-export/
│   │   │   ├── mappers/
│   │   │   ├── metadata/
│   │   │   ├── monitoring/
│   │   │   ├── query/
│   │   │   ├── schema/
│   │   │   ├── security/
│   │   │   ├── table/
│   │   │   └── features/                       # capability-gated; banyaknya V2
│   │   │       ├── materialized-views/
│   │   │       ├── publications/
│   │   │       ├── replication-slots/
│   │   │       ├── row-level-security/
│   │   │       ├── subscriptions/
│   │   │       ├── vacuum/
│   │   │       └── wal/
│   │   └── test/
│   │
│   ├── database-mysql/                         # seluruh SQL/semantik MySQL
│   │   ├── src/
│   │   │   ├── provider.ts
│   │   │   ├── capabilities/
│   │   │   ├── connection/
│   │   │   ├── data/
│   │   │   ├── database/
│   │   │   ├── driver/
│   │   │   ├── import-export/
│   │   │   ├── mappers/
│   │   │   ├── metadata/
│   │   │   ├── monitoring/
│   │   │   ├── query/
│   │   │   ├── security/
│   │   │   ├── table/
│   │   │   └── features/                       # capability-gated; banyaknya V2
│   │   │       ├── binlog/
│   │   │       ├── events/
│   │   │       ├── optimize/
│   │   │       ├── repair/
│   │   │       ├── replication/
│   │   │       └── storage-engines/
│   │   └── test/
│   │
│   ├── jobs/                                   # pekerjaan panjang/cancellable
│   │   ├── src/
│   │   │   ├── cancellation/
│   │   │   ├── contracts/
│   │   │   ├── execution/
│   │   │   ├── progress/
│   │   │   └── queue/
│   │   └── test/
│   │
│   ├── config/                                 # schema dan loader konfigurasi tervalidasi
│   │   ├── src/
│   │   │   ├── defaults/
│   │   │   ├── loaders/
│   │   │   ├── redaction/
│   │   │   └── schema/
│   │   └── test/
│   │
│   ├── observability/                          # log/metric/tracing terstruktur
│   │   ├── src/
│   │   │   ├── correlation/
│   │   │   ├── logging/
│   │   │   ├── metrics/
│   │   │   └── tracing/
│   │   └── test/
│   │
│   └── testkit/                                # hanya boleh dipakai test
│       ├── src/
│       │   ├── containers/
│       │   ├── factories/
│       │   ├── fakes/
│       │   └── fixtures/
│       └── package.json
│
├── tests/
│   ├── contract/                               # contract ↔ server ↔ SDK
│   ├── e2e/
│   │   ├── api/
│   │   ├── binary/
│   │   └── web/
│   ├── fixtures/                               # sanitized; tanpa kredensial/data nyata
│   ├── integration/
│   │   ├── internal-sqlite/
│   │   ├── mysql/
│   │   └── postgresql/
│   ├── performance/
│   ├── security/
│   │   ├── auth/
│   │   ├── authorization/
│   │   ├── crypto/
│   │   └── redaction/
│   └── environments/
│       ├── docker-compose.test.yml
│       ├── mysql/
│       └── postgresql/
│
├── tooling/
│   ├── angular/
│   ├── eslint/
│   ├── generators/
│   │   ├── module/
│   │   └── openapi/
│   ├── testing/
│   └── typescript/
│
├── scripts/
│   ├── build/
│   │   ├── build-server.ts
│   │   ├── build-web.ts
│   │   ├── compile-binary.ts
│   │   └── embed-web-assets.ts
│   ├── codegen/
│   │   ├── generate-angular-sdk.ts
│   │   └── generate-contract-types.ts
│   ├── dev/
│   │   ├── start-server.ts
│   │   ├── start-web.ts
│   │   └── stop-ports.ts
│   ├── quality/
│   │   ├── format.ts
│   │   ├── lint.ts
│   │   └── typecheck.ts
│   ├── release/
│   │   ├── changelog.ts
│   │   ├── checksums.ts
│   │   ├── package-installers.ts
│   │   └── publish.ts
│   └── verify/
│       ├── check-boundaries.ts
│       ├── smoke-binary.ts
│       └── verify-openapi.ts
│
├── distribution/
│   ├── docker/
│   ├── installers/
│   ├── manifests/
│   ├── service/
│   │   ├── launchd/
│   │   └── systemd/
│   ├── signing/
│   └── targets/
│       ├── linux-arm64/
│       ├── linux-x64/
│       ├── macos-arm64/
│       ├── macos-x64/
│       └── windows-x64/
│
├── docs/
│   ├── api/
│   ├── architecture/
│   │   ├── adr/
│   │   │   ├── 0001-bun-monorepo.md
│   │   │   ├── 0002-ui-foundation.md
│   │   │   ├── 0003-api-first.md
│   │   │   ├── 0004-provider-abstraction.md
│   │   │   └── 0005-internal-sqlite.md
│   │   ├── capability-model.md
│   │   ├── dependency-direction.md
│   │   ├── internal-storage.md
│   │   ├── overview.md
│   │   ├── provider-contract.md
│   │   └── security-model.md
│   ├── development/
│   ├── operations/
│   ├── product/
│   │   ├── feature-inventory.md
│   │   ├── implementation-order.md
│   │   └── v1-scope.md
│   └── release/
│
├── dist/                                      # output build, selalu di-ignore Git
│   ├── binaries/
│   ├── server/
│   └── web/
│
├── .editorconfig
├── .env.example
├── .gitignore
├── .npmrc
├── angular.json
├── bun.lock
├── bunfig.toml
├── CONTRIBUTING.md
├── LICENSE
├── package.json
├── playwright.config.ts
├── README.md
├── SECURITY.md
├── tsconfig.base.json
└── vitest.workspace.ts
~~~

## 3. Fungsi folder utama

### apps/

Folder ini berisi executable application, bukan library lintas aplikasi.

| Folder | Tanggung jawab |
|---|---|
| apps/web | Angular SPA yang dipakai di browser. Tidak memuat driver database, akses SQLite, atau raw endpoint. |
| apps/server | Server Bun yang menyediakan HTTP, WebSocket, static web, delivery adapter, dan composition root. |
| apps/cli | Entry point perintah "myadmin". Ini satu-satunya aplikasi yang dikompilasi dengan Bun menjadi binary lintas platform. |

Pemisahan server dan CLI disengaja: server dapat diuji sebagai aplikasi HTTP tanpa packaging, sementara CLI mengurus concern runtime native seperti lokasi data, signal process, migration saat startup, diagnostic command, dan embedding aset web.

### apps/web/src/app/core/

Core hanya berisi singleton atau concern yang melintasi feature. Ia tidak menjadi tempat menaruh domain screen secara sembarang.

| Subfolder | Fungsi |
|---|---|
| auth | Session facade, route guard, interceptor session, dan state pengguna Myadmin. Ini tidak mengelola user/role pada database target. |
| config | Mengambil konfigurasi runtime yang aman untuk browser, misalnya base URL dan feature flags yang tidak rahasia. |
| navigation | Model menu, breadcrumb, dan adapter Myadmin ke navigation primitives dari @ojiepermana/angular. Struktur/object tree Myadmin tetap milik feature explorer. |
| realtime | Client WebSocket, event bridge, dan state event seperti progress import, hasil query, atau perubahan connection status. |
| sdk | Provider/config untuk @myadmin/sdk-angular. Folder ini tidak boleh berisi string endpoint atau raw HttpClient call. |
| state | State aplikasi global: session, koneksi aktif, dan workspace aktif. |
| theme | Konfigurasi dan extension theme @ojiepermana/angular: light, dark, system, persistence, semantic token, dan identitas Myadmin. Ini bukan theme engine baru. |
| errors | Boundary/presenter untuk error yang aman dan konsisten. Pesan provider tidak boleh mengekspos secret. |

### apps/web/src/app/layout/

Layout menyusun shell aplikasi: top bar, sidebar, resizable panel, tab host, workspace host, dan status bar. Ia memakai primitive navigation/layout dari @ojiepermana/angular. Layout hanya memahami state UI yang dibutuhkan, bukan SQL PostgreSQL atau MySQL.

### apps/web/src/app/features/

Setiap feature adalah batas UI yang dapat lazy-loaded. Satu feature biasanya memiliki:

~~~text
<feature>/
├── pages/           # route-level UI
├── components/      # component internal feature
├── forms/            # bila feature memiliki formulir kompleks
├── <feature>.facade.ts
├── <feature>.store.ts
└── <feature>.routes.ts
~~~

Feature V1 dan fungsi pentingnya:

| Feature | Fungsi V1 |
|---|---|
| initial-setup | Membuat admin pertama dan bootstrap aplikasi secara aman. |
| auth | Login, logout, perubahan password, dan penanganan sesi. |
| connections | Tambah, edit, duplikasi, uji, hubungkan, putuskan, kelompokkan, dan simpan koneksi terenkripsi. |
| workspace | Persistensi workspace/tab/panel pengguna. |
| explorer | Object explorer lazy-loading berdasarkan metadata dan capability dari provider. |
| database | Browse, create, drop, property, ukuran, encoding, charset, dan collation database. |
| schema | Manajemen schema jika provider menyatakannya didukung. |
| table-designer | Columns, index, constraints, foreign key, property, dan operasi table yang memerlukan konfirmasi eksplisit. |
| data-browser | Browse server-side paginated, sort, filter, search, insert, update, dan delete data. |
| query-editor | Multi-tab SQL editor, execute, cancel, result, error, execution time, explain, dan context connection/database/schema. |
| query-history | Riwayat query dan saved query. |
| security | User/role/privilege pada database target melalui provider capability. Ini berbeda dari auth Myadmin. |
| import-export | Import SQL/CSV dan export SQL/CSV/JSON dengan job progress serta streaming untuk data besar. |
| backup-restore | Backup/restore dan progress/cancellation. Provider dapat memakai native tool yang tersedia, contohnya pg_dump/pg_restore. |
| monitoring | Status server, active sessions, running query, lock, dan statistics yang didukung provider. |
| audit | Pencarian dan penyajian audit Myadmin tanpa secret. |
| settings | Preferensi pengguna dan pengaturan aplikasi. |

### apps/web/src/app/shared/

Folder ini sengaja tidak memiliki "components/" generik. Semua generic Button, Input, Select, Dialog, Drawer, Popover, Tooltip, Tabs, Menu, Breadcrumb, Table/Data Grid, Tree, Form, Toast, Loading, dan sebagainya berasal dari @ojiepermana/angular.

Isi yang dibolehkan:

- database-components: component khusus domain Myadmin/database.
- directives, pipes, types, utils: utilitas UI yang kecil dan tidak memiliki lifecycle/service/provider database.

Contoh component yang tepat untuk database-components adalah ObjectExplorer, ResultGrid, ConnectionStatus, CapabilityBadge, ExplainPlan, DataEditor, dan DestructiveActionConfirmation. Membuat MyadminButton, MyadminDialog, atau MyadminTabs tidak diperbolehkan ketika capability setara telah disediakan package foundation.

### apps/server/

Server adalah adapter luar dan runtime composition. Ia memegang concrete dependency, tetapi tidak menjadi tempat menaruh SQL provider.

| Subfolder | Fungsi |
|---|---|
| bootstrap | Satu-satunya lokasi yang merangkai implementasi konkret: SQLite repository, credential vault, PostgreSQL provider, MySQL provider, jobs, logger, server, dan static assets. |
| config | Membaca config tervalidasi untuk host, port, data directory, security, dan runtime. |
| transport/http | Route, controller, validation, presenter, middleware, OpenAPI serving, dan normalisasi error. Controller tidak memuat business logic. |
| transport/websocket | Channel/protokol/event untuk progress, cancellation, query state, dan perubahan connection state. |
| modules | Application use case per domain. Ia hanya mengonsumsi port/contract; tidak membuka SQLite atau menjalankan SQL engine secara langsung. |
| infrastructure | Integrasi filesystem, native tools, job runner, dan observability yang tidak layak masuk domain. |
| static-web | Menyajikan Angular dist dan fallback SPA. |
| health | Liveness/readiness endpoint dan self-check yang aman. |
| errors | Kode error dan error application yang bisa dipresentasikan konsisten. |

### apps/cli/

CLI memiliki perintah "serve", "doctor", "migrate", dan "version". Pada build release, "main.ts" dari folder ini dipakai sebagai Bun Compile entrypoint.

Kewajibannya:

- menentukan data directory platform dengan aman;
- membuka atau memigrasikan SQLite internal sebelum server siap;
- menemukan aset Angular yang di-embed;
- memulai atau menghentikan server dengan graceful;
- tidak menyimpan business use case atau SQL provider.

### packages/api-contract/

Ini adalah kontrak API-first. "openapi/v1/openapi.yaml" dan file paths/components menjadi sumber resmi endpoint, request, response, error, security scheme, dan capability response. Folder "events/" mendefinisikan schema event WebSocket.

Flow perubahan API:

~~~text
Ubah OpenAPI/event schema
        ↓
Validasi contract
        ↓
Generate tipe contract
        ↓
Generate SDK Angular
        ↓
Implementasi/validasi server route
        ↓
Contract test
~~~

Tidak ada endpoint yang dibuat hanya pada controller atau hanya pada frontend.

### packages/sdk-angular/

Package ini adalah satu-satunya jalur Angular menuju API Myadmin. Kode "generated/" tidak diedit manual. "transport/" mengadaptasi infrastructure yang tersedia dari @ojiepermana/angular untuk authentication, request lifecycle, retry/error convention, dan WebSocket bila disediakan.

Jalur yang wajib dipakai:

~~~text
Angular component
      ↓
feature facade/store
      ↓
@myadmin/sdk-angular
      ↓
HTTP / WebSocket
      ↓
Bun API
~~~

Tidak boleh ada raw "fetch()", "HttpClient", atau string "/api/..." di component/facade feature.

### packages/internal-domain/, internal-sqlite/, crypto/, auth/, dan audit/

Kelima package ini membentuk platform internal Myadmin:

| Package | Fungsi |
|---|---|
| internal-domain | Entity/value object dan port untuk user, session, koneksi tersimpan, server group, workspace, preference, saved query, history, serta audit event. Tidak mengetahui SQLite. |
| internal-sqlite | Adapter SQLite, schema, migration, transaction, mapper, dan repository. Tidak berisi aturan authorization/encryption/provider. |
| crypto | Satu-satunya pemilik password hashing, token, key provider, encrypted credential vault, serta secret redaction. |
| auth | Use case local-user Myadmin: initial admin, login/logout, session expiry, change password, authorization Admin/User. |
| audit | Model event dan kebijakan audit append-only; payload disensor sebelum disimpan. |

Data SQLite internal minimal mencakup:

~~~text
users
sessions
connections
connection_credentials (ciphertext dan metadata enkripsi saja)
server_groups
workspaces
query_history
saved_queries
preferences
settings
audit_logs
~~~

Pemisahan penting: descriptor koneksi yang aman untuk ditampilkan (host, port, driver, label, SSL mode) berbeda dari credential payload terenkripsi. Key material tidak boleh disimpan dalam SQLite di samping ciphertext. KeyProvider menentukan sumber key yang aman, misalnya OS keychain atau passphrase bootstrap sesuai ADR security.

### packages/database-core/

Database core berisi interface kecil dan model umum yang tidak bergantung pada PostgreSQL, MySQL, driver, HTTP, SQLite, atau Angular. Jangan membuat satu "DatabaseProvider" raksasa; provider terdiri dari port kecil seperti connection, metadata, database, schema, table, data, query, security, import-export, backup/restore, dan monitoring.

"capabilities/" mendefinisikan feature yang dapat ditanyakan UI/server, contohnya:

~~~json
{
  "engine": "postgresql",
  "version": "18.1",
  "capabilities": {
    "schemas": true,
    "materializedViews": true,
    "vacuum": true,
    "rowLevelSecurity": true,
    "events": false,
    "binlog": false
  }
}
~~~

UI merender berdasarkan capability, bukan berdasarkan nama engine. Dengan demikian fitur seperti Schema, VACUUM, Event, atau Binlog dapat muncul hanya ketika provider menyatakannya didukung.

### packages/database-postgresql/ dan database-mysql/

Kedua package adalah implementation adapter database-core. Semua SQL dialect, metadata mapping, error mapping, serta perbedaan perilaku database harus tinggal di sini.

| Package | Contoh concern spesifik |
|---|---|
| database-postgresql | Schema, materialized view, VACUUM, RLS, replication slot, publication, subscription, WAL. |
| database-mysql | Database-as-schema behavior, events, OPTIMIZE, REPAIR, replication, binlog, storage engine. |

Folder "features/" mengizinkan ekspansi provider tanpa memaksa struktur PostgreSQL dan MySQL menjadi identik. Sebagian besar feature tersebut adalah V2; V1 cukup mengembalikan capability dengan benar dan tidak membuat UI hard-coded.

### packages/jobs/

Import, export, backup, restore, dan operasi besar tidak boleh memblokir request HTTP. Package ini menyediakan contract queue/execution, progress, cancellation, dan event. Transport WebSocket menyampaikan progress ke aplikasi web.

### packages/config/ dan observability/

- config: loader, default, schema, dan redaction konfigurasi. Validasi terjadi ketika startup, bukan tersebar pada feature.
- observability: structured logging, correlation ID, metric, dan tracing. Semua log harus melalui redaction supaya host credential, token, connection string, dan query sensitif tidak tersebar.

### tests/

| Folder | Fokus |
|---|---|
| contract | Konsistensi antara OpenAPI, implementation server, dan SDK Angular. |
| integration/postgresql dan integration/mysql | Contract nyata provider terhadap server database disposable/isolated. |
| integration/internal-sqlite | Migration, repository, transaction, credential ciphertext, dan recovery storage internal. |
| e2e/web | Browser flow penting: setup awal, login, connections, explorer, query, destructive confirmation. |
| e2e/api | Boundary auth, validasi, authorization, errors, capabilities, pagination, dan streaming behavior. |
| e2e/binary | Binary membuka data directory, migrasi, serve UI/API, dan shutdown dengan benar. |
| security | Password, session, authorization, encrypted secret, audit redaction, dan tidak bocornya credential. |
| performance | Dataset besar, pagination, cancellation, streaming export/import, dan query timeout. |

Package production boleh memiliki unit test di folder "test/" masing-masing. Folder "tests/" dipakai untuk test lintas package, real engine, binary, dan boundary sistem.

### scripts/, tooling/, distribution/, dan docs/

| Folder | Fungsi |
|---|---|
| tooling | Konfigurasi shared Angular, TypeScript, ESLint, testing, dan generator; bukan business code. |
| scripts | Command yang dapat dipanggil package.json untuk dev, lint, typecheck, code generation, build, verification, dan release. |
| distribution | Manifest target platform, installer, service file, signing input, dan packaging asset. Private signing secret tidak disimpan di repository. |
| docs | Dokumentasi produk, arsitektur, API, development, operasi, rilis, dan ADR. |
| dist | Hasil generated Angular/server/binary. Tidak di-commit dan tidak boleh diimpor source code. |

## 4. Aturan arsitektur wajib

### 4.1 UI foundation dan navigation

1. @ojiepermana/angular wajib menjadi foundation theme, navigation, generic UI component, form/control, overlay/dialog, feedback, table/data-grid, dan infrastructure SDK Angular sepanjang capability yang diperlukan tersedia.
2. Myadmin tidak menambah Angular Material, PrimeNG, Bootstrap, atau design system generik kedua.
3. Tidak boleh membuat ulang generic component seperti MyadminButton, MyadminDialog, MyadminDropdown, atau MyadminTabs apabila package foundation telah menyediakannya.
4. "myadmin-theme.ts" dan "theme.config.ts" hanya mengonfigurasi/extend theme foundation: identitas produk, semantic token, light/dark/system, persistence, typography, spacing, radius, dan responsive behavior.
5. Sidebar, breadcrumb, context menu, user menu, tabs, collapsible navigation, dan status bar memakai primitive navigation/layout foundation. Object Explorer tetap adalah domain component Myadmin.

### 4.2 API-first dan Angular SDK

1. Setiap endpoint REST dan event WebSocket dimulai dari packages/api-contract.
2. SDK Angular dibuat dari contract dan diekspos melalui public API package.
3. Component → facade/store → SDK adalah satu-satunya jalur akses network dari feature UI.
4. Server transport mengubah request/response transport menjadi application input/output; ia tidak menaruh policy atau SQL.
5. Kode generated tidak diedit manual. Perubahan dimulai dari source contract dan generator.

### 4.3 Provider abstraction dan capability

1. database-core tidak boleh mengimpor database-postgresql, database-mysql, driver, HTTP, SQLite, atau Angular.
2. Provider PostgreSQL dan MySQL boleh mengimpor database-core dan kernel, tetapi tidak boleh saling mengimpor.
3. Application module/server tidak berisi "if engine == postgresql/mysql" untuk behavior business. Provider registry memilih provider berdasarkan connection type.
4. SQL, metadata query, error mapping, dan object tree engine-specific hanya boleh ada di package provider.
5. Provider mengekspos version dan capability. UI/API membuat keputusan feature berdasarkan capability.
6. PostgreSQL dan MySQL tidak harus memiliki folder feature yang identik; keseragaman kontrak lebih penting daripada keseragaman internal.

### 4.4 Internal data, auth, dan secret

1. Myadmin auth berbeda total dengan account/role di database target.
2. SQLite menyimpan state internal hanya di data directory aplikasi, bukan server PostgreSQL/MySQL pengguna.
3. Saved credential selalu terenkripsi at rest. Log, error response, audit, telemetry, backup metadata, dan browser response tidak boleh menyertakan credential/token.
4. Password memakai password hashing modern; tidak ada password plaintext atau reversible encryption untuk password Myadmin.
5. Credential decryption hanya terjadi sesaat dalam server process ketika provider membuat connection context; plaintext tidak disimpan kembali.
6. Aksi yang wajib dicatat audit: login/logout/failure penting, perubahan connection, destructive DDL, perubahan user/privilege database, backup, dan restore. SELECT biasa tidak diaudit default agar tidak menjadi sumber data sensitif/volume berlebihan.
7. Semua operasi destructive memerlukan explicit confirmation yang membawa target operasi ke UI/API, bukan confirmation generik yang mudah salah sasaran.

### 4.5 Feature boundary

1. Feature Angular tidak mengimpor detail internal feature lain. Bila perlu lintas fitur, akses melalui public facade atau shared type yang eksplisit.
2. Layout tidak boleh mengetahui SQL, metadata detail provider, atau repository internal.
3. Module server hanya bergantung pada port/contract. Concrete adapter dipasang pada composition root.
4. infrastructure tidak boleh memegang policy domain; ia hanya mengimplementasikan port/integrasi.
5. testkit hanya dipakai test. Tidak ada dependency dari production source menuju tests/testkit.
6. dist adalah output satu arah. Kode sumber tidak pernah mengimpor dist.

## 5. Arah dependency

~~~text
Browser
   │
   ▼
apps/web
   │ imports
   ├── @ojiepermana/angular
   └── @myadmin/sdk-angular
              │
              ▼
      packages/api-contract
              │
     HTTP / WebSocket boundary
              │
              ▼
        apps/server transport
              │
              ▼
        apps/server modules
          │              │
          ▼              ▼
packages/internal-domain   packages/database-core
          ▲              ▲
          │              │
internal-sqlite + crypto   database-postgresql / database-mysql
          \______________/
                 │
     apps/server/bootstrap/composition-root.ts
                 │
                 ▼
             apps/cli
                 │
                 ▼
       Bun Compile platform binary
~~~

Tabel dependency yang diizinkan:

| Dari | Boleh bergantung ke | Tidak boleh bergantung ke |
|---|---|---|
| kernel | library standard/pure utility | apps, transport, driver, provider, SQLite, Angular |
| api-contract | schema/type utility yang murni | server, web, provider |
| sdk-angular | api-contract, @ojiepermana/angular | apps/server, driver, SQLite |
| internal-domain | kernel | internal-sqlite, HTTP, provider, Angular |
| crypto | kernel/internal-domain port seperlunya | web, HTTP route, SQLite repository, provider |
| internal-sqlite | internal-domain, crypto, kernel | Angular, provider database target, application policy |
| database-core | kernel | concrete provider, driver, SQLite, HTTP, Angular |
| database-postgresql/mysql | database-core, kernel, database driver | provider lain, web, apps/server implementation |
| server modules | contract, internal-domain, auth/audit, database-core, jobs | concrete SQLite/driver/provider import langsung |
| server bootstrap | semua concrete adapter yang dibutuhkan | tidak berlaku; ini composition root |
| web feature/layout | web core, sdk-angular, @ojiepermana/angular | raw API URL/fetch, SQLite, database provider |
| tests | semua production package dan testkit | tidak boleh diimpor production |

## 6. Kontrak pelaksanaan dan build

### Runtime user

~~~text
myadmin serve
      │
      ├── resolve data directory
      ├── initialize key provider
      ├── migrate internal SQLite
      ├── compose provider registry
      ├── start Bun HTTP/WebSocket server
      └── serve embedded Angular assets
~~~

Data directory default diputuskan per platform dan dikonfigurasi melalui runtime abstraction. Secara konseptual ia berisi:

~~~text
<myadmin-data>/
├── myadmin.db
├── config/
├── logs/
├── backups/
└── temp/
~~~

### Build release

~~~text
Angular production build
      ↓
dist/web/
      ↓
embed-web-assets.ts
      ↓
Bun server + CLI entrypoint
      ↓
Bun Compile per target
      ↓
dist/binaries/<platform>/
      ↓
checksum, smoke test, signing/installer
~~~

Target release minimum:

~~~text
linux-x64
linux-arm64
macos-x64
macos-arm64
windows-x64
~~~

## 7. Urutan implementasi yang mengikuti struktur ini

1. Foundation: root workspace, TypeScript, Angular app, Bun server, CLI app, lint/format, unit-test runner, Playwright, CI dasar.
2. Contract foundation: OpenAPI v1, error model, generated contract types, SDK Angular, contract verification.
3. UI foundation: instalasi/integrasi @ojiepermana/angular, theme configuration, light/dark/system, app shell, sidebar, workspace/tab/status bar, notification/dialog.
4. Internal platform: data directory, SQLite migration, crypto/key provider, initial admin, auth/session, Admin/User authorization, settings, preferences, audit.
5. Provider foundation: database-core contract, provider registry, PostgreSQL/MySQL connect-test/disconnect, normalized capability/version/error.
6. Connection manager dan workspace persistence.
7. Object explorer lazy-loading lalu query editor/result grid/query history.
8. Data browser dan table/schema/database management dengan confirmation flow.
9. Database security, import/export, backup/restore, monitoring, jobs/progress/cancellation.
10. Full integration, security, E2E binary, release packaging, signing, installer, and operations documentation.

## 8. Guardrail ringkas untuk reviewer

Sebuah perubahan perlu ditolak atau dipindahkan bila:

- frontend memakai raw HttpClient/fetch atau string endpoint;
- generic component Myadmin dibuat padahal foundation sudah menyediakan capability setara;
- SQL PostgreSQL/MySQL muncul di server controller/use case atau aplikasi web;
- core mengimpor provider konkret;
- credential/password/token dapat masuk SQLite plaintext, log, audit, error response, atau fixture;
- controller langsung mengakses SQLite/driver;
- UI memeriksa nama engine untuk menampilkan feature, bukan capability;
- output dist atau generated SDK/type diedit manual;
- test utility masuk dependency production;
- destructive operation tidak memiliki explicit confirmation dan audit event.

Dokumen ini adalah baseline struktur V1. Folder feature/provider V2 boleh disiapkan sebagai batas modular, tetapi tidak boleh diperlakukan sebagai janji implementasi V1 sebelum scope/ADR-nya disetujui.
