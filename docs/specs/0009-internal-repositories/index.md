# 0009. Internal repositories

**Date**: 2026-08-28
**Status**: Proposed
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini membangun lapisan akses data internal: entity dan port di `packages/internal-domain`, implementasi repository SQLite di `packages/internal-sqlite`, mapper baris ke entity, dan unit of work berbasis transaksi. Setiap tabel dari spec 0008 mendapat repository dengan operasi yang dibutuhkan V1, terbukti lewat integration test tanpa membutuhkan server database target.

## Context

Arah dependency yang dikunci memisahkan model dari persistence: `internal-domain` berisi entity, value object, dan port tanpa tahu SQLite; `internal-sqlite` mengimplementasikan port tanpa berisi aturan bisnis (struktur.md bagian 3 dan 5). FR-INT-02 menuntut bukti integration test bahwa data tersimpan dan dipulihkan. Repository di sini adalah fondasi use case auth, koneksi, workspace, history, settings, dan audit; bentuk port yang salah akan menjalar ke semuanya.

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0008.

## Requirements

**User stories**:
- Sebagai developer use case, saya ingin port repository yang bertipe dan sempit supaya use case bisa diuji dengan fake tanpa SQLite.
- Sebagai developer, saya ingin operasi multi tabel berjalan atomik lewat unit of work.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): `internal-domain` mendefinisikan entity dan value object untuk user, session, connection (descriptor), server group, workspace, query history entry, saved query, setting, preference, audit event, tanpa import SQLite atau driver apa pun (ditegakkan boundary check).
- [**AC-2**](test.md#ac-2): port repository terdefinisi per agregat dengan operasi minimum V1: UserRepository (create, findByUsername, findById, list, update, setActive), SessionRepository (create, findByTokenHash, touch, revoke, revokeAllForUser, deleteExpired), ConnectionRepository (CRUD, listByOwner, listAll), CredentialRepository (upsert, get, delete per connection), ServerGroupRepository (CRUD per owner), WorkspaceRepository (get, upsert per user), QueryHistoryRepository (append, listByUser dengan filter dan pagination, deleteByUser, enforceRetention), SavedQueryRepository (CRUD per user), SettingsRepository (get, set, list), PreferencesRepository (get, set, listByUser), AuditRepository (append, query dengan filter dan pagination; tanpa update dan delete).
- [**AC-3**](test.md#ac-3): implementasi SQLite untuk semua port di `internal-sqlite/repositories/` dengan SQL parameterized dan mapper eksplisit; tidak ada string interpolation nilai.
- [**AC-4**](test.md#ac-4): unit of work menjalankan beberapa operasi repository dalam satu transaksi; kegagalan di tengah membatalkan semuanya.
- [**AC-5**](test.md#ac-5): `QueryHistoryRepository.enforceRetention(userId, max)` memangkas entri terlama melebihi batas; batas default 1000 dibaca dari settings.
- [**AC-6**](test.md#ac-6): `AuditRepository` secara tipe tidak menawarkan update atau delete; percobaan SQL langsung bukan lewat port adalah pelanggaran review.
- [**AC-7**](test.md#ac-7): integration test per repository membuktikan simpan dan pulih round trip, constraint unik (username, label koneksi per owner), cascade delete credential saat koneksi dihapus, dan pagination history, tanpa server eksternal (FR-INT-02).
- [**AC-8**](test.md#ac-8): fake in memory untuk setiap port tersedia di `packages/testkit` untuk dipakai unit test use case.

## Options considered

### Option 1: Repository per agregat dengan SQL tulisan tangan (dipilih)

**Pros**:
- Sesuai struktur.md; SQL kecil dan bisa dibaca; tanpa ORM di jalur binary.

**Cons**:
- Boilerplate mapper per tabel.

### Option 2: ORM ringan (Drizzle)

**Pros**:
- Skema bertipe dan query builder mengurangi boilerplate.

**Cons**:
- Menduplikasi definisi skema yang sudah hidup di migrasi; menambah dependency dan konsep pada lapisan yang justru ingin bodoh sederhana; migrasi kami sudah tulisan tangan.

## Decision

**Chosen option**: Option 1: repository per agregat dengan SQL tulisan tangan dan mapper eksplisit.

Port di `internal-domain/ports/repositories/`, unit of work di `internal-domain/ports/unit-of-work.ts`, implementasi di `internal-sqlite/repositories/`, fake di `testkit` (basis: struktur.md pohon internal-domain dan internal-sqlite; prinsip ORM untuk CRUD dan SQL untuk kendali di lapisan tipis ini jatuh ke SQL karena skema kecil dan stabil).

## Rationale

Sebelas tabel dengan operasi sempit tidak butuh ORM; yang dibutuhkan adalah port yang benar bentuknya supaya use case (auth, connection manager, workspace) bisa diuji cepat dengan fake, dan supaya aturan seperti append only audit hidup di tipe, bukan disiplin. Retention history ditaruh di repository karena murni urusan data, sementara kebijakan angkanya milik settings.

## Feature design

**Data model sketch**: memakai skema spec 0008 apa adanya; tidak menambah tabel.

**API surface**: tidak ada endpoint; permukaan berupa port TypeScript.

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| create entity | id | generator UUIDv7 kernel, dipanggil use case, bukan database |
| create/update | created_at, updated_at | jam sistem lewat `kernel/time` (bisa di fake di test) |
| enforceRetention | batas maksimum | settings key `history.maxEntriesPerUser`, default 1000 |

**Key invariants**:
- Semua SQL parameterized; mapper tidak pernah menyalin kolom secret ke entity descriptor (credential punya port terpisah).
- AuditRepository append only di tingkat tipe (AC-6).
- Entity `Connection` (descriptor) tidak pernah memuat ciphertext; `CredentialRepository` mengembalikan tipe terpisah `EncryptedCredential`.

**Security model**: repository tidak menegakkan authorization (itu milik use case dan policies); tapi pemisahan descriptor melawan kebocoran secret secara struktural (FR-INT-03).

**Configuration required**: tidak ada baru.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. Definisikan entity, value object, dan port di `internal-domain` (termasuk tipe `EncryptedCredential` terpisah), memenuhi **AC-1**, **AC-2**.
2. Implementasikan repository SQLite plus mapper untuk users, sessions, server_groups, connections, connection_credentials, memenuhi **AC-3**.
3. Implementasikan repository workspaces, query_history (dengan retention), saved_queries, settings, preferences, audit_logs, memenuhi **AC-3**, **AC-5**, **AC-6**.
4. Bangun unit of work di atas helper transaksi spec 0008, memenuhi **AC-4**.
5. Tulis fake in memory di `testkit/fakes/`, memenuhi **AC-8**.
6. Integration test lengkap di `tests/integration/internal-sqlite/`, memenuhi **AC-7**.

## Consequences

**Positive**:
- Use case di semua spec berikutnya bisa lahir dengan unit test cepat memakai fake; bukti FR-INT-02 selesai sekali di sini.

**Negative / tradeoffs**:
- Boilerplate mapper; diterima demi kejelasan dan nol dependency.

**Neutral**:
- Penambahan kolom di masa depan berarti migrasi baru plus perubahan mapper; checksum migrasi menjaga urutannya.

## Follow-up

- [ ] Saat use case pertama dibangun (spec 0016), nilai default settings (`history.maxEntriesPerUser`) di seed lewat migrasi atau boot.

## References

**Project sources**:
- v1-feature-specification.md FR-INT-02, FR-INT-03; struktur.md bagian 3 (lima package platform internal) dan bagian 5 (arah dependency).
- Spec 0008 (skema), data model terkonfirmasi sesi desain 2026-08-28.

**Practices & standards**:
- Ports and adapters; append only ditegakkan di tipe; fake untuk test cepat.

**Links**: tidak ada yang diverifikasi untuk spec ini.
