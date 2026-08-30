# 0021. Kontrak database-core, capability model, dan registry

**Date**: 2026-08-28
**Status**: In Progress
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md) | [Behavioral port contracts](port-contracts.md)

## Summary

Spec ini mendefinisikan `packages/database-core`: kumpulan port kecil agnostik engine yang menjadi kontrak antara aplikasi dan provider PostgreSQL atau MySQL, model capability yang menentukan apa yang UI boleh tampilkan, connection context yang membawa credential sesaat, registry pemilih provider, dan model error ternormalisasi. Termasuk kontrak view yang ditambahkan karena keputusan CRUD GUI view V1. Tidak ada satu baris SQL di package ini.

## Context

FR-PROV-01 sampai FR-PROV-04 mengunci: port kecil per domain tanpa impor driver, provider terpisah tanpa saling impor, registry memilih adapter berdasar tipe koneksi, dan API mengekspos engine, version, capability per koneksi sehingga UI tidak pernah bercabang berdasarkan nama engine. Struktur.md menyebut daftar kontrak: backup-restore, connection, data, database, import-export, metadata, monitoring, provider, query, schema, security, table. Keputusan sesi desain menambah satu: kontrak view (CRUD GUI view V1). Bentuk persis kontrak inilah keputusan spec ini; kesalahan bentuk di sini paling mahal diperbaiki nanti.

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0001. Konsumen pertama: spec 0022 dan 0024.

## Requirements

**User stories**:

