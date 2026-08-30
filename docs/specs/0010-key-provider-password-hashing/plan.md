# Plan 0010. Key provider dan password hashing

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
| Build plan          | 5 dari 5 langkah selesai                                                                                            |
| Acceptance criteria | 9 AC: 8 PASS, 1 PARTIAL, 0 BLOCKED                                                                                  |
| Verdict verifikasi  | Belum diverifikasi; verdict hanya boleh berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau. |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                                                                            | AC terkait             | Status  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- | ------- |
| 1   | Bangun `key-management/key-provider.ts` (resolusi sumber, first run atomik, permission check, keyId) dan `passphrase.ts` untuk parsing env | AC-1, AC-2, AC-3, AC-4 | Selesai |
| 2   | Bangun `password/password-hasher.ts` (argon2id eksplisit, verify, needsRehash) dan `password-policy.ts`                                    | AC-6, AC-7, AC-8       | Selesai |
| 3   | Daftarkan doctor check keyfile (lewat registry spec 0007)                                                                                  | AC-4                   | Selesai |
| 4   | Pastikan redaction awal menutup nilai key dan hash di logger sementara (lengkap di spec 0011)                                              | AC-5                   | Selesai |
| 5   | Unit test menyeluruh di `packages/crypto/test/` dan test keamanan di `tests/security/crypto/`                                              | AC-9                   | Selesai |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                               | Test / proof ID                 | Status evidence    |
| -------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------ |
| [AC-1](test.md#ac-1) | First run membuat master key 32 byte di keyfile permission `0600`, penulisan atomik               | `IT-0010-AC1`, `SEC-0010-AC1`   | Terbukti (PASS)    |
| [AC-2](test.md#ac-2) | Override env: prioritas `MYADMIN_MASTER_KEY`, lalu `MYADMIN_KEY_FILE`, lalu path default          | `UT-0010-AC2`                   | Terbukti (PASS)    |
| [AC-3](test.md#ac-3) | `key_id` turunan hash key direkam di metadata; mismatch menghasilkan error "key salah" yang jelas | `SEC-0010-AC3`                  | Terbukti (PASS)    |
| [AC-4](test.md#ac-4) | Keyfile permission longgar menolak boot dengan instruksi; doctor mendaftarkan check yang sama     | `IT-0010-AC4`, `SEC-0010-AC4`   | Terbukti (PASS)    |
| [AC-5](test.md#ac-5) | Isi key tidak pernah tampil di log, error, doctor, atau proses list                               | `SEC-0010-AC5`                  | Terbukti (PASS)    |
| [AC-6](test.md#ac-6) | Password hashing argon2id lewat `Bun.password` dengan parameter eksplisit; verify konstan waktu   | `SEC-0010-AC6`, `PERF-0010-AC6` | Sebagian (PARTIAL) |
| [AC-7](test.md#ac-7) | Password policy: minimum 10, maksimum 256, cek terhadap username, pesan pelanggaran jelas         | `UT-0010-AC7`                   | Terbukti (PASS)    |
| [AC-8](test.md#ac-8) | Hash parameter usang terdeteksi (needsRehash) dan di rehash transparan setelah login sukses       | `SEC-0010-AC8`                  | Terbukti (PASS)    |
| [AC-9](test.md#ac-9) | Unit test menutup first run, override env, permission longgar, round trip hash, rehash            | `UT-0010-AC9`                   | Terbukti (PASS)    |

## Follow-up

- [ ] Dokumentasi operator (spec 0055) wajib menjelaskan model ancaman keyfile dan cara memisahkan lokasi key.
- [ ] V2: OS keychain sebagai sumber key opsional; rotasi key.
