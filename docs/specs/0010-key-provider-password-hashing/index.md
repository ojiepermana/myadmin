# 0010. Key provider dan password hashing

**Date**: 2026-08-28
**Status**: In Progress
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini memutuskan dan membangun dua primitif keamanan inti di `packages/crypto`: dari mana master key enkripsi credential berasal, dan bagaimana password user Myadmin di hash. Keputusannya: master key dari keyfile yang dibuat otomatis dengan permission ketat, bisa dioverride environment variable atau path custom; password memakai argon2id lewat Bun.password. Ini ADR keamanan yang ditunda dokumen perencanaan, sekarang dikunci.

## Context

Bagian 8.2 v1-feature-specification mewajibkan: password memakai hash modern yang tidak bisa dipulihkan, saved credential memakai authenticated encryption dengan key material dikelola di luar SQLite "melalui key provider yang disetujui ADR". ADR itu belum ada; spec ini adalah ADR nya. Konteks operasional yang menentukan: Myadmin adalah binary self hosted yang sering berjalan headless di server Linux sebagai service, jadi sumber key harus bekerja tanpa interaksi dan tanpa desktop keychain.

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0006 (data directory, tempat keyfile default).

## Requirements

**User stories**:

- Sebagai operator, saya ingin enkripsi credential bekerja tanpa setup manual, dan bisa saya perkuat dengan memisahkan lokasi key bila mau.
- Sebagai pemilik proyek, saya ingin password user tidak pernah bisa dipulihkan dari data yang bocor.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): pada first run, key provider menghasilkan master key acak 32 byte (CSPRNG) dan menyimpannya ke `<data-dir>/config/master.key` dengan permission `0600` (Windows: ACL setara, hanya user pemilik); pembuatan atomik (tulis ke file sementara lalu rename).
- [**AC-2**](test.md#ac-2): `MYADMIN_MASTER_KEY` (base64 atau hex, 32 byte setelah decode) mengoverride keyfile; `MYADMIN_KEY_FILE` mengoverride lokasi file; prioritas: env key → env path → path default.
- [**AC-3**](test.md#ac-3): key yang berhasil dimuat mendapat `key_id` (turunan pendek dari hash key, bukan key nya) yang direkam di metadata credential (spec 0008 kolom `key_id`); key yang tidak cocok dengan `key_id` ciphertext menghasilkan error jelas "key salah", bukan kegagalan dekripsi misterius.
- [**AC-4**](test.md#ac-4): keyfile dengan permission longgar (group/world readable) membuat boot menolak start dengan instruksi perbaikan; doctor (spec 0007) mendaftarkan check yang sama sebagai pemeriksaan.
- [**AC-5**](test.md#ac-5): isi key tidak pernah tampil di log, error, doctor, atau proses list (tidak lewat argumen CLI); redaction menutup pola nilai key.
- [**AC-6**](test.md#ac-6): password hashing memakai argon2id lewat `Bun.password` dengan konfigurasi eksplisit (memoryCost dan timeCost dinyatakan di kode, bukan mengandalkan default diam diam); verify konstan waktu lewat API yang sama.
- [**AC-7**](test.md#ac-7): kebijakan password terdefinisi di `password-policy.ts`: panjang minimum 10, tanpa aturan komposisi rumit, cek terhadap username sama; batas maksimum 256; pesan pelanggaran jelas.
- [**AC-8**](test.md#ac-8): hash lama dengan parameter usang terdeteksi saat login (needsRehash) dan di rehash transparan setelah verifikasi sukses.
- [**AC-9**](test.md#ac-9): unit test menutup: first run membuat keyfile benar, override env, permission longgar ditolak, hash dan verify round trip, rehash.

## Options considered

### Option 1: Keyfile otomatis plus override env (dipilih)

**Pros**:

- Bekerja headless tanpa interaksi; operator bisa memperkuat dengan memindah key ke mount terpisah atau env dari secret manager; doctor bisa memeriksanya.

**Cons**:

- Default nya key berada di mesin yang sama dengan ciphertext (folder sama, file berbeda); perlindungan utamanya permission OS. Ini dinyatakan jujur di dokumentasi operator.

### Option 2: OS keychain dengan fallback keyfile

**Pros**:

- Di desktop, key dilindungi keychain OS.

**Cons**:

- Tiga integrasi platform berbeda (Keychain, Credential Manager, libsecret) di V1, gagal di server headless yang justru target utama; kompleksitas melebihi nilai untuk rilis pertama. Menjadi V2.

### Option 3: Passphrase wajib saat start

**Pros**:

- Key tidak pernah tersimpan di disk.

**Cons**:

- Mematikan pemakaian sebagai service headless; ditolak oleh konteks operasional.

## Decision

**Chosen option**: Option 1: keyfile otomatis plus override env (keputusan pemilik proyek, sesi desain 2026-08-28).

Untuk password: argon2id lewat `Bun.password` dengan parameter eksplisit (basis: argon2id adalah default Bun.password dan rekomendasi praktik password hashing saat ini; API bawaan berarti nol dependency native tambahan di binary).

## Rationale

Konteks headless mengalahkan keamanan teoretis maksimal: Option 3 paling kuat di atas kertas tapi tidak bisa dipakai target user utama, dan Option 2 menambah tiga permukaan bug lintas platform pada rilis yang belum punya pengguna. Keyfile dengan permission ketat, pembuatan atomik, key_id untuk deteksi salah key, dan jalur override yang jelas memberi keamanan yang jujur dan bisa dioperasikan hari pertama, dengan jalur naik kelas (keychain, secret manager lewat env) tanpa migrasi format. Memenuhi syarat bagian 8.2: key material tidak berada di dalam SQLite.

## Feature design

**Data model sketch**: tidak menambah tabel; memakai kolom `key_id` di `connection_credentials` (spec 0008).

**API surface**: tidak ada endpoint; permukaan berupa modul `KeyProvider` dan `PasswordHasher`.

```text
KeyProvider.load(): { key: Uint8Array(32), keyId: string, source: 'env' | 'file' }
PasswordHasher.hash(plain): string        (string PHC argon2id)
PasswordHasher.verify(plain, hash): { ok: boolean, needsRehash: boolean }
```

**Value sourcing**:

| Action        | Value produced / displayed | Source                                                                               |
| ------------- | -------------------------- | ------------------------------------------------------------------------------------ |
| load key      | key 32 byte                | env `MYADMIN_MASTER_KEY` atau isi keyfile                                            |
| load key      | keyId                      | turunan hash SHA-256 pendek dari key (8 byte hex), dihitung, tidak disimpan terpisah |
| hash password | parameter argon2id         | konstanta di `password-hasher.ts`                                                    |
| policy        | panjang minimum            | konstanta policy; V1 tidak dapat dikonfigurasi                                       |

**Key invariants**:

- Key hanya hidup sebagai `Uint8Array` di memori proses; tidak pernah di serialize, di log, atau dikirim lewat WebSocket.
- Satu key aktif per proses V1; rotasi kunci adalah pekerjaan V2 (key_id sudah menyiapkannya).
- Password hash memakai format PHC standar sehingga parameter tersimpan bersama hash.

**Security model**: modul ini adalah pemilik tunggal primitif keamanan (struktur.md: crypto adalah satu satunya pemilik password hashing, key provider, vault, redaction). Package lain dilarang mengimpor primitif crypto langsung dari runtime; boundary check menegakkan.

**Configuration required**:

- `MYADMIN_MASTER_KEY`: master key eksplisit (base64/hex), opsional.
- `MYADMIN_KEY_FILE`: path keyfile custom, opsional.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

- [x] Bangun `key-management/key-provider.ts` (resolusi sumber, first run atomik, permission check, keyId) dan `passphrase.ts` untuk parsing env, memenuhi **AC-1**, **AC-2**, **AC-3**, **AC-4**.
- [x] Bangun `password/password-hasher.ts` (argon2id eksplisit, verify, needsRehash) dan `password-policy.ts`, memenuhi **AC-6**, **AC-7**, **AC-8**.
- [x] Daftarkan doctor check keyfile (lewat registry spec 0007), memenuhi **AC-4**.
- [x] Pastikan redaction awal menutup nilai key dan hash di logger sementara (lengkap di spec 0011), memenuhi **AC-5**.
- [x] Unit test menyeluruh di `packages/crypto/test/` dan test keamanan di `tests/security/crypto/`, memenuhi **AC-9**.

## Consequences

**Positive**:

- ADR keamanan yang menahan fitur credential (butir 13.1 v1-feature-specification) selesai; vault (spec 0011) tinggal memakai key ini.

**Negative / tradeoffs**:

- Default satu mesin: pencuri yang membawa seluruh data directory plus keyfile bisa mendekripsi credential; dinyatakan di dokumentasi operator beserta mitigasi (pindahkan key lewat `MYADMIN_KEY_FILE` atau env).

**Neutral**:

- Rotasi key tertunda ke V2 dengan key_id sudah tersedia sebagai pijakan.

## Follow-up

- [ ] Dokumentasi operator (spec 0055) wajib menjelaskan model ancaman keyfile dan cara memisahkan lokasi key.
- [ ] V2: OS keychain sebagai sumber key opsional; rotasi key.

## References

**Project sources**:

- v1-feature-specification.md bagian 8.2 butir 1, 2 dan FR-INT-03, FR-INT-04; struktur.md pohon packages/crypto dan aturan 4.4.
- Keputusan key provider sesi desain 2026-08-28.

**Practices & standards**:

- argon2id untuk password; authenticated encryption dengan key di luar penyimpanan ciphertext; least privilege permission file.

**Links** (terverifikasi web 2026-08-28):

- Bun.password argon2id default: https://bun.com/guides/util/hash-a-password