- Sebagai developer fitur, saya ingin memanggil operasi database lewat kontrak yang sama untuk PostgreSQL dan MySQL.
- Sebagai developer provider, saya ingin kontrak yang jelas sehingga implementasi engine bisa dikerjakan terpisah.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): port terdefinisi per domain sebagai interface TypeScript kecil: `ConnectionPort` (open, close, ping, serverInfo), `CapabilityPort` (describe), `MetadataPort` (list databases/schemas/objects/columns/indexes/constraints, lazy per node, paginated), `DatabasePort`, `SchemaPort`, `TablePort`, `ViewPort` (list, getDefinition, create, alter, drop), `DataPort` (page, insert, update, delete, bulkDelete), `QueryPort` (execute, cancel, explain), `SecurityPort` (principals, createPrincipal, alterPrincipal, dropPrincipal, resetCredential, grants, grant, revoke), `ImportExportPort`, `BackupRestorePort`, `MonitoringPort` (statusInfo); tidak ada satu interface DatabaseProvider raksasa, provider adalah komposisi port (FR-PROV-01, struktur.md).
- [**AC-2**](test.md#ac-2): `database-core` tidak mengimpor driver, HTTP, SQLite, Angular, atau provider konkret; ditegakkan boundary check.
- [**AC-3**](test.md#ac-3): model capability: `{ engine, version, capabilities: Record<CapabilityKey, boolean>, reasons?: Record<CapabilityKey, string> }` dengan `CapabilityKey` terdaftar tertutup untuk V1: `schemas`, `viewEditor`, `explain`, `cancelQuery`, `backupRestore`, `importExport`, `principals`, `grants`, `tableComments`, `generatedColumns`, `identityColumns`, `checkConstraints`, plus kunci V2 yang sudah dinyatakan false (`materializedViews`, `vacuum`, `rowLevelSecurity`, `events`, `binlog`); bentuk cocok dengan schema kontrak API (spec 0003).
- [**AC-4**](test.md#ac-4): `ConnectionContext` membawa descriptor koneksi plus credential plaintext berumur sesaat dari vault; tipe nya tidak serializable (tidak lolos JSON.stringify dengan nilai rahasia: field secret sebagai getter non enumerable) sebagai pertahanan struktural terhadap kebocoran (FR-INT-04).
- [**AC-5**](test.md#ac-5): `ProviderRegistry.get(engine)` mengembalikan provider terdaftar; engine tidak dikenal menghasilkan error ternormalisasi; registrasi terjadi di composition root server, bukan di core (FR-PROV-03).
- [**AC-6**](test.md#ac-6): model error ternormalisasi `DbError { category, message, position?, sqlState?, cause tersembunyi }` dengan kategori tertutup: `auth_failed`, `connection_failed`, `tls_failed`, `timeout`, `permission_denied`, `not_found`, `conflict`, `syntax_error` (dengan posisi bila ada), `constraint_violation`, `cancelled`, `unsupported`, `internal`; pesan aman tanpa secret; pemetaan detail milik provider.
- [**AC-7**](test.md#ac-7): model umum terdefinisi: identitas object (`ObjectRef { database, schema?, name, type }`), halaman data (`Page { items, cursor?, total? }`), definisi kolom, definisi index dan constraint, principal, grant; semuanya engine netral dan menjadi bahasa bersama UI, kontrak API, dan provider.
- [**AC-8**](test.md#ac-8): setiap port punya dokumentasi kontrak perilaku singkat (apa yang wajib, apa yang boleh tidak didukung dan bagaimana menyatakannya: lempar `unsupported` plus capability false).
- [**AC-9**](test.md#ac-9): test kontrak generik tersedia di package (suite yang bisa dijalankan terhadap provider mana pun) untuk perilaku dasar: describe konsisten dengan operasi yang berhasil, error ternormalisasi pada kredensial salah; dipakai spec 0022 dan 0024.

## Options considered

### Option 1: Port per domain plus registry (dipilih)

**Pros**:

- Sesuai FR-PROV-01; provider bisa mengimplementasikan sebagian dengan jujur lewat capability; test kontrak per port.

**Cons**:

- Lebih banyak file dan tipe dibanding satu interface besar.

### Option 2: Satu interface DatabaseProvider besar

**Pros**:

- Sederhana dilihat sekilas.

**Cons**:

- Dilarang eksplisit struktur.md; memaksa provider mengimplementasikan semuanya atau melempar; capability jadi tempelan.

## Decision

**Chosen option**: Option 1: komposisi port kecil, capability sebagai kontrak kejujuran, registry di composition root.

Kontrak `ViewPort` ditambahkan ke daftar struktur.md sebagai konsekuensi keputusan view CRUD GUI V1 (sesi desain 2026-08-28); capability `viewEditor` menyertainya.

## Rationale

Bentuk port kecil membuat batas dukungan tiap engine bisa dinyatakan jujur: MySQL tanpa schema tetap mengimplementasikan `MetadataPort` tanpa `SchemaPort` berpura pura. Kunci capability dibuat daftar tertutup supaya kontrak API, UI, dan provider berbicara kosakata yang sama dan compile time memeriksa kelengkapannya. `ConnectionContext` yang tidak serializable adalah pertahanan struktural: kelas bug "context ikut ter log" mati di tipe, sejalan dengan filosofi redaction berlapis (spec 0011).

## Feature design

**Data model sketch**: tidak ada tabel; tipe TypeScript murni (AC-1, AC-3, AC-6, AC-7).

**API surface**: tidak ada endpoint; kosakata tipe dipakai kontrak API mulai spec 0022.

**Value sourcing**:

| Action           | Value produced / displayed    | Source                                                   |
| ---------------- | ----------------------------- | -------------------------------------------------------- |
| describe         | engine, version, capabilities | deteksi provider terhadap server nyata (spec 0022, 0024) |
| reasons          | pesan ketidaktersediaan       | provider; kosong bila tidak relevan                      |
| DbError.position | posisi error SQL              | provider dari error driver, bila tersedia                |
| registry         | provider per engine           | komposisi di `bootstrap/database-providers.ts`           |

**Key invariants**:

- Core bebas dependency konkret (AC-2); provider tidak saling impor (ditegakkan boundary, FR-PROV-02).
- Operasi yang capability nya false wajib menghasilkan `unsupported` di server meski UI dimanipulasi (FR-PROV-04); ini kontrak perilaku port, diuji suite generik.
- Tidak ada nama engine di logic aplikasi; hanya registry yang memetakan engine ke provider.

**Security model**: `ConnectionContext` adalah satu satunya pembawa credential hidup; umurnya dibatasi pemanggil lewat pola `use` dari vault (spec 0011).

**Configuration required**: tidak ada.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. [x] Definisikan model umum (`ObjectRef`, `Page`, kolom, index, constraint, principal, grant) dan `DbError` berkategori, memenuhi **AC-6**, **AC-7**.
2. [x] Definisikan seluruh port per domain termasuk `ViewPort`, dokumentasikan kontrak perilakunya, dan daftarkan boundary check yang melarang dependency konkret dari `database-core`, memenuhi **AC-1**, **AC-2**, **AC-8**.
3. [x] Definisikan model capability dengan kunci tertutup, selaras schema kontrak API, memenuhi **AC-3**.
4. [x] Bangun `ConnectionContext` non serializable plus test kebocoran, memenuhi **AC-4**.
5. [x] Bangun `ProviderRegistry` plus error engine tak dikenal, memenuhi **AC-5**.
6. [x] Tulis suite test kontrak generik plus provider fake referensi di package, memenuhi **AC-9**.

## Consequences

**Positive**:

- Provider dan fitur bisa dibangun paralel dengan bahasa yang sama; kejujuran dukungan engine terprogram, bukan konvensi.

**Negative / tradeoffs**:

- Perubahan kontrak setelah dua provider jadi akan mahal; karena itu spec ini menuntut review paling teliti sebelum build lanjut.

**Neutral**:

- Kunci capability V2 sudah ada bernilai false, sehingga UI capability driven tidak berubah saat V2 mengaktifkannya.

## Follow-up

- [ ] Perbarui daftar kontrak di struktur.md: tambah `view.ts` (konsekuensi keputusan view V1).

## References

**Project sources**:

- v1-feature-specification.md FR-PROV-01 sampai FR-PROV-05, bagian 10 (capability rules); struktur.md packages/database-core dan aturan 4.3.
- Keputusan view CRUD GUI V1, sesi desain 2026-08-28.

**Practices & standards**:

- Ports and adapters; capability negotiation antara penyedia dan konsumen; error berkategori tertutup.

**Links**: tidak ada yang diverifikasi untuk spec ini.
