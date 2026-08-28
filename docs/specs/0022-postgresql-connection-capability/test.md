# Test dan acceptance criteria 0022. Provider PostgreSQL: koneksi, TLS, capability, error mapping

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Belum dijalankan
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0022.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

`ConnectionPort.open(context)` membuka koneksi Bun.sql dari `ConnectionContext` (host, port, database awal, user, secret, TLS, timeout); sukses menghasilkan handle sesi dengan `backend_pid` tercatat; `close` menutup bersih.

### AC-2

mode TLS didukung dan ditegakkan: `disable`, `require`, `verify-ca`, `verify-full`, dengan CA custom opsional dari konfigurasi koneksi non rahasia; bila server tidak memenuhi mode yang diminta, koneksi gagal `tls_failed`; tidak ada fallback otomatis ke plaintext (FR-CONN-05).

### AC-3

connect timeout dari descriptor ditegakkan; lewat tenggat menghasilkan `timeout` dengan pesan aman.

### AC-4

`test(context)` mengembalikan hasil ternormalisasi: sukses (versi server, latency) atau `DbError`; tidak menyimpan apa pun (FR-CONN-02).

### AC-5

`CapabilityPort.describe` mendeteksi versi server dan mengembalikan capability V1 PostgreSQL: `schemas` true, `viewEditor` true, `explain` true, `cancelQuery` true, `principals` true, `grants` true, `tableComments` true, `generatedColumns` dan `identityColumns` sesuai versi server, `checkConstraints` true, kunci V2 false dengan `reasons` bila bermakna; `backupRestore` dan `importExport` diisi benar setelah spec terkait (sementara false dengan reason "belum tersedia").

### AC-6

pemetaan error: SQLSTATE 28xxx → `auth_failed`, 3D000/42P01 dan sejenis → `not_found`, 42501 → `permission_denied`, 23xxx → `constraint_violation`, 42601 → `syntax_error` dengan posisi dari field error, 57014 → `cancelled`, kegagalan jaringan → `connection_failed`; pesan hasil mapping tidak pernah memuat connection string atau secret.

### AC-7

infrastruktur cancel: setiap sesi query menyimpan `backend_pid`; `cancel(handle)` mencoba API cancel Bun.sql bila terbukti bekerja, dan selalu punya jalur `pg_cancel_backend(pid)` lewat koneksi kontrol singkat; hasil cancel terverifikasi (query berhenti dengan SQLSTATE 57014).

### AC-8

suite test kontrak generik (spec 0021) lulus terhadap provider ini pada server PostgreSQL nyata dua versi mayor yang didukung (yang terbaru dan satu sebelumnya), di `tests/integration/postgresql/`.

### AC-9

tidak ada import dari `database-mysql` atau sebaliknya; SQL dan semantik PostgreSQL tidak bocor keluar package (boundary check).

## Matriks cakupan

