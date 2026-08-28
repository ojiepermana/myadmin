# Test dan acceptance criteria 0030. Workspace persistence

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Belum dijalankan
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0030.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

`GET /workspace` mengembalikan state tersimpan milik user (atau default kosong); `PUT /workspace` menyimpan seluruh state; keduanya sesuai kontrak dengan schema state yang dinyatakan.

### AC-2

state berbentuk `{ version: 1, tabs: TabDescriptor[], activeTabId, panels { sidebarWidth, bottomHeight, sidebarCollapsed }, activeConnectionId? }`; `TabDescriptor.context` wajib serializable dan memuat referensi eksplisit (connectionId, database, schema bila ada) sesuai FR-EXP-04.

### AC-3

klien menyimpan dengan debounce (2 detik setelah perubahan terakhir, plus flush saat beforeunload) supaya drag panel tidak membanjiri server.

### AC-4

pemulihan saat login: tab yang koneksinya sudah terhapus atau bukan milik user dibuang saat restore dengan pemberitahuan ringan ("2 tab dilewati karena koneksinya sudah tidak ada"); tab yang tersisa dipulihkan dalam keadaan tidak tersambung (koneksi tetap connect eksplisit, spec 0027).

### AC-5

field `version` memungkinkan migrasi state di masa depan; state dengan versi tak dikenal diperlakukan sebagai kosong dengan pemberitahuan, tanpa merusak sesi.

### AC-6

state tidak pernah memuat data sensitif: tanpa hasil query, tanpa isi editor yang belum disimpan melebihi draft SQL per tab (draft SQL disertakan, itu milik pengguna dan berguna), tanpa credential; validasi server menolak state melebihi 256 KB.

### AC-7

e2e: buka tab query dengan konteks, atur panel, logout, login → susunan pulih; hapus koneksi lalu login → tab terkait dilewati dengan pemberitahuan.

## Matriks cakupan

| AC | Unit | Integration | Contract | E2E | Security | Performance | Visual | Smoke | Manual atau external |
|---|---|---|---|---|---|---|---|---|---|
| [AC-1](#ac-1) | n/a | `IT-0030-AC1` | `CT-0030-AC1` | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-2](#ac-2) | `UT-0030-AC2` | n/a | `CT-0030-AC2` | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-3](#ac-3) | `UT-0030-AC3` | n/a | n/a | `E2E-0030-AC3` | n/a | n/a | n/a | n/a | n/a |
| [AC-4](#ac-4) | n/a | n/a | n/a | `E2E-0030-AC4` | `SEC-0030-AC4` | n/a | n/a | n/a | n/a |
| [AC-5](#ac-5) | `UT-0030-AC5` | n/a | n/a | `E2E-0030-AC5` | n/a | n/a | n/a | n/a | n/a |
| [AC-6](#ac-6) | `UT-0030-AC6` | n/a | n/a | n/a | `SEC-0030-AC6` | n/a | n/a | n/a | n/a |
| [AC-7](#ac-7) | n/a | n/a | n/a | `E2E-0030-AC7` | n/a | n/a | n/a | n/a | n/a |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `UT-0030-AC2` | [AC-2](#ac-2) | state berbentuk { version: 1, tabs: TabDescriptor[], activeTabId, panels { sidebarWidth, bottomHeight, sidebarCollapsed }, activeConnectionId? }; TabDescript... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `UT-0030-AC3` | [AC-3](#ac-3) | klien menyimpan dengan debounce (2 detik setelah perubahan terakhir, plus flush saat beforeunload) supaya drag panel tidak membanjiri server. | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `UT-0030-AC5` | [AC-5](#ac-5) | field version memungkinkan migrasi state di masa depan; state dengan versi tak dikenal diperlakukan sebagai kosong dengan pemberitahuan, tanpa merusak sesi. | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `UT-0030-AC6` | [AC-6](#ac-6) | state tidak pernah memuat data sensitif: tanpa hasil query, tanpa isi editor yang belum disimpan melebihi draft SQL per tab (draft SQL disertakan, itu milik... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

## Integration test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `IT-0030-AC1` | [AC-1](#ac-1) | GET /workspace mengembalikan state tersimpan milik user (atau default kosong); PUT /workspace menyimpan seluruh state; keduanya sesuai kontrak dengan schema... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |

## Test tambahan

### Contract test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `CT-0030-AC1` | [AC-1](#ac-1) | GET /workspace mengembalikan state tersimpan milik user (atau default kosong); PUT /workspace menyimpan seluruh state; keduanya sesuai kontrak dengan schema... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `CT-0030-AC2` | [AC-2](#ac-2) | state berbentuk { version: 1, tabs: TabDescriptor[], activeTabId, panels { sidebarWidth, bottomHeight, sidebarCollapsed }, activeConnectionId? }; TabDescript... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |

### E2E

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `E2E-0030-AC3` | [AC-3](#ac-3) | klien menyimpan dengan debounce (2 detik setelah perubahan terakhir, plus flush saat beforeunload) supaya drag panel tidak membanjiri server. | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `E2E-0030-AC4` | [AC-4](#ac-4) | pemulihan saat login: tab yang koneksinya sudah terhapus atau bukan milik user dibuang saat restore dengan pemberitahuan ringan ("2 tab dilewati karena konek... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `E2E-0030-AC5` | [AC-5](#ac-5) | field version memungkinkan migrasi state di masa depan; state dengan versi tak dikenal diperlakukan sebagai kosong dengan pemberitahuan, tanpa merusak sesi. | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `E2E-0030-AC7` | [AC-7](#ac-7) | e2e: buka tab query dengan konteks, atur panel, logout, login → susunan pulih; hapus koneksi lalu login → tab terkait dilewati dengan pemberitahuan. | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

### Security

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `SEC-0030-AC4` | [AC-4](#ac-4) | pemulihan saat login: tab yang koneksinya sudah terhapus atau bukan milik user dibuang saat restore dengan pemberitahuan ringan ("2 tab dilewati karena konek... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `SEC-0030-AC6` | [AC-6](#ac-6) | state tidak pernah memuat data sensitif: tanpa hasil query, tanpa isi editor yang belum disimpan melebihi draft SQL per tab (draft SQL disertakan, itu milik... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

### Performance

Tidak ada performance yang diwajibkan oleh acceptance criteria saat ini.

### Visual dan accessibility

Tidak ada visual dan accessibility yang diwajibkan oleh acceptance criteria saat ini.

### Smoke dan operational acceptance

Tidak ada smoke dan operational yang diwajibkan oleh acceptance criteria saat ini.

### Manual atau external proof

Tidak ada manual atau external yang diwajibkan oleh acceptance criteria saat ini.

## Critical test scenarios

- Happy path: susun, logout, login, pulih, verifikasi **AC-1**, **AC-7**.
- Referensi mati: koneksi dihapus → tab dilewati dengan pemberitahuan, verifikasi **AC-4**.
- Batas: state 300 KB ditolak 422, verifikasi **AC-6**.

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
