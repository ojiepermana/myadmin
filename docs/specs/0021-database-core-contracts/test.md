# Test dan acceptance criteria 0021. Kontrak database-core, capability model, dan registry

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Parsial lokal — provider-neutral contract suite lulus **22 test, 208 assertions**; manual review AC-8 belum tersedia.
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0021.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

port terdefinisi per domain sebagai interface TypeScript kecil: `ConnectionPort` (open, close, ping, serverInfo), `CapabilityPort` (describe), `MetadataPort` (list databases/schemas/objects/columns/indexes/constraints, lazy per node, paginated), `DatabasePort`, `SchemaPort`, `TablePort`, `ViewPort` (list, getDefinition, create, alter, drop), `DataPort` (page, insert, update, delete, bulkDelete), `QueryPort` (execute, cancel, explain), `SecurityPort` (principals, createPrincipal, alterPrincipal, dropPrincipal, resetCredential, grants, grant, revoke), `ImportExportPort`, `BackupRestorePort`, `MonitoringPort` (statusInfo); tidak ada satu interface DatabaseProvider raksasa, provider adalah komposisi port (FR-PROV-01, struktur.md).

### AC-2

`database-core` tidak mengimpor driver, HTTP, SQLite, Angular, atau provider konkret; ditegakkan boundary check.

### AC-3

model capability: `{ engine, version, capabilities: Record<CapabilityKey, boolean>, reasons?: Record<CapabilityKey, string> }` dengan `CapabilityKey` terdaftar tertutup untuk V1: `schemas`, `viewEditor`, `explain`, `cancelQuery`, `backupRestore`, `importExport`, `principals`, `grants`, `tableComments`, `generatedColumns`, `identityColumns`, `checkConstraints`, plus kunci V2 yang sudah dinyatakan false (`materializedViews`, `vacuum`, `rowLevelSecurity`, `events`, `binlog`); bentuk cocok dengan schema kontrak API (spec 0003).

### AC-4

`ConnectionContext` membawa descriptor koneksi plus credential plaintext berumur sesaat dari vault; tipe nya tidak serializable (tidak lolos JSON.stringify dengan nilai rahasia: field secret sebagai getter non enumerable) sebagai pertahanan struktural terhadap kebocoran (FR-INT-04).

### AC-5

`ProviderRegistry.get(engine)` mengembalikan provider terdaftar; engine tidak dikenal menghasilkan error ternormalisasi; registrasi terjadi di composition root server, bukan di core (FR-PROV-03).

### AC-6

model error ternormalisasi `DbError { category, message, position?, sqlState?, cause tersembunyi }` dengan kategori tertutup: `auth_failed`, `connection_failed`, `tls_failed`, `timeout`, `permission_denied`, `not_found`, `conflict`, `syntax_error` (dengan posisi bila ada), `constraint_violation`, `cancelled`, `unsupported`, `internal`; pesan aman tanpa secret; pemetaan detail milik provider.

### AC-7

model umum terdefinisi: identitas object (`ObjectRef { database, schema?, name, type }`), halaman data (`Page { items, cursor?, total? }`), definisi kolom, definisi index dan constraint, principal, grant; semuanya engine netral dan menjadi bahasa bersama UI, kontrak API, dan provider.

### AC-8

setiap port punya dokumentasi kontrak perilaku singkat (apa yang wajib, apa yang boleh tidak didukung dan bagaimana menyatakannya: lempar `unsupported` plus capability false).

### AC-9

test kontrak generik tersedia di package (suite yang bisa dijalankan terhadap provider mana pun) untuk perilaku dasar: describe konsisten dengan operasi yang berhasil, error ternormalisasi pada kredensial salah; dipakai spec 0022 dan 0024.

## Matriks cakupan

