# Test dan acceptance criteria 0009. Internal repositories

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Belum dijalankan
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0009.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

`internal-domain` mendefinisikan entity dan value object untuk user, session, connection (descriptor), server group, workspace, query history entry, saved query, setting, preference, audit event, tanpa import SQLite atau driver apa pun (ditegakkan boundary check).

### AC-2

port repository terdefinisi per agregat dengan operasi minimum V1: UserRepository (create, findByUsername, findById, list, update, setActive), SessionRepository (create, findByTokenHash, touch, revoke, revokeAllForUser, deleteExpired), ConnectionRepository (CRUD, listByOwner, listAll), CredentialRepository (upsert, get, delete per connection), ServerGroupRepository (CRUD per owner), WorkspaceRepository (get, upsert per user), QueryHistoryRepository (append, listByUser dengan filter dan pagination, deleteByUser, enforceRetention), SavedQueryRepository (CRUD per user), SettingsRepository (get, set, list), PreferencesRepository (get, set, listByUser), AuditRepository (append, query dengan filter dan pagination; tanpa update dan delete).

### AC-3

implementasi SQLite untuk semua port di `internal-sqlite/repositories/` dengan SQL parameterized dan mapper eksplisit; tidak ada string interpolation nilai.

### AC-4

unit of work menjalankan beberapa operasi repository dalam satu transaksi; kegagalan di tengah membatalkan semuanya.

### AC-5

`QueryHistoryRepository.enforceRetention(userId, max)` memangkas entri terlama melebihi batas; batas default 1000 dibaca dari settings.

### AC-6

`AuditRepository` secara tipe tidak menawarkan update atau delete; percobaan SQL langsung bukan lewat port adalah pelanggaran review.

### AC-7

integration test per repository membuktikan simpan dan pulih round trip, constraint unik (username, label koneksi per owner), cascade delete credential saat koneksi dihapus, dan pagination history, tanpa server eksternal (FR-INT-02).

### AC-8

fake in memory untuk setiap port tersedia di `packages/testkit` untuk dipakai unit test use case.

## Matriks cakupan

| AC | Unit | Integration | Contract | E2E | Security | Performance | Visual | Smoke | Manual atau external |
|---|---|---|---|---|---|---|---|---|---|
| [AC-1](#ac-1) | n/a | `IT-0009-AC1` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-2](#ac-2) | n/a | n/a | `CT-0009-AC2` | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-3](#ac-3) | n/a | `IT-0009-AC3` | n/a | n/a | `SEC-0009-AC3` | n/a | n/a | n/a | n/a |
| [AC-4](#ac-4) | n/a | `IT-0009-AC4` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-5](#ac-5) | n/a | `IT-0009-AC5` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-6](#ac-6) | n/a | n/a | `CT-0009-AC6` | n/a | n/a | n/a | n/a | n/a | `MANUAL-0009-AC6` |
| [AC-7](#ac-7) | n/a | `IT-0009-AC7` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-8](#ac-8) | n/a | n/a | `CT-0009-AC8` | n/a | n/a | n/a | n/a | n/a | n/a |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

Tidak ada unit yang diwajibkan oleh acceptance criteria saat ini.

## Integration test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `IT-0009-AC1` | [AC-1](#ac-1) | internal-domain mendefinisikan entity dan value object untuk user, session, connection (descriptor), server group, workspace, query history entry, saved quer... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `IT-0009-AC3` | [AC-3](#ac-3) | implementasi SQLite untuk semua port di internal-sqlite/repositories/ dengan SQL parameterized dan mapper eksplisit; tidak ada string interpolation nilai. | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `IT-0009-AC4` | [AC-4](#ac-4) | unit of work menjalankan beberapa operasi repository dalam satu transaksi; kegagalan di tengah membatalkan semuanya. | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `IT-0009-AC5` | [AC-5](#ac-5) | QueryHistoryRepository.enforceRetention(userId, max) memangkas entri terlama melebihi batas; batas default 1000 dibaca dari settings. | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `IT-0009-AC7` | [AC-7](#ac-7) | integration test per repository membuktikan simpan dan pulih round trip, constraint unik (username, label koneksi per owner), cascade delete credential saat... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

## Test tambahan

### Contract test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `CT-0009-AC2` | [AC-2](#ac-2) | port repository terdefinisi per agregat dengan operasi minimum V1: UserRepository (create, findByUsername, findById, list, update, setActive), SessionReposit... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `CT-0009-AC6` | [AC-6](#ac-6) | AuditRepository secara tipe tidak menawarkan update atau delete; percobaan SQL langsung bukan lewat port adalah pelanggaran review. | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `CT-0009-AC8` | [AC-8](#ac-8) | fake in memory untuk setiap port tersedia di packages/testkit untuk dipakai unit test use case. | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

### E2E

Tidak ada e2e yang diwajibkan oleh acceptance criteria saat ini.

### Security

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `SEC-0009-AC3` | [AC-3](#ac-3) | implementasi SQLite untuk semua port di internal-sqlite/repositories/ dengan SQL parameterized dan mapper eksplisit; tidak ada string interpolation nilai. | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |

### Performance

Tidak ada performance yang diwajibkan oleh acceptance criteria saat ini.

### Visual dan accessibility

Tidak ada visual dan accessibility yang diwajibkan oleh acceptance criteria saat ini.

### Smoke dan operational acceptance

Tidak ada smoke dan operational yang diwajibkan oleh acceptance criteria saat ini.

### Manual atau external proof

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `MANUAL-0009-AC6` | [AC-6](#ac-6) | AuditRepository secara tipe tidak menawarkan update atau delete; percobaan SQL langsung bukan lewat port adalah pelanggaran review. | Lakukan review manusia atau kumpulkan bukti eksternal yang tidak dapat digantikan test otomatis. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

## Critical test scenarios

- Happy path: round trip semua repository, verifikasi **AC-3**, **AC-7**.
- Failure case: unit of work dengan kegagalan di operasi kedua membatalkan operasi pertama, verifikasi **AC-4**.
- Retention: 1005 entri history → enforceRetention menyisakan 1000 terbaru, verifikasi **AC-5**.

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
