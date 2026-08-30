# Plan 0011. Credential vault dan redaction

**Date**: 2026-08-30
**Spec status**: mengikuti [index.md](index.md)
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Aturan dokumen

- Dokumen planning ini disusulkan setelah spec berjalan. Isinya diturunkan dari `index.md`, `test.md`, `verify.md`, dan `docs/specs/ac-evidence-matrix.md`; file ini bukan sumber kebenaran baru.
- Status pada tabel di bawah adalah snapshot per 2026-08-30. Bila build plan, acceptance criteria, atau evidence berubah, perbarui tabel ini bersama file sumbernya.
- Status implementasi tidak boleh dinaikkan tanpa evidence pada `verify.md` atau matrix acceptance.

## Ringkasan progres

| Dimensi             | Nilai                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Status spec         | Accepted                                                                                                            |
| Build plan          | Tidak dinyatakan (5 langkah tanpa checkbox di index.md)                                                             |
| Acceptance criteria | 7 AC: 6 PASS, 1 PARTIAL, 0 BLOCKED                                                                                  |
| Verdict verifikasi  | Belum diverifikasi; verdict hanya boleh berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau. |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                                                                                                 | AC terkait       | Status           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------------- |
| 1   | Bangun `vault/encrypt-credential.ts` dan `decrypt-credential.ts` (AES-256-GCM, AAD, key_id check, API use)                                                      | AC-1, AC-3, AC-4 | Tidak dinyatakan |
| 2   | Sambungkan vault ke `CredentialRepository` lewat tipe `EncryptedCredential` (spec 0009)                                                                         | AC-2             | Tidak dinyatakan |
| 3   | Bangun `redaction/` dengan tiga mekanisme dan daftar field baku                                                                                                 | AC-5             | Tidak dinyatakan |
| 4   | Ekspos satu API redaction untuk logger (spec 0013), error handler transport, dan audit writer (spec 0019); tandai titik integrasi dengan test kontrak sederhana | AC-6             | Tidak dinyatakan |
| 5   | Test keamanan menyeluruh termasuk pemeriksaan byte file db                                                                                                      | AC-7             | Tidak dinyatakan |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                                   | Test / proof ID               | Status evidence    |
| -------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------ |
| [AC-1](test.md#ac-1) | Vault mengenkripsi payload credential dengan AES-256-GCM, nonce acak 12 byte, AAD `connection_id`     | `SEC-0011-AC1`                | Terbukti (PASS)    |
| [AC-2](test.md#ac-2) | Hasil enkripsi tersimpan sebagai kolom terpisah: ciphertext, nonce, algorithm, key_id                 | `IT-0011-AC2`                 | Terbukti (PASS)    |
| [AC-3](test.md#ac-3) | Dekripsi memverifikasi key_id; error kategori jelas `VAULT_KEY_MISMATCH` dan `VAULT_INTEGRITY_FAILED` | `SEC-0011-AC3`                | Terbukti (PASS)    |
| [AC-4](test.md#ac-4) | Plaintext hanya lewat `use(fn)` berumur pendek; tidak pernah dipersist atau dikirim keluar proses     | `SEC-0011-AC4`                | Terbukti (PASS)    |
| [AC-5](test.md#ac-5) | Redaction tiga mekanisme: field name, pola string bebas, registrasi nilai sesaat                      | `UT-0011-AC5`, `SEC-0011-AC5` | Terbukti (PASS)    |
| [AC-6](test.md#ac-6) | Logger, error presenter transport, dan audit writer memakai satu API redaction yang sama              | `IT-0011-AC6`, `SEC-0011-AC6` | Sebagian (PARTIAL) |
| [AC-7](test.md#ac-7) | Test keamanan: nonce acak, AAD mengikat connection_id, round trip, tanpa plaintext di file SQLite     | `IT-0011-AC7`, `SEC-0011-AC7` | Terbukti (PASS)    |

## Follow-up

- [ ] Spec 0013 dan 0019 wajib memakai API redaction ini, bukan menulis sensor sendiri.
