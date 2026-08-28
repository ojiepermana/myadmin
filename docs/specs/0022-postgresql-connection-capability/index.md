# 0022. Provider PostgreSQL: koneksi, TLS, capability, error mapping

**Date**: 2026-08-28
**Status**: Proposed
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini membangun separuh pertama provider PostgreSQL di `packages/database-postgresql`: membuka dan menutup koneksi lewat Bun.sql, TLS dengan mode eksplisit tanpa downgrade diam diam, deteksi versi dan capability, pemetaan error SQLSTATE ke `DbError`, dan infrastruktur cancel query lewat koneksi kontrol. Metadata dan operasi lain menyusul di spec 0023 dan seterusnya.

## Context

FR-PROV-02 menempatkan semua semantik PostgreSQL di package ini. FR-CONN-05 menuntut TLS dan timeout ditegakkan tanpa downgrade diam diam. Keputusan sesi desain memilih Bun.sql sebagai driver; verifikasi lanskap 2026-08-28 mengonfirmasi Bun.sql mendukung PostgreSQL dan MySQL dan menyediakan API cancel, dengan catatan perilaku cancel dan opsi TLS granular tetap harus dibuktikan test integrasi. Jalur cadangan cancel yang pasti bekerja: koneksi kontrol kedua menjalankan `pg_cancel_backend(pid)`.

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0021. Server PostgreSQL test tersedia lewat `tests/environments/docker-compose.test.yml`.

## Requirements

