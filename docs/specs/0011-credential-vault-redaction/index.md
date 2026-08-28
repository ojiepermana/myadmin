# 0011. Credential vault dan redaction

**Date**: 2026-08-28
**Status**: In Progress
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini membangun dua penjaga rahasia di `packages/crypto`: vault yang mengenkripsi dan mendekripsi credential koneksi dengan AES-256-GCM memakai master key dari spec 0010, dan modul redaction yang menyensor secret dari log, error, audit, dan output lain. Setelah spec ini, tidak ada jalur legal bagi plaintext credential untuk menyentuh disk atau keluar dari proses server.

## Context

Aturan yang dikunci: SQLite hanya menyimpan ciphertext plus metadata enkripsi; decrypt hanya terjadi sesaat di proses server saat provider membentuk connection context; log, error, audit, telemetry, dan response browser wajib menjalankan redaction (FR-INT-03, FR-INT-04, bagian 8.2 butir 2 sampai 4). Yang perlu diputuskan spec ini: algoritma dan format ciphertext, cara mengikat ciphertext ke pemiliknya, dan bentuk API redaction yang bisa dipakai logger, error presenter, dan audit writer tanpa saling tahu.

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0010.

## Requirements

**User stories**:
- Sebagai pengguna, saya ingin password koneksi yang saya simpan tidak bisa dibaca siapa pun dari file di server.
- Sebagai operator, saya ingin log dan pesan error aman dibagikan tanpa takut berisi secret.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): vault mengenkripsi payload credential (JSON berisi password/token/passphrase opsi rahasia) dengan AES-256-GCM: nonce acak 12 byte per enkripsi, tag autentikasi tersimpan, AAD berisi `connection_id` sehingga ciphertext tidak bisa dipindah antar baris.
- [**AC-2**](test.md#ac-2): hasil enkripsi tersimpan lewat `CredentialRepository` sebagai kolom terpisah: `ciphertext`, `nonce`, `algorithm` (`aes-256-gcm`), `key_id`; tidak ada format gabungan yang menyembunyikan metadata.
- [**AC-3**](test.md#ac-3): dekripsi memverifikasi `key_id` cocok dengan key aktif sebelum mencoba, dan gagal dengan error kategori jelas: `VAULT_KEY_MISMATCH`, `VAULT_INTEGRITY_FAILED` (tag tidak valid), tanpa membocorkan isi.
- [**AC-4**](test.md#ac-4): API vault mengembalikan plaintext hanya sebagai objek berumur pendek dengan metode `use(fn)` atau setara yang mendorong pemakaian sesaat; tidak ada API yang mengembalikan string password untuk disimpan bebas; plaintext tidak pernah dipersist, dikirim ke browser, atau dipancarkan WebSocket (FR-INT-04).
- [**AC-5**](test.md#ac-5): modul redaction menyediakan: (a) redaksi berbasis field name (password, secret, token, passphrase, key, credential, dan variasinya) untuk objek terstruktur, (b) redaksi berbasis pola untuk string bebas (connection string dengan password, nilai berlabel password), (c) registrasi nilai sesaat (plaintext yang sedang hidup) supaya nilai persisnya tersensor di mana pun muncul selama proses berjalan.
- [**AC-6**](test.md#ac-6): logger, error presenter transport, dan audit writer memakai redaction yang sama lewat satu API; test membuktikan secret yang disengaja bocor lewat ketiga jalur itu tersensor.
- [**AC-7**](test.md#ac-7): test keamanan di `tests/security/crypto/` dan `tests/security/redaction/` membuktikan: ciphertext berbeda untuk plaintext sama (nonce acak), AAD mengikat connection_id, round trip utuh, dan tidak ada plaintext di file SQLite setelah menyimpan koneksi (pemeriksaan byte pada file db di test).

## Options considered

### Option 1: AES-256-GCM lewat WebCrypto (dipilih)

**Pros**:
- Standar industri, tersedia bawaan di runtime (globalThis.crypto.subtle), akselerasi hardware umum, cukup diaudit orang.

**Cons**:
- Batas nonce acak per key secara teori (jumlah enkripsi sangat besar); tidak relevan pada volume credential Myadmin.

### Option 2: XChaCha20-Poly1305 lewat libsodium

**Pros**:
- Nonce lebih panjang, tahan salah pakai nonce.

**Cons**:
- Menambah dependency native pada binary lintas platform untuk keuntungan yang tidak dibutuhkan volume ini.

## Decision

**Chosen option**: Option 1: AES-256-GCM lewat WebCrypto, nonce acak per enkripsi, AAD `connection_id`.

Redaction sebagai modul tunggal di `crypto/redaction/` dengan tiga mekanisme (field, pola, nilai teregistrasi), dipakai semua saluran keluaran (basis: bagian 8.2 butir 4 menuntut redaction di log, error, audit, telemetry, fixture; struktur.md menetapkan crypto sebagai pemilik tunggal redaction).

## Rationale

AES-256-GCM memenuhi "authenticated encryption" yang diwajibkan bagian 8.2 tanpa dependency baru, dan AAD menutup kelas serangan pemindahan ciphertext antar koneksi yang tidak ditutup enkripsi biasa. Redaction dengan registrasi nilai sesaat adalah lapisan yang menutup kebocoran paling licin: secret yang sudah didekripsi lalu tercetak di pesan error driver; dua mekanisme lain menutup kebocoran struktural. API `use(fn)` membuat aturan "plaintext hidup seminimal mungkin" terlihat di bentuk kode, bukan hanya di dokumen.

## Feature design

**Data model sketch**: memakai `connection_credentials` spec 0008 apa adanya.

**API surface**: tidak ada endpoint; permukaan modul:

~~~text
Vault.encrypt(connectionId, payload): EncryptedCredential
Vault.decryptAndUse(connectionId, enc, fn: (payload) => T): T
Redaction.redactObject(obj): obj
Redaction.redactText(text): text
Redaction.registerEphemeralSecret(value, ttl?)
~~~

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| encrypt | nonce | CSPRNG per operasi |
| encrypt | key, key_id | KeyProvider (spec 0010) |
| decrypt | connection_id untuk AAD | baris credential yang diminta, bukan input klien |
| redaksi | daftar field sensitif | konstanta modul redaction, satu sumber |

**Key invariants**:
- Plaintext credential tidak pernah menjadi nilai return yang tersimpan; hanya lewat `use(fn)` (AC-4).
- Setiap enkripsi menghasilkan nonce baru; nonce tidak pernah dipakai ulang untuk key sama.
- Semua saluran keluaran proses (log, error, audit, WS) melewati redaction sebelum keluar.

**Security model**: package crypto adalah pemilik tunggal; modul lain memakai lewat port. Test fixture dilarang berisi credential nyata (tests/fixtures sanitized, struktur.md).

**Configuration required**: tidak ada baru.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. Bangun `vault/encrypt-credential.ts` dan `decrypt-credential.ts` (AES-256-GCM, AAD, key_id check, API use), memenuhi **AC-1**, **AC-3**, **AC-4**.
2. Sambungkan vault ke `CredentialRepository` lewat tipe `EncryptedCredential` (spec 0009), memenuhi **AC-2**.
3. Bangun `redaction/` dengan tiga mekanisme dan daftar field baku, memenuhi **AC-5**.
4. Ekspos satu API redaction untuk logger (spec 0013), error handler transport, dan audit writer (spec 0019); tandai titik integrasi dengan test kontrak sederhana sekarang, memenuhi **AC-6**.
5. Test keamanan menyeluruh termasuk pemeriksaan byte file db, memenuhi **AC-7**.

## Consequences

**Positive**:
- Janji keamanan terbesar produk (credential terenkripsi at rest, tanpa bocor di observability) punya implementasi terpusat dan teruji.

**Negative / tradeoffs**:
- Redaction berbasis pola tidak akan pernah sempurna untuk string bebas; lapisan registrasi nilai menutup kasus terpenting, dan test keamanan menjadi jaring terakhir.

**Neutral**:
- Format kolom terpisah (bukan blob gabungan) membuat migrasi algoritma di masa depan bisa berjalan baris per baris.

## Follow-up

- [ ] Spec 0013 dan 0019 wajib memakai API redaction ini, bukan menulis sensor sendiri.

## References

**Project sources**:
- v1-feature-specification.md FR-INT-03, FR-INT-04, bagian 8.2; struktur.md aturan 4.4 dan pohon crypto.
- Spec 0008 (kolom credential), 0010 (key provider).

**Practices & standards**:
- Authenticated encryption dengan AAD pengikat konteks; secret berumur sesaat lewat scoped API; defense in depth pada redaction.

**Links**: tidak ada yang diverifikasi untuk spec ini.