| AC | Unit | Integration | Contract | E2E | Security | Performance | Visual | Smoke | Manual atau external |
|---|---|---|---|---|---|---|---|---|---|
| [AC-1](#ac-1) | n/a | `IT-0022-AC1` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-2](#ac-2) | n/a | `IT-0022-AC2` | n/a | n/a | `SEC-0022-AC2` | n/a | n/a | n/a | n/a |
| [AC-3](#ac-3) | n/a | `IT-0022-AC3` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-4](#ac-4) | n/a | `IT-0022-AC4` | n/a | n/a | `SEC-0022-AC4` | n/a | n/a | n/a | n/a |
| [AC-5](#ac-5) | n/a | `IT-0022-AC5` | `CT-0022-AC5` | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-6](#ac-6) | `UT-0022-AC6` | n/a | n/a | n/a | `SEC-0022-AC6` | n/a | n/a | n/a | n/a |
| [AC-7](#ac-7) | n/a | `IT-0022-AC7` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-8](#ac-8) | n/a | `IT-0022-AC8` | `CT-0022-AC8` | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-9](#ac-9) | n/a | n/a | `CT-0022-AC9` | n/a | n/a | n/a | n/a | n/a | n/a |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `UT-0022-AC6` | [AC-6](#ac-6) | pemetaan error: SQLSTATE 28xxx → auth_failed, 3D000/42P01 dan sejenis → not_found, 42501 → permission_denied, 23xxx → constraint_violation, 42601 → syntax_er... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

## Integration test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `IT-0022-AC1` | [AC-1](#ac-1) | ConnectionPort.open(context) membuka koneksi Bun.sql dari ConnectionContext (host, port, database awal, user, secret, TLS, timeout); sukses menghasilkan hand... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `IT-0022-AC2` | [AC-2](#ac-2) | mode TLS didukung dan ditegakkan: disable, require, verify-ca, verify-full, dengan CA custom opsional dari konfigurasi koneksi non rahasia; bila server tidak... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `IT-0022-AC3` | [AC-3](#ac-3) | connect timeout dari descriptor ditegakkan; lewat tenggat menghasilkan timeout dengan pesan aman. | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `IT-0022-AC4` | [AC-4](#ac-4) | test(context) mengembalikan hasil ternormalisasi: sukses (versi server, latency) atau DbError; tidak menyimpan apa pun (FR-CONN-02). | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `IT-0022-AC5` | [AC-5](#ac-5) | CapabilityPort.describe mendeteksi versi server dan mengembalikan capability V1 PostgreSQL: schemas true, viewEditor true, explain true, cancelQuery true, pr... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `IT-0022-AC7` | [AC-7](#ac-7) | infrastruktur cancel: setiap sesi query menyimpan backend_pid; cancel(handle) mencoba API cancel Bun.sql bila terbukti bekerja, dan selalu punya jalur pg_can... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |
| `IT-0022-AC8` | [AC-8](#ac-8) | suite test kontrak generik (spec 0021) lulus terhadap provider ini pada server PostgreSQL nyata dua versi mayor yang didukung (yang terbaru dan satu sebelumn... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

## Test tambahan

### Contract test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `CT-0022-AC5` | [AC-5](#ac-5) | CapabilityPort.describe mendeteksi versi server dan mengembalikan capability V1 PostgreSQL: schemas true, viewEditor true, explain true, cancelQuery true, pr... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `CT-0022-AC8` | [AC-8](#ac-8) | suite test kontrak generik (spec 0021) lulus terhadap provider ini pada server PostgreSQL nyata dua versi mayor yang didukung (yang terbaru dan satu sebelumn... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |
| `CT-0022-AC9` | [AC-9](#ac-9) | tidak ada import dari database-mysql atau sebaliknya; SQL dan semantik PostgreSQL tidak bocor keluar package (boundary check). | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-9 terpenuhi. |

### E2E

Tidak ada e2e yang diwajibkan oleh acceptance criteria saat ini.

### Security

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `SEC-0022-AC2` | [AC-2](#ac-2) | mode TLS didukung dan ditegakkan: disable, require, verify-ca, verify-full, dengan CA custom opsional dari konfigurasi koneksi non rahasia; bila server tidak... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `SEC-0022-AC4` | [AC-4](#ac-4) | test(context) mengembalikan hasil ternormalisasi: sukses (versi server, latency) atau DbError; tidak menyimpan apa pun (FR-CONN-02). | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `SEC-0022-AC6` | [AC-6](#ac-6) | pemetaan error: SQLSTATE 28xxx → auth_failed, 3D000/42P01 dan sejenis → not_found, 42501 → permission_denied, 23xxx → constraint_violation, 42601 → syntax_er... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

### Performance

Tidak ada performance yang diwajibkan oleh acceptance criteria saat ini.

### Visual dan accessibility

Tidak ada visual dan accessibility yang diwajibkan oleh acceptance criteria saat ini.

### Smoke dan operational acceptance

Tidak ada smoke dan operational yang diwajibkan oleh acceptance criteria saat ini.

### Manual atau external proof

Tidak ada manual atau external yang diwajibkan oleh acceptance criteria saat ini.

## Critical test scenarios

- Happy path: open, ping, serverInfo, close pada server test, verifikasi **AC-1**.
- TLS: server tanpa TLS plus mode `require` → `tls_failed`, bukan koneksi plaintext, verifikasi **AC-2**.
- Cancel: query `pg_sleep(60)` dibatalkan → sesi menerima 57014 → `cancelled`, verifikasi **AC-7**.
- Error: password salah → `auth_failed` tanpa secret di pesan, verifikasi **AC-6**.

## Staged, environment, dan external proof

Tidak ada staged, environment, atau external proof khusus yang sudah diidentifikasi.

## Fixture dan environment

| Area | Aturan |
|---|---|
| Data | Gunakan data sintetis atau tersanitasi. Jangan memakai credential, token, atau data produksi nyata. |
| Resource | Database, file, port, process, dan container harus disposable serta memiliki cleanup deterministik. |
| Version | Pin versi environment yang dibuktikan. Jangan memakai label dinamis seperti `latest` sebagai bukti acceptance. |
| Root command | Instalasi dan command test selalu dimulai dari akar repo dan satu `package.json`. |

## Exit criteria test

- Setiap AC memiliki test ID atau jalur proof yang eksplisit pada [verify.md](verify.md).
- Unit dan integration test yang relevan diimplementasikan, lulus, dan dapat diulang dari checkout bersih.
- Test yang tidak relevan ditandai `n/a` dengan alasan yang tetap benar setelah implementasi.
- External proof tidak boleh diganti local smoke test. Staged proof tidak boleh ditutup sebelum dependency yang disebut tersedia.
- Tidak ada test yang dianggap lulus hanya karena file atau placeholder tersedia.