**User stories**:
- Sebagai pengguna, saya ingin menguji dan membuka koneksi PostgreSQL dengan TLS yang saya minta benar benar dipakai.
- Sebagai fitur di atasnya, saya ingin error PostgreSQL tiba dalam kategori yang seragam.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): `ConnectionPort.open(context)` membuka koneksi Bun.sql dari `ConnectionContext` (host, port, database awal, user, secret, TLS, timeout); sukses menghasilkan handle sesi dengan `backend_pid` tercatat; `close` menutup bersih.
- [**AC-2**](test.md#ac-2): mode TLS didukung dan ditegakkan: `disable`, `require`, `verify-ca`, `verify-full`, dengan CA custom opsional dari konfigurasi koneksi non rahasia; bila server tidak memenuhi mode yang diminta, koneksi gagal `tls_failed`; tidak ada fallback otomatis ke plaintext (FR-CONN-05).
- [**AC-3**](test.md#ac-3): connect timeout dari descriptor ditegakkan; lewat tenggat menghasilkan `timeout` dengan pesan aman.
- [**AC-4**](test.md#ac-4): `test(context)` mengembalikan hasil ternormalisasi: sukses (versi server, latency) atau `DbError`; tidak menyimpan apa pun (FR-CONN-02).
- [**AC-5**](test.md#ac-5): `CapabilityPort.describe` mendeteksi versi server dan mengembalikan capability V1 PostgreSQL: `schemas` true, `viewEditor` true, `explain` true, `cancelQuery` true, `principals` true, `grants` true, `tableComments` true, `generatedColumns` dan `identityColumns` sesuai versi server, `checkConstraints` true, kunci V2 false dengan `reasons` bila bermakna; `backupRestore` dan `importExport` diisi benar setelah spec terkait (sementara false dengan reason "belum tersedia").
- [**AC-6**](test.md#ac-6): pemetaan error: SQLSTATE 28xxx → `auth_failed`, 3D000/42P01 dan sejenis → `not_found`, 42501 → `permission_denied`, 23xxx → `constraint_violation`, 42601 → `syntax_error` dengan posisi dari field error, 57014 → `cancelled`, kegagalan jaringan → `connection_failed`; pesan hasil mapping tidak pernah memuat connection string atau secret.
- [**AC-7**](test.md#ac-7): infrastruktur cancel: setiap sesi query menyimpan `backend_pid`; `cancel(handle)` mencoba API cancel Bun.sql bila terbukti bekerja, dan selalu punya jalur `pg_cancel_backend(pid)` lewat koneksi kontrol singkat; hasil cancel terverifikasi (query berhenti dengan SQLSTATE 57014).
- [**AC-8**](test.md#ac-8): suite test kontrak generik (spec 0021) lulus terhadap provider ini pada server PostgreSQL nyata dua versi mayor yang didukung (yang terbaru dan satu sebelumnya), di `tests/integration/postgresql/`.
- [**AC-9**](test.md#ac-9): tidak ada import dari `database-mysql` atau sebaliknya; SQL dan semantik PostgreSQL tidak bocor keluar package (boundary check).

## Options considered

### Option 1: Bun.sql dengan jalur cancel ganda (dipilih)

**Pros**:
- Tanpa dependency driver eksternal di binary; API native Bun; keputusan pemilik proyek.

**Cons**:
- Perilaku cancel dan opsi TLS granular Bun.sql lebih muda dari driver klasik; dimitigasi jalur `pg_cancel_backend` yang tidak bergantung driver dan test integrasi yang memaksa buktinya.

### Option 2: Driver postgres (porsager)

**Pros**:
- Dukungan cancel dan TLS teruji lama.

**Cons**:
- Ditolak di sesi desain; menambah dependency yang ingin dihindari.

## Decision

**Chosen option**: Option 1: Bun.sql, dengan `pg_cancel_backend` sebagai jalur cancel yang dijamin, dan gerbang verifikasi TLS di test integrasi.

Struktur package mengikuti struktur.md: `connection/`, `capabilities/`, `driver/`, `mappers/` (basis: keputusan driver sesi desain 2026-08-28; FR-CONN-05; FR-PROV-04).

## Rationale

Keputusan Bun.sql diambil pemilik proyek demi binary tanpa dependency driver; risiko satu satunya yang material (cancel dan TLS) ditutup dengan dua cara: jalur cancel berbasis SQL yang bekerja pada driver apa pun, dan AC test integrasi yang menjadikan bukti TLS sebagai gerbang, bukan asumsi. Bila test membuktikan Bun.sql tidak bisa memenuhi mode verify-full dengan CA custom, keputusan driver kembali ke /architect sebagai supersede terarah, bukan tambalan diam diam.

## Feature design

**Data model sketch**: tidak menambah tabel; state runtime `SessionHandle { id, backendPid, openedAt }` dalam registry koneksi aktif provider.

**API surface**: tidak ada endpoint HTTP (dipakai use case mulai spec 0026); permukaan adalah port spec 0021.

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| open | parameter koneksi | `ConnectionContext` (descriptor dari DB, secret dari vault sesaat) |
| describe | version | `SELECT current_setting('server_version')` atau setara |
| describe | capability per kunci | tabel keputusan versi di `capabilities/` |
| cancel | backend_pid | `pg_backend_pid()` saat sesi dibuka |
| error position | posisi karakter | field position error PostgreSQL |

**Key invariants**:
- Secret hanya hidup selama `open`/`test` berjalan, lewat pola `use` vault; tidak masuk objek yang berumur panjang.
- Mode TLS yang diminta adalah mode yang dipakai atau koneksi gagal; tidak ada downgrade (AC-2).
- Semua error keluar sebagai `DbError`; error mentah driver tidak melewati batas package (FR-OPS-02).

**Security model**: package ini menerima credential paling sering; seluruh jalur error dan log nya wajib melalui redaction; test keamanan memastikan pesan gagal koneksi tidak memuat password.

**Configuration required**: tidak ada baru; parameter per koneksi datang dari descriptor.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. Siapkan lingkungan test PostgreSQL dua versi di `tests/environments/`, memenuhi **AC-8**.
2. Bangun `driver/` adaptor Bun.sql (open, close, ping, timeout) dan registry sesi dengan `backend_pid`, memenuhi **AC-1**, **AC-3**.
3. Implementasikan mode TLS lengkap plus test integrasi per mode, memenuhi **AC-2**.
4. Bangun `mappers/` SQLSTATE → `DbError` plus test tabel pemetaan, memenuhi **AC-6**.
5. Bangun `capabilities/` deteksi versi dan tabel capability, memenuhi **AC-5**.
6. Bangun `test()` dan infrastruktur cancel ganda, memenuhi **AC-4**, **AC-7**.
7. Jalankan suite kontrak generik pada server nyata; pasang boundary check antar provider, memenuhi **AC-8**, **AC-9**.

## Consequences

**Positive**:
- Fondasi semua fitur PostgreSQL; kejujuran capability dan keamanan TLS terbukti sebelum satu fitur pun dibangun di atasnya.

**Negative / tradeoffs**:
- Bergantung pada kematangan Bun.sql; risiko ini eksplisit dan bergerbang test, dengan jalur mundur yang disebut di Rationale.

**Neutral**:
- Kunci capability `backupRestore`/`importExport` diperbarui oleh spec 0047 sampai 0050 saat kemampuannya nyata.

## Follow-up

- [ ] Bila test TLS atau cancel Bun.sql gagal dipenuhi, kembali ke /architect untuk supersede keputusan driver (jangan menambal di luar spec).

## References

**Project sources**:
- v1-feature-specification.md FR-PROV-02, FR-PROV-04, FR-CONN-02, FR-CONN-05; struktur.md packages/database-postgresql; spec 0021.
- Keputusan driver Bun.sql, sesi desain 2026-08-28.

**Practices & standards**:
- Fail closed pada TLS; pemetaan error di boundary; cancel berbasis protokol server sebagai jalur yang dijamin.

**Links** (terverifikasi web 2026-08-28):
- Bun 1.4, Bun.sql PostgreSQL dan MySQL plus cancel API: https://bun.com/blog
