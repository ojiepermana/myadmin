# Indeks Spec Myadmin V1

Nomor spec adalah identifier katalog; urutan build mengikuti dependency. Kerjakan
berurutan; sebuah spec boleh dimulai bila seluruh prasyaratnya selesai. Bila
nomor dan dependency berbeda, dependency menjadi sumber kebenaran. Status hidup
di masing masing file spec. Indeks ini dimiliki oleh /architect.

## Resolusi status 2026-08-29

Enam spec yang sebelumnya berstatus `Proposed`, yaitu `0016`, `0017`, `0019`,
`0033`, `0048`, dan `0050`, diputuskan menjadi `In Progress`. Implementasinya
telah tersedia dan dapat diuji secara lokal, tetapi bukti acceptance belum
lengkap pada semua AC, terutama proof visual, database nyata, dan proof
operasional eksternal. Status tidak dinaikkan menjadi `Accepted` sebelum setiap
AC memiliki evidence nyata dan checklist `verify.md` yang sesuai. Tidak ada spec
yang saat ini berstatus `Proposed`. Spec standar lintas modul `0056` diratifikasi
pada 2026-08-29 dan berstatus `Accepted` sebagai keputusan standalone di luar
urutan build fase; adopsi codenya tetap dibuktikan lewat evidence per AC.

Keputusan teknis lanjutan pada tanggal yang sama: budget bundle Angular tetap
`900kB` untuk warning dan `1MB` untuk error. Build production saat ini berada
di bawah batas tersebut (`893.70kB` initial), sehingga threshold tidak dinaikkan;
optimasi bundle menjadi pekerjaan berikutnya bila warning terlampaui. Validasi
date-time RFC3339 menggunakan mode penuh AJV, alias `vi.*` tidak tersisa pada
source dan test aktif, dan batasan MySQL Bun SQL untuk `sslmode=disable` serta
`caching_sha2_password` sudah didokumentasikan di spec provider.

## Snapshot evidence 2026-08-30

Matrix acceptance terbaru mencatat **459 acceptance criteria**, dengan **401
fully evidenced**, **28 partial**, dan **30 blocked**. Root regression mencatat
**615 pass, 18 skip, 0 fail**; mock browser sweep mencatat **44 pass, 5 skip,
0 fail**; dan real query workflow pada PostgreSQL/MySQL mencatat **4 pass, 0
fail**.

Build dan test lokal untuk feature database, Angular, security, performance,
backup/restore, dan packaging sudah dicatat pada evidence files serta commit
terpisah. Status spec yang masih `in-progress` tidak dinaikkan hanya dari bukti
lokal bila acceptance masih membutuhkan hosted CI, clean platform/VM,
signing/notarization, release nyata, atau manual/external sign-off. Rincian
terbaru berada di [acceptance matrix](ac-evidence-matrix.md) dan
[evidence index](evidence/2026-08-29-e2e.md).

Sumber kebutuhan: [v1-feature-specification.md](../../plan/v1-feature-specification.md), [struktur.md](../../plan/struktur.md), [feature.md](../../plan/feature.md). Folder rencana hidup di `plan/` pada akar repo.

Repo memakai tepat satu `package.json` di akar. Istilah package internal pada indeks dan spec berarti modul source di bawah `packages/*`, bukan package manager package dengan manifest sendiri.

## Pola direktori setiap spec

Setiap feature spec memakai satu direktori bernomor dan tepat empat file berikut:

