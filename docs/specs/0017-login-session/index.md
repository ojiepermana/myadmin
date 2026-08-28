# 0017. Login, logout, dan session

**Date**: 2026-08-28
**Status**: In Progress
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini membangun autentikasi lokal Myadmin: login username password, sesi server side dengan cookie HttpOnly, expiry idle dan absolut yang ditegakkan server, logout, guard route di web, dan perlindungan CSRF. Setelah spec ini, setiap endpoint dan channel yang bukan publik berdiri di belakang sesi yang bisa kadaluarsa dan dicabut.

## Context

FR-AUTH-02 sampai FR-AUTH-05 menuntut login yang tidak bocor informasi, sesi dengan expiry yang ditegakkan server untuk HTTP dan WebSocket, logout yang menginvalidasi, dan tanpa data sesi tertinggal di browser. Keputusan bentuk sesi belum diambil dokumen; diputuskan di sini. Tabel `sessions` sudah ada (spec 0008), hashing password sudah ada (spec 0010), TTL default sudah jadi kontrak config (spec 0012).

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0016.

## Requirements

**User stories**:

- Sebagai pengguna, saya ingin masuk dengan username dan password lalu tetap masuk sampai batas waktu yang wajar.
- Sebagai pemilik instance, saya ingin sesi kadaluarsa dan logout benar benar menutup akses.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): `POST /auth/login` memverifikasi kredensial; sukses membuat baris session dan menyetel cookie `myadmin_session` HttpOnly, SameSite=Lax, Path=/, Secure bila `security.secureCookies` aktif; nilai cookie adalah token acak 256 bit yang hanya disimpan sebagai hash (SHA-256) di kolom `token_hash`.
- [**AC-2**](test.md#ac-2): kegagalan login menjawab 401 `AUTH_INVALID_CREDENTIALS` dengan pesan tunggal yang tidak membedakan username salah dari password salah, dan berjalan dalam waktu yang tidak membedakan keduanya (verifikasi hash dummy saat user tidak ada).
- [**AC-3**](test.md#ac-3): login di rate limit per IP dan per username (5 kegagalan per menit lalu jeda bertahap); user nonaktif ditolak dengan pesan yang sama dengan kredensial salah.
- [**AC-4**](test.md#ac-4): middleware sesi menegakkan di setiap request non publik: token valid, belum `revoked_at`, belum lewat idle timeout (`last_seen_at` plus `session.idleTimeoutMinutes`) dan belum lewat absolut (`created_at` plus `session.absoluteTimeoutHours`); pelanggaran menjawab 401 `SESSION_EXPIRED` dan menghapus cookie; `last_seen_at` diperbarui hemat (paling sering sekali per menit).
- [**AC-5**](test.md#ac-5): upgrade WebSocket memakai cookie sesi yang sama; sesi yang kadaluarsa atau dicabut memutus koneksi WS aktif pada pemeriksaan berikutnya (paling lambat 60 detik) dengan kode tutup yang jelas (FR-AUTH-05 mencakup WS).
- [**AC-6**](test.md#ac-6): `POST /auth/logout` mencabut sesi aktif (`revoked_at`), menghapus cookie, dan mencatat audit; `GET /auth/me` mengembalikan user dan role untuk sesi valid.
- [**AC-7**](test.md#ac-7): perlindungan CSRF: semua request mutasi non publik wajib membawa header `X-Myadmin-Csrf: 1` (dipasang otomatis SDK); server menolak mutasi tanpa header itu, dan memvalidasi `Origin`/`Sec-Fetch-Site` bila ada; kombinasi dengan SameSite=Lax menutup form cross site.
- [**AC-8**](test.md#ac-8): di web: route guard mengalihkan pengunjung tanpa sesi ke `/login`, event `sessionExpired` dari SDK (spec 0005) membersihkan state klien dan mengalihkan ke login tanpa menyisakan data sesi; halaman login memakai form foundation dan bisa diselesaikan keyboard.
- [**AC-9**](test.md#ac-9): login sukses, login gagal (dengan alasan tersamar di klien namun kategori tercatat), dan logout menghasilkan audit event tanpa password; sesi kadaluarsa yang dibersihkan tidak membanjiri audit (pembersihan bukan event per baris).
- [**AC-10**](test.md#ac-10): pembersihan sesi kadaluarsa berjalan berkala di server (interval per jam) lewat `SessionRepository.deleteExpired`.

## Options considered

### Option 1: Sesi opaque server side dengan cookie HttpOnly (dipilih)

**Pros**:

- Pencabutan seketika (logout, deactivate) karena kebenaran di server; tidak ada token yang bisa dibaca skrip; cocok dengan tabel sessions yang sudah dikunci.

**Cons**:

- Satu query sesi per request (dimitigasi cache memori singkat).

### Option 2: JWT stateless

**Pros**:

- Tanpa lookup sesi per request.

**Cons**:

- Pencabutan butuh denylist (kembali stateful); klaim kadaluarsa hidup di klien; tidak memberi keuntungan untuk aplikasi satu server dengan SQLite lokal.

## Decision

**Chosen option**: Option 1: sesi opaque, token acak 256 bit, hash di database, cookie HttpOnly SameSite=Lax, idle plus absolute timeout dari config.

CSRF lewat custom header wajib plus pemeriksaan Origin (basis: sesi cookie pada SPA satu origin; header custom tidak bisa dikirim form lintas situs).

## Rationale

Aplikasi ini satu proses dengan database lokal; kekuatan JWT (stateless lintas layanan) tidak terpakai, sedangkan kelemahannya (pencabutan) menabrak FR-AUTH-04 dan kebutuhan menonaktifkan user (spec 0018). Menyimpan hanya hash token membuat isi tabel sessions tidak berguna bagi pencuri file db. Ganda idle plus absolut memenuhi FR-AUTH-05 dengan perilaku yang bisa dijelaskan: sesi mati karena ditinggal, atau karena sudah terlalu tua.

## Feature design

**Data model sketch**: memakai tabel `sessions` (spec 0008): id, user_id, token_hash unique, created_at, expires_at (diisi batas absolut), last_seen_at, revoked_at.

**State transitions** (session): active → expired (idle/absolut) | revoked (logout, deactivate, change password); tidak ada jalur kembali.

**API surface**:

| Endpoint     | Method | Key inputs         | Key outputs | Auth                 | Key errors |
| ------------ | ------ | ------------------ | ----------- | -------------------- | ---------- |
| /auth/login  | POST   | username, password | user        | publik, rate limited | 401, 429   |
| /auth/logout | POST   | tidak ada          | kosong      | sessionCookie        | 401        |
| /auth/me     | GET    | tidak ada          | user, role  | sessionCookie        | 401        |

**Value sourcing**:

| Action            | Value produced / displayed | Source                                                             |
| ----------------- | -------------------------- | ------------------------------------------------------------------ |
| login             | token sesi                 | CSPRNG 32 byte, dikirim hanya sebagai cookie                       |
| enforcement       | idle dan absolute timeout  | config `session.*` (spec 0012)                                     |
| me                | user, role                 | baris users lewat sesi                                             |
| audit login gagal | kategori alasan            | use case (kredensial salah, user nonaktif); tidak dikirim ke klien |

**Key invariants**:

- Token sesi plaintext tidak pernah disimpan atau dicatat; hanya hash nya.
- Semua endpoint non publik dan WS melewati middleware sesi yang sama; tidak ada jalur samping (bagian 8.2 butir 5).
- Cookie dihapus di setiap jalur kegagalan sesi.

**Security model**: rate limit login, pesan gagal seragam, sesi dicabut saat change password (spec 0018). Compliance khusus tidak berlaku; ini kredensial lokal aplikasi.

**Configuration required**: memakai `session.idleTimeoutMinutes`, `session.absoluteTimeoutHours`, `security.secureCookies` (spec 0012).

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. Implementasikan use case sessions di `packages/auth` (create, validate dengan aturan idle/absolut, revoke, deleteExpired) dengan unit test fake repo, memenuhi **AC-1**, **AC-4**, **AC-10**.
2. Implementasikan endpoint login/logout/me plus rate limiter (dipakai bersama spec 0016) dan pesan gagal seragam, memenuhi **AC-1**, **AC-2**, **AC-3**, **AC-6**.
3. Bangun middleware sesi HTTP plus pemeriksaan CSRF, dan hook validasi sesi pada upgrade dan pemeriksaan berkala WS, memenuhi **AC-4**, **AC-5**, **AC-7**.
4. Web: halaman login, `auth.facade`, guard route, penanganan `sessionExpired`, header CSRF otomatis di SDK, memenuhi **AC-7**, **AC-8**.
5. Audit event login/logout/gagal lewat jalur audit, memenuhi **AC-9**.
6. Contract test operasi auth; test keamanan di `tests/security/auth/`; e2e login logout expiry, memenuhi seluruh AC.

## Consequences

**Positive**:

- Fondasi authorization untuk semua fitur berikutnya; FR-AUTH-02 sampai 05 selesai dengan pencabutan yang nyata.

**Negative / tradeoffs**:

- Lookup sesi per request; dimitigasi cache memori 60 detik yang tetap menghormati pencabutan pada batas cache.

**Neutral**:

- Peran `Admin` vs `User` baru dipakai membatasi route di spec 0018 dan seterusnya.

## Follow-up

- [ ] Spec 0018 mencabut semua sesi user saat password diubah atau user dinonaktifkan.

## References

**Project sources**:

- v1-feature-specification.md FR-AUTH-02 sampai FR-AUTH-05, bagian 8.2 butir 5; struktur.md packages/auth.
- Spec 0008, 0010, 0012, 0016.

**Practices & standards**:

- Sesi opaque dengan hash token; pesan kegagalan autentikasi seragam; CSRF defense berlapis (SameSite, header custom, Origin).

**Links**: tidak ada yang diverifikasi untuk spec ini.