| AC            | Unit          | Integration | Contract      | E2E | Security       | Performance | Visual | Smoke | Manual atau external |
| ------------- | ------------- | ----------- | ------------- | --- | -------------- | ----------- | ------ | ----- | -------------------- |
| [AC-1](#ac-1) | n/a           | n/a         | `CT-0021-AC1` | n/a | n/a            | n/a         | n/a    | n/a   | n/a                  |
| [AC-2](#ac-2) | n/a           | n/a         | `CT-0021-AC2` | n/a | n/a            | n/a         | n/a    | n/a   | n/a                  |
| [AC-3](#ac-3) | `UT-0021-AC3` | n/a         | `CT-0021-AC3` | n/a | n/a            | n/a         | n/a    | n/a   | n/a                  |
| [AC-4](#ac-4) | `UT-0021-AC4` | n/a         | n/a           | n/a | `SEC-0021-AC4` | n/a         | n/a    | n/a   | n/a                  |
| [AC-5](#ac-5) | `UT-0021-AC5` | n/a         | `CT-0021-AC5` | n/a | n/a            | n/a         | n/a    | n/a   | n/a                  |
| [AC-6](#ac-6) | `UT-0021-AC6` | n/a         | n/a           | n/a | `SEC-0021-AC6` | n/a         | n/a    | n/a   | n/a                  |
| [AC-7](#ac-7) | n/a           | n/a         | `CT-0021-AC7` | n/a | n/a            | n/a         | n/a    | n/a   | n/a                  |
| [AC-8](#ac-8) | n/a           | n/a         | `CT-0021-AC8` | n/a | n/a            | n/a         | n/a    | n/a   | `MANUAL-0021-AC8`    |
| [AC-9](#ac-9) | n/a           | n/a         | `CT-0021-AC9` | n/a | n/a            | n/a         | n/a    | n/a   | n/a                  |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

| ID            | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                                       | Expected result                                      |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `UT-0021-AC3` | [AC-3](#ac-3) | model capability: { engine, version, capabilities: Record<CapabilityKey, boolean>, reasons?: Record<CapabilityKey, string> } dengan CapabilityKey terdaftar t... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `UT-0021-AC4` | [AC-4](#ac-4) | ConnectionContext membawa descriptor koneksi plus credential plaintext berumur sesaat dari vault; tipe nya tidak serializable (tidak lolos JSON.stringify den... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `UT-0021-AC5` | [AC-5](#ac-5) | ProviderRegistry.get(engine) mengembalikan provider terdaftar; engine tidak dikenal menghasilkan error ternormalisasi; registrasi terjadi di composition root... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `UT-0021-AC6` | [AC-6](#ac-6) | model error ternormalisasi DbError { category, message, position?, sqlState?, cause tersembunyi } dengan kategori tertutup: auth_failed, connection_failed, t... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

## Integration test

Tidak ada integration yang diwajibkan oleh acceptance criteria saat ini.

## Test tambahan

### Contract test

| ID            | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                          | Expected result                                                          |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `CT-0021-AC1` | [AC-1](#ac-1) | port terdefinisi per domain sebagai interface TypeScript kecil: ConnectionPort (open, close, ping, serverInfo), CapabilityPort (describe), MetadataPort (list... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-1 terpenuhi.                     |
| `CT-0021-AC2` | [AC-2](#ac-2) | database-core tidak mengimpor driver, HTTP, SQLite, Angular, atau provider konkret; ditegakkan boundary check.                                                   | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-2 terpenuhi.                     |
| `CT-0021-AC3` | [AC-3](#ac-3) | model capability: { engine, version, capabilities: Record<CapabilityKey, boolean>, reasons?: Record<CapabilityKey, string> } dengan CapabilityKey terdaftar t... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-3 terpenuhi.                     |
| `CT-0021-AC5` | [AC-5](#ac-5) | ProviderRegistry.get(engine) mengembalikan provider terdaftar; engine tidak dikenal menghasilkan error ternormalisasi; registrasi terjadi di composition root... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-5 terpenuhi.                     |
| `CT-0021-AC7` | [AC-7](#ac-7) | model umum terdefinisi: identitas object (ObjectRef { database, schema?, name, type }), halaman data (Page { items, cursor?, total? }), definisi kolom, defin... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-7 terpenuhi.                     |
| `CT-0021-AC8` | [AC-8](#ac-8) | setiap port punya dokumentasi kontrak perilaku singkat, termasuk unsupported boundary dan cross-port invariants.                                                 | Bandingkan dokumentasi port dengan daftar port pada `database-core` dan aturan capability.  | Semua port terdaftar dan memiliki perilaku wajib serta failure boundary. |
| `CT-0021-AC9` | [AC-9](#ac-9) | test kontrak generik tersedia di package (suite yang bisa dijalankan terhadap provider mana pun) untuk perilaku dasar: describe konsisten dengan operasi yang... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-9 terpenuhi.                     |

### E2E

Tidak ada e2e yang diwajibkan oleh acceptance criteria saat ini.

### Security

| ID             | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                               | Expected result                                      |
| -------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `SEC-0021-AC4` | [AC-4](#ac-4) | ConnectionContext membawa descriptor koneksi plus credential plaintext berumur sesaat dari vault; tipe nya tidak serializable (tidak lolos JSON.stringify den... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `SEC-0021-AC6` | [AC-6](#ac-6) | model error ternormalisasi DbError { category, message, position?, sqlState?, cause tersembunyi } dengan kategori tertutup: auth_failed, connection_failed, t... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

### Performance

Tidak ada performance yang diwajibkan oleh acceptance criteria saat ini.

### Visual dan accessibility

Tidak ada visual dan accessibility yang diwajibkan oleh acceptance criteria saat ini.

### Smoke dan operational acceptance

Tidak ada smoke dan operational yang diwajibkan oleh acceptance criteria saat ini.

### Manual atau external proof

| ID                | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                               | Expected result                                      |
| ----------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `MANUAL-0021-AC8` | [AC-8](#ac-8) | setiap port punya dokumentasi kontrak perilaku singkat (apa yang wajib, apa yang boleh tidak didukung dan bagaimana menyatakannya: lempar unsupported plus ca... | Lakukan review manusia atau kumpulkan bukti eksternal yang tidak dapat digantikan test otomatis. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

## Critical test scenarios

- Kontrak: suite generik lulus terhadap provider fake referensi yang disertakan package, verifikasi **AC-9**.
- Kebocoran: `JSON.stringify(connectionContext)` tidak memuat secret, verifikasi **AC-4**.
- Boundary: menambah import `pg`/driver di core gagal check, verifikasi **AC-2**.

## Staged, environment, dan external proof

Tidak ada staged, environment, atau external proof khusus yang sudah diidentifikasi.

## Fixture dan environment

| Area         | Aturan                                                                                                         |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| Data         | Gunakan data sintetis atau tersanitasi. Jangan memakai credential, token, atau data produksi nyata.            |
| Resource     | Database, file, port, process, dan container harus disposable serta memiliki cleanup deterministik.            |
| Version      | Pin versi environment yang dibuktikan. Jangan memakai label dinamis seperti `latest` sebagai bukti acceptance. |
| Root command | Instalasi dan command test selalu dimulai dari akar repo dan satu `package.json`.                              |

## Exit criteria test

- Setiap AC memiliki test ID atau jalur proof yang eksplisit pada [verify.md](verify.md).
- Unit dan integration test yang relevan diimplementasikan, lulus, dan dapat diulang dari checkout bersih.
- Test yang tidak relevan ditandai `n/a` dengan alasan yang tetap benar setelah implementasi.
- External proof tidak boleh diganti local smoke test. Staged proof tidak boleh ditutup sebelum dependency yang disebut tersedia.
- Tidak ada test yang dianggap lulus hanya karena file atau placeholder tersedia.