```text
docs/specs/NNNN-nama-spec/
|-- index.md
|-- relation.md
|-- test.md
`-- verify.md
```

- `index.md` adalah spec utama untuk tujuan, keputusan, feature design, build plan, consequence, rationale, dan follow up.
- `relation.md` mencatat dependency, kontrak lintas spec, konsumen downstream, environment, dan handoff.
- `test.md` adalah sumber normatif acceptance criteria, matriks cakupan, serta daftar unit, integration, dan test khusus.
- `verify.md` adalah rencana dan catatan pembuktian runtime. File ini menyimpan evidence serta verdict, bukan mendefinisikan ulang AC.
- Status spec hanya hidup di `index.md`. Companion file menautkan status kanonis itu dan tidak boleh mengklaim test atau verifikasi sudah dijalankan tanpa evidence.
- Seluruh dependency dan command dimiliki satu `package.json` di akar repo. Tidak ada manifest atau command package level di bawah `apps/*` maupun `packages/*`.

Spec standar lintas modul (umbrella) adalah pengecualian bentuk yang disengaja:
selain empat file di atas ia boleh memuat `rationale.md` (catatan keputusan yang
tidak dibaca saat build) dan child spec `NNNN-nama-child.md` per area. Hanya
`index.md` yang memuat baris status; child tidak memuat status dan diatur oleh
umbrella. `test.md` umbrella tetap satu satunya sumber AC dan test ID untuk
matrix, dengan konvensi ID bertipe yang sama (`JENIS-NNNN-ACn`).

## Fase A. Fondasi

| Spec                                                  | Judul                                       | Prasyarat  | Relation                                                     | Verify                                                   | Test                                                 |
| ----------------------------------------------------- | ------------------------------------------- | ---------- | ------------------------------------------------------------ | -------------------------------------------------------- | ---------------------------------------------------- |
| [0001](0001-root-manifest-source-modules/index.md)    | Fondasi repo satu manifest dan modul source | tidak ada  | [relation](0001-root-manifest-source-modules/relation.md)    | [verify](0001-root-manifest-source-modules/verify.md)    | [test](0001-root-manifest-source-modules/test.md)    |
| [0002](0002-quality-tooling-ci/index.md)              | Quality tooling dan CI                      | 0001       | [relation](0002-quality-tooling-ci/relation.md)              | [verify](0002-quality-tooling-ci/verify.md)              | [test](0002-quality-tooling-ci/test.md)              |
| [0003](0003-openapi-contract-structure/index.md)      | Struktur kontrak OpenAPI v1 dan error model | 0001       | [relation](0003-openapi-contract-structure/relation.md)      | [verify](0003-openapi-contract-structure/verify.md)      | [test](0003-openapi-contract-structure/test.md)      |
| [0004](0004-codegen-pipeline-contract-tests/index.md) | Pipeline codegen dan contract test          | 0003       | [relation](0004-codegen-pipeline-contract-tests/relation.md) | [verify](0004-codegen-pipeline-contract-tests/verify.md) | [test](0004-codegen-pipeline-contract-tests/test.md) |
| [0005](0005-sdk-angular-core/index.md)                | SDK Angular core                            | 0004       | [relation](0005-sdk-angular-core/relation.md)                | [verify](0005-sdk-angular-core/verify.md)                | [test](0005-sdk-angular-core/test.md)                |
| [0006](0006-cli-runtime-data-directory/index.md)      | CLI runtime dan data directory              | 0001       | [relation](0006-cli-runtime-data-directory/relation.md)      | [verify](0006-cli-runtime-data-directory/verify.md)      | [test](0006-cli-runtime-data-directory/test.md)      |
| [0008](0008-sqlite-core-migrations/index.md)          | SQLite core dan migration runner            | 0006       | [relation](0008-sqlite-core-migrations/relation.md)          | [verify](0008-sqlite-core-migrations/verify.md)          | [test](0008-sqlite-core-migrations/test.md)          |
| [0007](0007-doctor-migrate-commands/index.md)         | Perintah doctor dan migrate                 | 0006, 0008 | [relation](0007-doctor-migrate-commands/relation.md)         | [verify](0007-doctor-migrate-commands/verify.md)         | [test](0007-doctor-migrate-commands/test.md)         |
| [0009](0009-internal-repositories/index.md)           | Internal repositories                       | 0008       | [relation](0009-internal-repositories/relation.md)           | [verify](0009-internal-repositories/verify.md)           | [test](0009-internal-repositories/test.md)           |
| [0010](0010-key-provider-password-hashing/index.md)   | Key provider dan password hashing           | 0006       | [relation](0010-key-provider-password-hashing/relation.md)   | [verify](0010-key-provider-password-hashing/verify.md)   | [test](0010-key-provider-password-hashing/test.md)   |
| [0011](0011-credential-vault-redaction/index.md)      | Credential vault dan redaction              | 0010       | [relation](0011-credential-vault-redaction/relation.md)      | [verify](0011-credential-vault-redaction/verify.md)      | [test](0011-credential-vault-redaction/test.md)      |
| [0012](0012-config-package/index.md)                  | Package config                              | 0006       | [relation](0012-config-package/relation.md)                  | [verify](0012-config-package/verify.md)                  | [test](0012-config-package/test.md)                  |
| [0013](0013-observability-package/index.md)           | Package observability                       | 0011, 0012 | [relation](0013-observability-package/relation.md)           | [verify](0013-observability-package/verify.md)           | [test](0013-observability-package/test.md)           |
| [0014](0014-ui-foundation-theme/index.md)             | UI foundation dan theme                     | 0001       | [relation](0014-ui-foundation-theme/relation.md)             | [verify](0014-ui-foundation-theme/verify.md)             | [test](0014-ui-foundation-theme/test.md)             |
| [0015](0015-app-shell-navigation/index.md)            | App shell dan navigation                    | 0014       | [relation](0015-app-shell-navigation/relation.md)            | [verify](0015-app-shell-navigation/verify.md)            | [test](0015-app-shell-navigation/test.md)            |

## Fase B. Auth dan audit

| Spec                                                  | Judul                               | Prasyarat              | Relation                                                     | Verify                                                   | Test                                                 |
| ----------------------------------------------------- | ----------------------------------- | ---------------------- | ------------------------------------------------------------ | -------------------------------------------------------- | ---------------------------------------------------- |
| [0016](0016-initial-setup-flow/index.md)              | Initial setup end to end            | 0005, 0009, 0010, 0015 | [relation](0016-initial-setup-flow/relation.md)              | [verify](0016-initial-setup-flow/verify.md)              | [test](0016-initial-setup-flow/test.md)              |
| [0017](0017-login-session/index.md)                   | Login, logout, dan session          | 0016                   | [relation](0017-login-session/relation.md)                   | [verify](0017-login-session/verify.md)                   | [test](0017-login-session/test.md)                   |
| [0018](0018-user-management-change-password/index.md) | User management dan change password | 0017                   | [relation](0018-user-management-change-password/relation.md) | [verify](0018-user-management-change-password/verify.md) | [test](0018-user-management-change-password/test.md) |
| [0019](0019-audit-subsystem/index.md)                 | Subsistem audit append only         | 0009, 0011             | [relation](0019-audit-subsystem/relation.md)                 | [verify](0019-audit-subsystem/verify.md)                 | [test](0019-audit-subsystem/test.md)                 |
| [0020](0020-audit-admin-page/index.md)                | Halaman audit Admin                 | 0017, 0019             | [relation](0020-audit-admin-page/relation.md)                | [verify](0020-audit-admin-page/verify.md)                | [test](0020-audit-admin-page/test.md)                |

## Fase C. Provider dan koneksi

| Spec                                                   | Judul                                       | Prasyarat              | Relation                                                      | Verify                                                    | Test                                                  |
| ------------------------------------------------------ | ------------------------------------------- | ---------------------- | ------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------- |
| [0021](0021-database-core-contracts/index.md)          | Kontrak database-core, capability, registry | 0001                   | [relation](0021-database-core-contracts/relation.md)          | [verify](0021-database-core-contracts/verify.md)          | [test](0021-database-core-contracts/test.md)          |
| [0022](0022-postgresql-connection-capability/index.md) | PostgreSQL: koneksi, TLS, capability        | 0021                   | [relation](0022-postgresql-connection-capability/relation.md) | [verify](0022-postgresql-connection-capability/verify.md) | [test](0022-postgresql-connection-capability/test.md) |
| [0023](0023-postgresql-metadata/index.md)              | PostgreSQL: metadata dan introspeksi        | 0022                   | [relation](0023-postgresql-metadata/relation.md)              | [verify](0023-postgresql-metadata/verify.md)              | [test](0023-postgresql-metadata/test.md)              |
| [0024](0024-mysql-connection-capability/index.md)      | MySQL: koneksi, TLS, capability             | 0021                   | [relation](0024-mysql-connection-capability/relation.md)      | [verify](0024-mysql-connection-capability/verify.md)      | [test](0024-mysql-connection-capability/test.md)      |
| [0025](0025-mysql-metadata/index.md)                   | MySQL: metadata dan introspeksi             | 0024                   | [relation](0025-mysql-metadata/relation.md)                   | [verify](0025-mysql-metadata/verify.md)                   | [test](0025-mysql-metadata/test.md)                   |
| [0026](0026-connection-manager-crud/index.md)          | Connection manager: CRUD dan vault          | 0011, 0017, 0022, 0024 | [relation](0026-connection-manager-crud/relation.md)          | [verify](0026-connection-manager-crud/verify.md)          | [test](0026-connection-manager-crud/test.md)          |
| [0027](0027-connection-lifecycle-status/index.md)      | Connection manager: lifecycle dan status    | 0026                   | [relation](0027-connection-lifecycle-status/relation.md)      | [verify](0027-connection-lifecycle-status/verify.md)      | [test](0027-connection-lifecycle-status/test.md)      |
| [0028](0028-jobs-infrastructure/index.md)              | Jobs infrastructure                         | 0017                   | [relation](0028-jobs-infrastructure/relation.md)              | [verify](0028-jobs-infrastructure/verify.md)              | [test](0028-jobs-infrastructure/test.md)              |
| [0029](0029-realtime-websocket/index.md)               | Realtime WebSocket dan klien SDK            | 0017, 0028             | [relation](0029-realtime-websocket/relation.md)               | [verify](0029-realtime-websocket/verify.md)               | [test](0029-realtime-websocket/test.md)               |
| [0030](0030-workspace-persistence/index.md)            | Workspace persistence                       | 0017, 0015             | [relation](0030-workspace-persistence/relation.md)            | [verify](0030-workspace-persistence/verify.md)            | [test](0030-workspace-persistence/test.md)            |

## Fase D. Fitur database inti

| Spec                                                     | Judul                                | Prasyarat        | Relation                                                        | Verify                                                      | Test                                                    |
| -------------------------------------------------------- | ------------------------------------ | ---------------- | --------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------- |
| [0031](0031-object-explorer/index.md)                    | Object explorer                      | 0023, 0025, 0027 | [relation](0031-object-explorer/relation.md)                    | [verify](0031-object-explorer/verify.md)                    | [test](0031-object-explorer/test.md)                    |
| [0032](0032-object-search/index.md)                      | Object search                        | 0031             | [relation](0032-object-search/relation.md)                      | [verify](0032-object-search/verify.md)                      | [test](0032-object-search/test.md)                      |
| [0033](0033-query-editor-execution/index.md)             | Query editor: tab dan eksekusi       | 0027, 0029       | [relation](0033-query-editor-execution/relation.md)             | [verify](0033-query-editor-execution/verify.md)             | [test](0033-query-editor-execution/test.md)             |
| [0034](0034-result-grid-export/index.md)                 | Result grid dan export result        | 0033             | [relation](0034-result-grid-export/relation.md)                 | [verify](0034-result-grid-export/verify.md)                 | [test](0034-result-grid-export/test.md)                 |
| [0035](0035-query-cancel-explain/index.md)               | Query cancel dan EXPLAIN             | 0033             | [relation](0035-query-cancel-explain/relation.md)               | [verify](0035-query-cancel-explain/verify.md)               | [test](0035-query-cancel-explain/test.md)               |
| [0036](0036-query-history-saved-queries/index.md)        | Query history dan saved queries      | 0033             | [relation](0036-query-history-saved-queries/relation.md)        | [verify](0036-query-history-saved-queries/verify.md)        | [test](0036-query-history-saved-queries/test.md)        |
| [0037](0037-data-browser-read/index.md)                  | Data browser: jalur baca             | 0031, 0034       | [relation](0037-data-browser-read/relation.md)                  | [verify](0037-data-browser-read/verify.md)                  | [test](0037-data-browser-read/test.md)                  |
| [0038](0038-data-browser-write/index.md)                 | Data browser: jalur tulis            | 0037, 0019       | [relation](0038-data-browser-write/relation.md)                 | [verify](0038-data-browser-write/verify.md)                 | [test](0038-data-browser-write/test.md)                 |
| [0039](0039-database-management/index.md)                | Manajemen database                   | 0031, 0019       | [relation](0039-database-management/relation.md)                | [verify](0039-database-management/verify.md)                | [test](0039-database-management/test.md)                |
| [0040](0040-schema-management/index.md)                  | Manajemen schema                     | 0039             | [relation](0040-schema-management/relation.md)                  | [verify](0040-schema-management/verify.md)                  | [test](0040-schema-management/test.md)                  |
| [0041](0041-table-designer-columns/index.md)             | Table designer: kolom                | 0031, 0019       | [relation](0041-table-designer-columns/relation.md)             | [verify](0041-table-designer-columns/verify.md)             | [test](0041-table-designer-columns/test.md)             |
| [0042](0042-table-designer-indexes-constraints/index.md) | Table designer: index dan constraint | 0041             | [relation](0042-table-designer-indexes-constraints/relation.md) | [verify](0042-table-designer-indexes-constraints/verify.md) | [test](0042-table-designer-indexes-constraints/test.md) |
| [0043](0043-table-destructive-operations/index.md)       | Operasi destructive table            | 0041             | [relation](0043-table-destructive-operations/relation.md)       | [verify](0043-table-destructive-operations/verify.md)       | [test](0043-table-destructive-operations/test.md)       |
| [0044](0044-view-management/index.md)                    | Manajemen view (CRUD GUI)            | 0019, 0031, 0033 | [relation](0044-view-management/relation.md)                    | [verify](0044-view-management/verify.md)                    | [test](0044-view-management/test.md)                    |
| [0045](0045-database-security-principals/index.md)       | Security database: principal         | 0031, 0019       | [relation](0045-database-security-principals/relation.md)       | [verify](0045-database-security-principals/verify.md)       | [test](0045-database-security-principals/test.md)       |
| [0046](0046-database-security-privileges/index.md)       | Security database: privilege         | 0045             | [relation](0046-database-security-privileges/relation.md)       | [verify](0046-database-security-privileges/verify.md)       | [test](0046-database-security-privileges/test.md)       |

## Fase E. Operasi data

| Spec                                       | Judul                    | Prasyarat        | Relation                                          | Verify                                        | Test                                      |
| ------------------------------------------ | ------------------------ | ---------------- | ------------------------------------------------- | --------------------------------------------- | ----------------------------------------- |
| [0047](0047-export-jobs/index.md)          | Export                   | 0028, 0029, 0037 | [relation](0047-export-jobs/relation.md)          | [verify](0047-export-jobs/verify.md)          | [test](0047-export-jobs/test.md)          |
| [0048](0048-import-jobs/index.md)          | Import                   | 0047             | [relation](0048-import-jobs/relation.md)          | [verify](0048-import-jobs/verify.md)          | [test](0048-import-jobs/test.md)          |
| [0049](0049-backup/index.md)               | Backup                   | 0028, 0007       | [relation](0049-backup/relation.md)               | [verify](0049-backup/verify.md)               | [test](0049-backup/test.md)               |
| [0050](0050-restore/index.md)              | Restore                  | 0049             | [relation](0050-restore/relation.md)              | [verify](0050-restore/verify.md)              | [test](0050-restore/test.md)              |
| [0051](0051-monitoring-status/index.md)    | Monitoring status dasar  | 0027             | [relation](0051-monitoring-status/relation.md)    | [verify](0051-monitoring-status/verify.md)    | [test](0051-monitoring-status/test.md)    |
| [0052](0052-settings-preferences/index.md) | Settings dan preferences | 0017             | [relation](0052-settings-preferences/relation.md) | [verify](0052-settings-preferences/verify.md) | [test](0052-settings-preferences/test.md) |

## Fase F. Penutup

| Spec                                         | Judul                                                | Prasyarat        | Relation                                            | Verify                                          | Test                                        |
| -------------------------------------------- | ---------------------------------------------------- | ---------------- | --------------------------------------------------- | ----------------------------------------------- | ------------------------------------------- |
| [0053](0053-security-hardening/index.md)     | Hardening keamanan lintas fitur                      | seluruh fitur P0 | [relation](0053-security-hardening/relation.md)     | [verify](0053-security-hardening/verify.md)     | [test](0053-security-hardening/test.md)     |
| [0054](0054-binary-packaging-smoke/index.md) | Packaging binary dan smoke test                      | 0006, 0053       | [relation](0054-binary-packaging-smoke/relation.md) | [verify](0054-binary-packaging-smoke/verify.md) | [test](0054-binary-packaging-smoke/test.md) |
| [0055](0055-distribution-release/index.md)   | Distribusi, signing, installer, dokumentasi operator | 0054             | [relation](0055-distribution-release/relation.md)   | [verify](0055-distribution-release/verify.md)   | [test](0055-distribution-release/test.md)   |

## Standar lintas modul

Spec di bagian ini adalah keputusan standalone di luar urutan build fase. Nomornya
adalah identifier katalog, bukan urutan build; prasyaratnya bertingkat dan hidup
di `relation.md` masing masing.

| Spec                                               | Judul                                       | Prasyarat                   | Relation                                                  | Verify                                                | Test                                              |
| -------------------------------------------------- | ------------------------------------------- | --------------------------- | --------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------- |
| [0056](0056-bun-angular-runtime-standard/index.md) | Standar runtime Bun dan reaktivitas Angular | dua tingkat, lihat relation | [relation](0056-bun-angular-runtime-standard/relation.md) | [verify](0056-bun-angular-runtime-standard/verify.md) | [test](0056-bun-angular-runtime-standard/test.md) |

## Keputusan lintas spec yang sudah dikunci

Hasil sesi desain 2026-08-28 bersama pemilik proyek, mengikat untuk seluruh spec:

1. Monitoring V1 hanya status dasar (status koneksi, versi dan info server, durasi, error dasar). Active sessions, running query, dan lock adalah V2. Deskripsi fitur monitoring di struktur.md bagian feature table dikoreksi oleh keputusan ini.
2. Streaming export data besar masuk V1. Baris "Streaming large exports V2" di feature.md dikoreksi oleh keputusan ini.
3. View mendapat CRUD GUI penuh di V1. Ini melampaui v1-feature-specification, sehingga kontrak view ditambahkan ke database-core (spec 0021) dan fitur view punya spec sendiri (spec 0044).
4. Grant dan revoke V1 pada level database dan table. Column level dan object khusus lain V2.
5. Master key vault berasal dari keyfile yang dibuat otomatis dengan permission ketat, dapat dioverride environment variable atau path custom. OS keychain adalah V2.
6. Framework server: Elysia. Driver database: Bun.sql native untuk PostgreSQL dan MySQL, dengan cancel lewat koneksi kontrol (pg_cancel_backend dan KILL QUERY). Editor SQL: CodeMirror 6. Codegen: openapi-typescript plus SDK tipis.
7. @ojiepermana/angular terverifikasi di npm publik (v22.1.7, terbit 2026-08-26, MIT, peer Angular 22 ke atas; @angular/material menjadi peer opsional untuk komponen select, date picker, dan calendar milik paket itu).
8. Opsi backup structure only atau data only dan compression masuk V1 sesuai feature.md.
