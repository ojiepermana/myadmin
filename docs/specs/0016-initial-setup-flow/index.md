# 0016. Initial setup end to end

**Date**: 2026-08-28
**Status**: Proposed
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini membangun alur pertama yang menembus semua lapisan: instance baru memaksa pembuatan Admin pertama sebelum bagian aplikasi lain bisa dipakai, lewat halaman setup, endpoint kontrak, use case auth, dan penyimpanan SQLite. Ini tracer bullet yang membuktikan kontrak, SDK, server, storage, dan UI foundation benar benar tersambung.

## Context

FR-AUTH-01: instance baru meminta pembuatan Admin pertama; tidak ada route yang bisa dipakai tanpa itu; setup tidak bisa diulang setelah admin pertama ada. Bahaya klasik alur ini: race dua request setup bersamaan, dan instance yang terekspos jaringan sebelum diklaim. Fondasi yang dipakai sudah ada semua (kontrak dan endpoint kerangka spec 0003, SDK spec 0005, repositories spec 0009, password hashing spec 0010, shell spec 0015).

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0005, 0009, 0010, 0015.

## Requirements

**User stories**:
- Sebagai pemasang baru, saya ingin diarahkan membuat akun Admin pertama begitu membuka aplikasi.
- Sebagai pemilik instance, saya ingin yakin tidak ada orang lain yang bisa mengklaim instance setelah saya.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): `GET /setup/status` publik mengembalikan `{ initialized }`; nilai berasal dari keberadaan user role admin.
- [**AC-2**](test.md#ac-2): saat belum terinisialisasi, semua route UI selain `/setup` dialihkan ke `/setup`, dan semua endpoint API non publik menjawab 409 `SETUP_REQUIRED`.
- [**AC-3**](test.md#ac-3): `POST /setup/admin` memvalidasi username (3 sampai 32 karakter, huruf angka titik strip bawah) dan password (policy spec 0010), membuat user admin, dan menjawab 201 dengan data user tanpa hash.
- [**AC-4**](test.md#ac-4): setup hanya bisa sukses sekali: dua request bersamaan menghasilkan tepat satu admin (transaksi plus pemeriksaan dalam transaksi); percobaan setelah terinisialisasi menjawab 409 `ALREADY_INITIALIZED`; tidak ada jalur mengulang setup dari API.
- [**AC-5**](test.md#ac-5): setelah setup sukses, UI mengarahkan ke halaman login (auto login tidak dilakukan; sesi lahir hanya lewat login, spec 0017).
- [**AC-6**](test.md#ac-6): endpoint setup di rate limit per IP (maksimum 5 percobaan per menit) untuk menahan brute force sebelum instance diklaim.
- [**AC-7**](test.md#ac-7): setup sukses tercatat sebagai audit event `auth.initial_admin.created` (memakai jalur audit sementara bila spec 0019 belum terpasang: tulis langsung lewat AuditRepository) tanpa memuat password.
- [**AC-8**](test.md#ac-8): halaman setup memakai komponen form foundation, menampilkan kekuatan validasi secara langsung, bisa diselesaikan dengan keyboard, dan menampilkan error `ApiError` lewat presenter spec 0015.
- [**AC-9**](test.md#ac-9): e2e Playwright: instance kosong → buka root → dialihkan ke setup → buat admin → diarahkan ke login; percobaan setup kedua ditolak.

## Options considered

### Option 1: Status inisialisasi dihitung dari tabel users (dipilih)

**Pros**:
- Satu sumber kebenaran; tidak ada flag terpisah yang bisa tidak sinkron dengan kenyataan.

**Cons**:
- Query kecil di tiap pemeriksaan; murah dan bisa di cache dalam memori dengan invalidasi saat setup sukses.

### Option 2: Flag `initialized` di tabel settings

**Pros**:
- Pembacaan paling murah.

**Cons**:
- Dua kebenaran (flag dan keberadaan admin) yang bisa bertentangan, misal restore sebagian; kelas bug yang tidak perlu.

## Decision

**Chosen option**: Option 1: status dihitung dari keberadaan admin aktif, di cache memori, di invalidate saat setup.

Use case `initial-admin` hidup di `packages/auth`; endpoint di kontrak (sudah didefinisikan spec 0003); guard setup di server sebagai middleware dan di web sebagai route guard (basis: FR-AUTH-01; struktur.md modul initial-setup dan packages/auth).

## Rationale

Alur ini dipilih sebagai tracer bullet pertama karena menyentuh setiap lapisan dengan permukaan bisnis paling kecil, sesuai pendekatan build proyek (fondasi lalu irisan end to end). Keputusan satu sumber kebenaran untuk status inisialisasi menutup kelas bug restore dan race; jaminan tepat satu admin ditegakkan di lapisan data (transaksi) bukan hanya di UI.

## Feature design

**Data model sketch**: memakai tabel `users` (spec 0008); admin pertama adalah baris users dengan role `admin`.

**State transitions** (instance): uninitialized → initialized; satu arah, tidak ada jalur kembali lewat API.

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| /setup/status | GET | tidak ada | initialized | publik | tidak ada |
| /setup/admin | POST | username, password | user (id, username, role) | publik, rate limited | 409 ALREADY_INITIALIZED, 422 VALIDATION_FAILED, 429 |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| status | initialized | hitungan users role admin aktif (DB) |
| create admin | password_hash | PasswordHasher (spec 0010) |
| create admin | id, created_at | generator kernel (spec 0009) |
| audit event | actor | user admin yang baru dibuat |

**Key invariants**:
- Tepat satu jalur pembuatan admin pertama; setelah initialized, endpoint setup mati secara logika (bukan disembunyikan saja).
- Password tidak pernah muncul di log, audit, atau response (redaction plus review).

**Security model**: kedua endpoint publik karena belum ada sesi; mitigasinya rate limit (AC-6), bind loopback default (spec 0006), dan jendela klaim yang dipersempit oleh redirect paksa. Tidak ada data lain yang bisa dibaca sebelum inisialisasi (AC-2).

**Configuration required**: tidak ada baru.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. Implementasikan use case `initial-admin` di `packages/auth` (validasi, transaksi tepat satu admin, audit), unit test dengan fake repo, memenuhi **AC-3**, **AC-4**, **AC-7**.
2. Implementasikan controller dan middleware `SETUP_REQUIRED` di server, plus rate limit setup, sesuai kontrak, memenuhi **AC-1**, **AC-2**, **AC-6**.
3. Tambahkan validasi response setup ke contract test (spec 0004), memenuhi **AC-1**, **AC-3**.
4. Bangun facade SDK setup (sudah berkerangka di spec 0005) dan feature `initial-setup` di web (halaman, store, guard redirect), memenuhi **AC-2**, **AC-5**, **AC-8**.
5. Tulis e2e Playwright alur setup dan penolakan setup kedua, memenuhi **AC-9**.

## Consequences

**Positive**:
- Seluruh rantai kontrak sampai UI terbukti bekerja; pola fitur end to end (use case, controller, SDK, halaman, e2e) menjadi contoh untuk semua fitur berikutnya.

**Negative / tradeoffs**:
- Tanpa auto login setelah setup, pengguna mengetik password dua kali; dipilih supaya pembuatan sesi hanya punya satu jalur.

**Neutral**:
- Rate limiter sederhana dalam memori lahir di sini dan dipakai ulang oleh login (spec 0017).

## Follow-up

- [ ] Saat spec 0019 selesai, pindahkan penulisan audit setup ke jalur audit resmi.

## References

**Project sources**:
- v1-feature-specification.md FR-AUTH-01, bagian 8.2; struktur.md modul initial-setup, packages/auth.
- Spec 0003, 0005, 0009, 0010, 0015.

**Practices & standards**:
- Tracer bullet untuk memvalidasi arsitektur; jaminan keunikan di lapisan data, bukan UI; rate limit endpoint publik.

**Links**: tidak ada yang diverifikasi untuk spec ini.
