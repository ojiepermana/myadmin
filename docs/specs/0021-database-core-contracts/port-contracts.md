# Behavioral port contracts

Dokumen ini adalah ringkasan perilaku minimum untuk port `database-core`. Port
bersifat engine-neutral; provider yang tidak mendukung operasi wajib menyatakan
capability terkait `false` dan melempar `DbError` berkategori `unsupported`,
bukan mengembalikan hasil palsu.

| Port                               | Perilaku wajib                                                                                                                    | Unsupported atau failure boundary                                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `ConnectionPort`                   | Membuka, menutup, ping, mengembalikan info server, dan menguji koneksi memakai `ConnectionContext`.                               | Credential hanya dipakai selama operasi; error koneksi dipetakan ke `DbError` tanpa secret.                       |
| `CapabilityPort`                   | Mengembalikan engine, versi, seluruh `CapabilityKey` V1, serta alasan untuk capability yang tidak tersedia.                       | Capability `false` harus konsisten dengan operasi yang menolak unsupported.                                       |
| `MetadataPort`                     | Membaca database, schema, object, column, index, constraint, dan deskripsi table secara lazy serta berpaginasi.                   | Engine tanpa schema mengembalikan capability/reason yang jujur; query metadata tidak menerima SQL mentah dari UI. |
| `DatabasePort`                     | List, properties, create, dan drop database sesuai kemampuan engine.                                                              | Drop wajib mengikuti confirmation boundary; operasi yang tidak didukung melempar `unsupported`.                   |
| `SchemaPort`                       | List, properties, create, rename, dan drop schema pada engine yang mendukung schema.                                              | Provider tanpa schema tidak membuat schema semu dan menolak operasi dengan `unsupported`.                         |
| `TablePort`                        | Create, alter, dan drop table dengan change set provider-neutral.                                                                 | Destructive operation harus menghasilkan warning/confirmation metadata.                                           |
| `TableDesignerPort`                | Menyediakan catalog tipe, preview change set, lalu apply statement secara berurutan dengan hasil committed/failed yang eksplisit. | Invalid type/parameter menjadi validation error; operasi engine yang tidak didukung tidak dipalsukan.             |
| `TableOperationsPort`              | Menjalankan truncate, rename, dan drop dengan preview, confirmation, serta hasil audit yang dapat diamati.                        | Operasi destructive tanpa confirmation ditolak sebelum provider dipanggil.                                        |
| `ViewPort`                         | List, get definition, preview/create/alter/drop, dan apply perubahan view.                                                        | View editor yang tidak didukung harus mengembalikan `unsupported` dan capability `viewEditor: false`.             |
| `DataPort`                         | Page/read serta insert, update, delete, dan bulk delete dengan typed values dan row identity.                                     | Table tanpa row identity read-only; conflict dan invalid typed value dipetakan sebagai `DbError`.                 |
| `QueryPort`                        | Execute, cancel, explain, dan hasil bertipe melalui sesi query yang sesuai.                                                       | Explain/cancel yang tidak didukung harus `unsupported`; SQL dan error output wajib melalui redaction.             |
| `SecurityPort`                     | List/create/alter/drop principal, reset credential, list grants, grant, dan revoke.                                               | Capability principal/grant mengendalikan UI dan endpoint; credential tidak pernah masuk audit atau log.           |
| `ImportExportPort`                 | Import/export, progress, cancel, transaction mode, dan artifact validation sesuai provider.                                       | Native-tool atau transaction capability yang tidak tersedia dinyatakan eksplisit, tanpa fallback diam-diam.       |
| `BackupPort` / `BackupRestorePort` | Backup/restore native tool, status capability, progress, cancel, artifact, dan validation.                                        | Tool hilang atau tidak kompatibel menghasilkan `unsupported`/reason; password tidak boleh masuk argv.             |
| `MonitoringPort`                   | Mengembalikan status koneksi, versi, database, latency, uptime, dan error terakhir.                                               | Status unavailable harus menjadi error ter-normalisasi, bukan data koneksi yang ditebak.                          |

## Cross-port invariants

- Semua reference dan model data memakai bentuk provider-neutral dari
  `database-core`.
- Provider concrete, driver, HTTP, Angular, dan SQLite tidak boleh diimpor oleh
  `database-core`.
- `DbError` mempertahankan kategori tertutup; `cause` teknis tidak diserialisasi
  ke boundary aplikasi.
- Capability adalah guard kejujuran, bukan sekadar petunjuk UI: request yang
  dipaksa tetap ditolak oleh port atau route.
- Port tidak menyediakan operasi audit update/delete; audit hanya append dan
  query sesuai repository contract.
