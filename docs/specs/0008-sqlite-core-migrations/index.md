# 0008. SQLite core dan migration runner

**Date**: 2026-08-28
**Status**: In Progress
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini membangun penyimpanan internal Myadmin: pembukaan database SQLite lewat bun:sqlite dengan pragma yang benar, runner migrasi bernomor yang idempotent, dan migrasi awal berisi seluruh skema sebelas tabel yang sudah dikonfirmasi. Setelah spec ini, `myadmin serve` dan `myadmin migrate` membawa database internal ke skema mutakhir secara aman di setiap start.

## Context

Semua state internal (user, sesi, koneksi, credential terenkripsi, workspace, history, audit) hidup di satu file SQLite di data directory (FR-INT-01, FR-INT-02). Migrasi harus idempotent dan dapat diverifikasi doctor (NFR-02), dan startup harus gagal jelas bila storage tidak bisa dipakai. Data model penuh sudah dikonfirmasi pemilik proyek pada sesi desain 2026-08-28; spec ini memuat DDL nya sebagai target.

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0006 (data directory).

## Requirements

**User stories**:
- Sebagai operator, saya ingin upgrade versi Myadmin memigrasi data internal otomatis dan aman.
- Sebagai developer, saya ingin transaksi dan foreign key berperilaku benar tanpa disetel ulang di tiap tempat.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): database dibuka dari `<data-dir>/myadmin.db` dengan pragma: `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout` 5000 ms, `synchronous=NORMAL`; pragma diterapkan di satu tempat (`database/pragmas.ts`).
- [**AC-2**](test.md#ac-2): runner migrasi menjalankan migrasi bernomor berurutan dari `migrations/`, masing masing dalam transaksi, mencatat ke tabel `migrations` (version, name, applied_at, checksum); menjalankan ulang tanpa migrasi baru adalah no op.
- [**AC-3**](test.md#ac-3): checksum migrasi yang sudah diterapkan diverifikasi; file migrasi lama yang berubah membuat start gagal dengan pesan jelas (skema riwayat tidak boleh ditulis ulang).
- [**AC-4**](test.md#ac-4): migrasi `0001-initial` membuat sebelas tabel sesuai data model terkonfirmasi (lihat Feature design) lengkap dengan primary key, foreign key, unique constraint, dan index yang disebutkan.
- [**AC-5**](test.md#ac-5): kegagalan membuka atau memigrasi database menghentikan boot dengan exit code bukan nol dan pesan aman (NFR-02); database tidak tertinggal setengah termigrasi (transaksi per migrasi).
- [**AC-6**](test.md#ac-6): helper transaksi tersedia (`database/transaction.ts`) dengan dukungan nested lewat savepoint, dipakai repositories (spec 0009).
- [**AC-7**](test.md#ac-7): shutdown rapi menjalankan checkpoint WAL supaya file db aman disalin saat proses mati.
- [**AC-8**](test.md#ac-8): integration test membuktikan: migrasi dari kosong, idempotensi, checksum mismatch gagal, foreign key ditegakkan.

## Options considered

### Option 1: Runner migrasi tulisan sendiri, migrasi sebagai file TypeScript (dipilih)

**Pros**:
- Sesuai struktur.md (pohon `migrations/0001-initial.ts`, `migration-runner.ts`); tanpa dependency; migrasi bisa berisi transformasi data, bukan hanya DDL.

**Cons**:
- Fitur seperti down migration dan diff otomatis harus dibuat sendiri bila kelak dibutuhkan (V1 hanya maju, tanpa down).

### Option 2: Library migrasi pihak ketiga

**Pros**:
- Perilaku teruji komunitas.

**Cons**:
- Kebanyakan berorientasi Node/ORM, bukan bun:sqlite; menambah dependency pada jalur boot paling kritis.

## Decision

**Chosen option**: Option 1: runner sendiri, maju saja (forward only), dengan checksum.

bun:sqlite sebagai driver (basis: bawaan Bun, tanpa dependency native tambahan pada binary), WAL plus foreign_keys sebagai pragma wajib, migrasi TypeScript bernomor dengan tabel riwayat dan checksum.

**Implementation skills**: `bun-sqlite` (`secondsky/claude-skills`, `.agents/skills/bun-sqlite/`) untuk pola bun:sqlite.

## Rationale

Jalur boot adalah tempat paling mahal untuk dependency yang salah; bun:sqlite bawaan dan runner kecil milik sendiri membuat perilaku bisa dipahami penuh. Forward only dipilih karena target pengguna adalah operator binary, bukan tim yang rollback skema; pemulihan versi dilakukan lewat backup file db (didokumentasikan di spec 0055). Checksum menutup kegagalan senyap paling umum pada migrasi file: mengedit migrasi lama.

## Feature design

**Data model sketch** (target migrasi `0001-initial`; tipe SQLite: TEXT, INTEGER, BLOB; waktu sebagai TEXT ISO 8601 UTC; id sebagai TEXT UUIDv7):

| Tabel | Kolom | Catatan |
|---|---|---|
| users | id PK, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK in ('admin','user'), is_active INTEGER NOT NULL DEFAULT 1, created_at, updated_at | |
| sessions | id PK, user_id FK→users NOT NULL, token_hash TEXT UNIQUE NOT NULL, created_at, expires_at NOT NULL, last_seen_at, revoked_at NULL | index (user_id), index (expires_at) |
| server_groups | id PK, owner_user_id FK→users NOT NULL, name TEXT NOT NULL, color TEXT NULL, sort_order INTEGER NOT NULL DEFAULT 0 | unique (owner_user_id, name) |
| connections | id PK, owner_user_id FK→users NOT NULL, group_id FK→server_groups NULL, label TEXT NOT NULL, engine TEXT NOT NULL CHECK in ('postgresql','mysql'), host TEXT NOT NULL, port INTEGER NOT NULL, initial_database TEXT NULL, username TEXT NOT NULL, ssl_mode TEXT NOT NULL, tls_options TEXT NULL (JSON non rahasia), connect_timeout_ms INTEGER NOT NULL, tag TEXT NULL, color TEXT NULL, created_at, updated_at | unique (owner_user_id, label); index (owner_user_id) |
| connection_credentials | connection_id PK FK→connections ON DELETE CASCADE, ciphertext BLOB NOT NULL, nonce BLOB NOT NULL, algorithm TEXT NOT NULL, key_id TEXT NOT NULL, created_at, updated_at | hanya ciphertext dan metadata enkripsi (FR-INT-03) |
| workspaces | id PK, user_id FK→users UNIQUE NOT NULL, state TEXT NOT NULL (JSON), updated_at | satu workspace per user |
| query_history | id PK, user_id FK→users NOT NULL, connection_id FK→connections NULL ON DELETE SET NULL, database TEXT NULL, schema TEXT NULL, sql_text TEXT NOT NULL, status TEXT NOT NULL, duration_ms INTEGER NULL, row_count INTEGER NULL, executed_at NOT NULL | index (user_id, executed_at) |
| saved_queries | id PK, user_id FK→users NOT NULL, name TEXT NOT NULL, sql_text TEXT NOT NULL, connection_id NULL, database TEXT NULL, created_at, updated_at | unique (user_id, name) |
| settings | key TEXT PK, value TEXT NOT NULL (JSON), updated_at | scope aplikasi |
| preferences | user_id FK→users, key TEXT, value TEXT NOT NULL (JSON), updated_at, PK (user_id, key) | per user |
| audit_logs | id PK, occurred_at NOT NULL, actor_user_id FK→users NULL, action TEXT NOT NULL, target_type TEXT NULL, target_ref TEXT NULL, connection_id TEXT NULL, result TEXT NOT NULL, correlation_id TEXT NULL, details TEXT NULL (JSON tersensor) | index (occurred_at), index (actor_user_id); append only |

**API surface**: tidak ada endpoint; permukaan berupa modul database.

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| migrasi | versi skema | tabel `migrations`, nomor file migrasi |
| pembukaan db | path file | data directory (spec 0006) |
| id baris baru | UUIDv7 | generator di `packages/kernel/ids` (waktu monotonic, bisa diurutkan) |

**Key invariants**:
- `internal-sqlite` tidak berisi aturan authorization, enkripsi, atau logic provider (struktur.md); ia hanya persistence.
- Tidak ada kolom berisi plaintext credential; satu satunya tempat secret adalah `connection_credentials.ciphertext`.
- Riwayat migrasi immutable (checksum, AC-3).

**Security model**: file db dilindungi permission direktori data; enkripsi kolom credential dimiliki spec 0011. Error storage tidak memuat isi baris.

**Configuration required**: tidak ada baru.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. Bangun `database/connection.ts`, `pragmas.ts`, `transaction.ts`, `health.ts` di `packages/internal-sqlite`, memenuhi **AC-1**, **AC-6**.
2. Bangun `migration-runner.ts` (urutan, transaksi, tabel riwayat, checksum), memenuhi **AC-2**, **AC-3**, **AC-5**.
3. Tulis migrasi `0001-initial.ts` berisi DDL sebelas tabel plus index, memenuhi **AC-4**.
4. Tambah generator UUIDv7 di `packages/kernel/ids` beserta test keurutan.
5. Sambungkan runner ke boot `serve` dan perintah `migrate` (spec 0006, 0007), plus checkpoint WAL saat shutdown, memenuhi **AC-5**, **AC-7**.
6. Integration test di `tests/integration/internal-sqlite/`, memenuhi **AC-8**.

## Consequences

**Positive**:
- Seluruh state internal punya rumah final dan termigrasi otomatis; repositories (spec 0009) tinggal menulis SQL ke skema pasti.

**Negative / tradeoffs**:
- Forward only berarti kesalahan skema diperbaiki dengan migrasi baru, tidak bisa mundur; operator mengandalkan backup file.
- WAL menambah file `-wal`/`-shm` di samping db; dokumentasi operator harus menyebutnya.

**Neutral**:
- UUIDv7 sebagai id membuat urutan insert kira kira kronologis, membantu audit dan history.

## Follow-up

- [ ] Dokumentasikan prosedur backup file internal (db plus WAL) di dokumentasi operator (spec 0055).

## References

**Project sources**:
- v1-feature-specification.md FR-INT-01, FR-INT-02, FR-INT-03, NFR-02, bagian 8.1 (daftar tabel dan pemisahan descriptor/secret); struktur.md pohon internal-sqlite; data model terkonfirmasi sesi desain 2026-08-28.

**Practices & standards**:
- WAL untuk pembaca dan penulis bersamaan; foreign key eksplisit; migrasi immutable dengan checksum.

**Links**: tidak ada yang diverifikasi untuk spec ini.
