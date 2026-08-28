# Test dan acceptance criteria 0024. Provider MySQL: koneksi, TLS, capability, error mapping

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Belum dijalankan
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0024.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

`open(context)` membuka koneksi Bun.sql MySQL; `connection_id()` sesi tercatat pada handle; `close` bersih; connect timeout ditegakkan.

### AC-2

mode TLS `disable`, `require`, `verify-ca`, `verify-full` didukung dengan CA custom opsional; permintaan yang tidak terpenuhi gagal `tls_failed` tanpa downgrade (FR-CONN-05).

### AC-3

`test(context)` ternormalisasi: sukses (versi, latency) atau `DbError`; tanpa penyimpanan.

### AC-4

`describe` mengembalikan capability V1 MySQL: `schemas` false dengan reason "MySQL memakai database sebagai schema", `viewEditor` true, `explain` true, `cancelQuery` true, `principals` true, `grants` true, `tableComments` true, `generatedColumns` true, `identityColumns` true (auto_increment), `checkConstraints` sesuai versi (ditegakkan mulai 8.0.16; sebelumnya false dengan reason), kunci V2 (`events`, `binlog`, `optimize`, `repair`) false; `backupRestore`/`importExport` false sementara dengan reason sampai spec terkait.

### AC-5

pemetaan error: 1045 → `auth_failed`, 1044/1142 → `permission_denied`, 1049/1146 → `not_found`, 1062/1451/1452/3819 → `constraint_violation`, 1064 → `syntax_error` (posisi diekstrak dari pesan bila ada), 1317/3024 → `cancelled`/`timeout` sesuai konteks, kegagalan jaringan → `connection_failed`; pesan tanpa secret.

### AC-6

cancel: `cancel(handle)` menjalankan `KILL QUERY <connection_id>` lewat koneksi kontrol; sesi yang dibatalkan menerima error yang dipetakan `cancelled`; perilaku terbukti test integrasi.

### AC-7

suite kontrak generik (spec 0021) lulus pada MySQL nyata dua versi yang didukung (8.0 dan yang terbaru), di `tests/integration/mysql/`.

### AC-8

boundary: tanpa impor dari `database-postgresql`; semantik MySQL tidak bocor keluar package.

## Matriks cakupan

| AC | Unit | Integration | Contract | E2E | Security | Performance | Visual | Smoke | Manual atau external |
|---|---|---|---|---|---|---|---|---|---|
| [AC-1](#ac-1) | n/a | `IT-0024-AC1` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-2](#ac-2) | n/a | `IT-0024-AC2` | n/a | n/a | `SEC-0024-AC2` | n/a | n/a | n/a | n/a |
| [AC-3](#ac-3) | n/a | `IT-0024-AC3` | n/a | n/a | `SEC-0024-AC3` | n/a | n/a | n/a | n/a |
| [AC-4](#ac-4) | n/a | `IT-0024-AC4` | `CT-0024-AC4` | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-5](#ac-5) | `UT-0024-AC5` | n/a | n/a | n/a | `SEC-0024-AC5` | n/a | n/a | n/a | n/a |
| [AC-6](#ac-6) | n/a | `IT-0024-AC6` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-7](#ac-7) | n/a | `IT-0024-AC7` | `CT-0024-AC7` | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-8](#ac-8) | n/a | n/a | `CT-0024-AC8` | n/a | n/a | n/a | n/a | n/a | n/a |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `UT-0024-AC5` | [AC-5](#ac-5) | pemetaan error: 1045 → auth_failed, 1044/1142 → permission_denied, 1049/1146 → not_found, 1062/1451/1452/3819 → constraint_violation, 1064 → syntax_error (po... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |

## Integration test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `IT-0024-AC1` | [AC-1](#ac-1) | open(context) membuka koneksi Bun.sql MySQL; connection_id() sesi tercatat pada handle; close bersih; connect timeout ditegakkan. | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `IT-0024-AC2` | [AC-2](#ac-2) | mode TLS disable, require, verify-ca, verify-full didukung dengan CA custom opsional; permintaan yang tidak terpenuhi gagal tls_failed tanpa downgrade (FR-CO... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `IT-0024-AC3` | [AC-3](#ac-3) | test(context) ternormalisasi: sukses (versi, latency) atau DbError; tanpa penyimpanan. | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `IT-0024-AC4` | [AC-4](#ac-4) | describe mengembalikan capability V1 MySQL: schemas false dengan reason "MySQL memakai database sebagai schema", viewEditor true, explain true, cancelQuery t... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `IT-0024-AC6` | [AC-6](#ac-6) | cancel: cancel(handle) menjalankan KILL QUERY <connection_id> lewat koneksi kontrol; sesi yang dibatalkan menerima error yang dipetakan cancelled; perilaku t... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `IT-0024-AC7` | [AC-7](#ac-7) | suite kontrak generik (spec 0021) lulus pada MySQL nyata dua versi yang didukung (8.0 dan yang terbaru), di tests/integration/mysql/. | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

## Test tambahan

### Contract test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `CT-0024-AC4` | [AC-4](#ac-4) | describe mengembalikan capability V1 MySQL: schemas false dengan reason "MySQL memakai database sebagai schema", viewEditor true, explain true, cancelQuery t... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `CT-0024-AC7` | [AC-7](#ac-7) | suite kontrak generik (spec 0021) lulus pada MySQL nyata dua versi yang didukung (8.0 dan yang terbaru), di tests/integration/mysql/. | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |
| `CT-0024-AC8` | [AC-8](#ac-8) | boundary: tanpa impor dari database-postgresql; semantik MySQL tidak bocor keluar package. | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

### E2E

Tidak ada e2e yang diwajibkan oleh acceptance criteria saat ini.

### Security

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `SEC-0024-AC2` | [AC-2](#ac-2) | mode TLS disable, require, verify-ca, verify-full didukung dengan CA custom opsional; permintaan yang tidak terpenuhi gagal tls_failed tanpa downgrade (FR-CO... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `SEC-0024-AC3` | [AC-3](#ac-3) | test(context) ternormalisasi: sukses (versi, latency) atau DbError; tanpa penyimpanan. | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `SEC-0024-AC5` | [AC-5](#ac-5) | pemetaan error: 1045 → auth_failed, 1044/1142 → permission_denied, 1049/1146 → not_found, 1062/1451/1452/3819 → constraint_violation, 1064 → syntax_error (po... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |

### Performance

Tidak ada performance yang diwajibkan oleh acceptance criteria saat ini.

### Visual dan accessibility

Tidak ada visual dan accessibility yang diwajibkan oleh acceptance criteria saat ini.

### Smoke dan operational acceptance

Tidak ada smoke dan operational yang diwajibkan oleh acceptance criteria saat ini.

### Manual atau external proof

Tidak ada manual atau external yang diwajibkan oleh acceptance criteria saat ini.

## Critical test scenarios

- Happy path: open, ping, serverInfo, close, verifikasi **AC-1**.
- TLS: mode `require` pada server tanpa TLS → `tls_failed`, verifikasi **AC-2**.
- Cancel: `SELECT SLEEP(60)` dibatalkan → `cancelled`, verifikasi **AC-6**.
- Error: password salah → `auth_failed` bersih, verifikasi **AC-5**.

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
