# Plan 0055. Distribusi, signing, installer, dan dokumentasi operator

**Date**: 2026-08-30
**Spec status**: mengikuti [index.md](index.md)
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Aturan dokumen

- Dokumen planning ini disusulkan setelah spec berjalan. Isinya diturunkan dari `index.md`, `test.md`, `verify.md`, dan `docs/specs/ac-evidence-matrix.md`; file ini bukan sumber kebenaran baru.
- Status pada tabel di bawah adalah snapshot per 2026-08-30. Bila build plan, acceptance criteria, atau evidence berubah, perbarui tabel ini bersama file sumbernya.
- Status implementasi tidak boleh dinaikkan tanpa evidence pada `verify.md` atau matrix acceptance.

## Ringkasan progres

| Dimensi             | Nilai                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| Status spec         | In Progress                                                                                                   |
| Build plan          | 5 dari 6 langkah selesai (langkah 6 pada index.md tidak memakai checkbox)                                     |
| Acceptance criteria | 8 AC: 2 PASS, 6 PARTIAL, 0 BLOCKED                                                                            |
| Verdict verifikasi  | Belum diverifikasi; verdict hanya berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau. |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                                  | AC terkait | Status           |
| --- | ------------------------------------------------------------------------------------------------ | ---------- | ---------------- |
| 1   | Perluas `release.yml`: publish GitHub Releases plus changelog                                    | AC-1       | Selesai          |
| 2   | Langkah signing macOS dan Windows bergerbang secret, plus catatan otomatis di release notes      | AC-2, AC-3 | Selesai          |
| 3   | Dockerfile multi arch dan varian `-tools`, publish image                                         | AC-4       | Selesai          |
| 4   | Tulis dan uji service file systemd dan launchd plus dokumen pemasangannya                        | AC-5       | Selesai          |
| 5   | Dokumentasi operator lengkap (dengan ekspor referensi config dari registry), SECURITY.md, README | AC-6, AC-7 | Selesai          |
| 6   | Jalankan uji penerimaan distribusi per platform tersedia                                         | AC-8       | Tidak dinyatakan |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                                          | Test / proof ID                                                    | Status evidence    |
| -------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------ |
| [AC-1](test.md#ac-1) | GitHub Releases mempublikasikan artefak, checksum, dan catatan rilis dari changelog saat tag `v*`            | `UT-0055-AC1`, `IT-0055-AC1`, `SMOKE-0055-AC1`, `MANUAL-0055-AC1`  | Sebagian (PARTIAL) |
| [AC-2](test.md#ac-2) | Signing dan notarization macOS bergerbang sertifikat; tanpa sertifikat rilis jalan dengan catatan Gatekeeper | `IT-0055-AC2`, `SEC-0055-AC2`, `SMOKE-0055-AC2`, `MANUAL-0055-AC2` | Sebagian (PARTIAL) |
| [AC-3](test.md#ac-3) | Signing Windows pola sama: langkah siap, aktif bila sertifikat ada, catatan SmartScreen bila tidak           | `IT-0055-AC3`, `SEC-0055-AC3`, `SMOKE-0055-AC3`, `MANUAL-0055-AC3` | Sebagian (PARTIAL) |
| [AC-4](test.md#ac-4) | Docker image multi arch dari binary linux, non root, volume `/data`, varian `-tools` dengan klien db         | `IT-0055-AC4`, `SEC-0055-AC4`, `SMOKE-0055-AC4`                    | Terbukti (PASS)    |
| [AC-5](test.md#ac-5) | Unit systemd dan plist launchd teruji dengan hardening wajar dan dokumentasi pemasangan                      | `IT-0055-AC5`, `SEC-0055-AC5`, `SMOKE-0055-AC5`, `MANUAL-0055-AC5` | Sebagian (PARTIAL) |
| [AC-6](test.md#ac-6) | Dokumentasi operator `docs/operations/` lengkap sesuai Definition of Done butir 10                           | `IT-0055-AC6`, `SMOKE-0055-AC6`, `MANUAL-0055-AC6`                 | Sebagian (PARTIAL) |
| [AC-7](test.md#ac-7) | SECURITY.md kebijakan pelaporan kerentanan; README menjadi pintu masuk pengguna                              | `MANUAL-0055-AC7`                                                  | Terbukti (PASS)    |
| [AC-8](test.md#ac-8) | Uji penerimaan distribusi di VM/container bersih per platform mengikuti dokumen sendiri                      | `E2E-0055-AC8`, `SMOKE-0055-AC8`, `MANUAL-0055-AC8`                | Sebagian (PARTIAL) |

## Follow-up

- [ ] Pemilik proyek: putuskan dan sediakan sertifikat signing (Apple Developer ID, sertifikat Windows) bila rilis bertanda tangan diinginkan sejak V1.
- [ ] V2: installer native (msi, pkg, deb, rpm) dan pembaruan otomatis bila diminta pengguna.
