# Test dan acceptance criteria 0055. Distribusi, signing, installer, dan dokumentasi operator

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Parsial lokal — lima target binary, checksums, ukuran artefak, service/image invariant, dan macOS ARM64 binary smoke lulus; database-required smoke PostgreSQL pada macOS ARM64 juga lulus; local-built Docker runtime clean-container smoke lulus; plist launchd valid; distribution/changelog/packaging invariant suite lulus **18 test, 86 assertions**; signing, hosted release, database smoke lintas target, systemd host, dan clean-VM acceptance belum tersedia.
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0055.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

GitHub Releases menjadi saluran rilis: `release.yml` (spec 0054) diperluas mempublikasikan artefak, checksum, dan catatan rilis dari changelog (`scripts/release/changelog.ts` dari conventional commits) saat tag `v*`.

### AC-2

signing macOS: binary ditandatangani Developer ID dan di notarize (langkah CI dengan secret sertifikat); tanpa sertifikat terpasang, rilis tetap jalan dengan artefak tak bertanda tangan plus catatan jelas di release notes tentang peringatan Gatekeeper dan cara membukanya; struktur langkah signing tetap siap sehingga memasang sertifikat tidak mengubah pipeline.

### AC-3

signing Windows: pola yang sama (langkah siap, aktif bila sertifikat ada, catatan SmartScreen bila tidak).

### AC-4

Docker image dibangun dari binary linux (x64 dan arm64, multi arch manifest): berbasis image distroless/slim, data directory sebagai volume (`/data`), user non root, ENTRYPOINT `myadmin serve --host 0.0.0.0 --data-dir /data` dengan dokumentasi bahwa eksposur port adalah keputusan operator; catatan native tool: image varian `-tools` menyertakan klien postgresql dan mysql untuk backup restore (keputusan pembundelan tool dijawab di sini: lewat image varian, bukan menempel di binary).

### AC-5

service file tersedia dan teruji: unit systemd (Linux) dan plist launchd (macOS) dengan hardening wajar (user tersendiri, batasan filesystem), terdokumentasi cara pasangnya; installer per platform selain arsip tar/zip ditunda V2 kecuali formula Homebrew sederhana bila mudah (opsional, bukan gerbang).

### AC-6

dokumentasi operator di `docs/operations/` mencakup: instalasi per platform, menjalankan dan konfigurasi (referensi key config dan env lengkap dari registry spec 0012), lokasi dan isi data directory, model keamanan keyfile dan cara memisahkan key (spec 0010), backup dan pemulihan data internal Myadmin (file SQLite plus WAL, spec 0008), perilaku backup restore database target dan kebutuhan native tool (spec 0049), upgrade (ganti binary, migrasi otomatis, `migrate --status`), pemulihan dasar (doctor, log), dan batasan yang diketahui; Definition of Done butir 10 dipenuhi seluruhnya.

### AC-7

SECURITY.md berisi kebijakan pelaporan kerentanan; README repo diperbarui menjadi pintu masuk pengguna (unduh, mulai cepat).

### AC-8

uji penerimaan distribusi: pasang dari artefak rilis nyata di VM/container bersih per platform yang tersedia (linux systemd, macos launchd, docker) mengikuti dokumen sendiri, sampai alur setup login koneksi; ketidaksesuaian dokumen adalah bug rilis.

## Matriks cakupan

| AC            | Unit          | Integration   | Contract | E2E            | Security       | Performance | Visual | Smoke            | Manual atau external |
| ------------- | ------------- | ------------- | -------- | -------------- | -------------- | ----------- | ------ | ---------------- | -------------------- |
| [AC-1](#ac-1) | `UT-0055-AC1` | `IT-0055-AC1` | n/a      | n/a            | n/a            | n/a         | n/a    | `SMOKE-0055-AC1` | `MANUAL-0055-AC1`    |
| [AC-2](#ac-2) | n/a           | `IT-0055-AC2` | n/a      | n/a            | `SEC-0055-AC2` | n/a         | n/a    | `SMOKE-0055-AC2` | `MANUAL-0055-AC2`    |
| [AC-3](#ac-3) | n/a           | `IT-0055-AC3` | n/a      | n/a            | `SEC-0055-AC3` | n/a         | n/a    | `SMOKE-0055-AC3` | `MANUAL-0055-AC3`    |
| [AC-4](#ac-4) | n/a           | `IT-0055-AC4` | n/a      | n/a            | `SEC-0055-AC4` | n/a         | n/a    | `SMOKE-0055-AC4` | n/a                  |
| [AC-5](#ac-5) | n/a           | `IT-0055-AC5` | n/a      | n/a            | `SEC-0055-AC5` | n/a         | n/a    | `SMOKE-0055-AC5` | `MANUAL-0055-AC5`    |
| [AC-6](#ac-6) | n/a           | `IT-0055-AC6` | n/a      | n/a            | n/a            | n/a         | n/a    | `SMOKE-0055-AC6` | `MANUAL-0055-AC6`    |
| [AC-7](#ac-7) | n/a           | n/a           | n/a      | n/a            | n/a            | n/a         | n/a    | n/a              | `MANUAL-0055-AC7`    |
| [AC-8](#ac-8) | n/a           | n/a           | n/a      | `E2E-0055-AC8` | n/a            | n/a         | n/a    | `SMOKE-0055-AC8` | `MANUAL-0055-AC8`    |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

| ID            | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                                       | Expected result                                      |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `UT-0055-AC1` | [AC-1](#ac-1) | GitHub Releases menjadi saluran rilis: release.yml (spec 0054) diperluas mempublikasikan artefak, checksum, dan catatan rilis dari changelog (scripts/release... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |

## Integration test

| ID            | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                         | Expected result                                      |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `IT-0055-AC1` | [AC-1](#ac-1) | GitHub Releases menjadi saluran rilis: release.yml (spec 0054) diperluas mempublikasikan artefak, checksum, dan catatan rilis dari changelog (scripts/release... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `IT-0055-AC2` | [AC-2](#ac-2) | signing macOS: binary ditandatangani Developer ID dan di notarize (langkah CI dengan secret sertifikat); tanpa sertifikat terpasang, rilis tetap jalan dengan... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `IT-0055-AC3` | [AC-3](#ac-3) | signing Windows: pola yang sama (langkah siap, aktif bila sertifikat ada, catatan SmartScreen bila tidak).                                                       | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `IT-0055-AC4` | [AC-4](#ac-4) | Docker image dibangun dari binary linux (x64 dan arm64, multi arch manifest): berbasis image distroless/slim, data directory sebagai volume (/data), user non... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `IT-0055-AC5` | [AC-5](#ac-5) | service file tersedia dan teruji: unit systemd (Linux) dan plist launchd (macOS) dengan hardening wajar (user tersendiri, batasan filesystem), terdokumentasi... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `IT-0055-AC6` | [AC-6](#ac-6) | dokumentasi operator di docs/operations/ mencakup: instalasi per platform, menjalankan dan konfigurasi (referensi key config dan env lengkap dari registry sp... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

## Test tambahan

### Contract test

Tidak ada contract yang diwajibkan oleh acceptance criteria saat ini.

### E2E

| ID             | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                       | Expected result                                      |
| -------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------- |
| `E2E-0055-AC8` | [AC-8](#ac-8) | uji penerimaan distribusi: pasang dari artefak rilis nyata di VM/container bersih per platform yang tersedia (linux systemd, macos launchd, docker) mengikuti... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

### Security

| ID             | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                               | Expected result                                      |
| -------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `SEC-0055-AC2` | [AC-2](#ac-2) | signing macOS: binary ditandatangani Developer ID dan di notarize (langkah CI dengan secret sertifikat); tanpa sertifikat terpasang, rilis tetap jalan dengan... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `SEC-0055-AC3` | [AC-3](#ac-3) | signing Windows: pola yang sama (langkah siap, aktif bila sertifikat ada, catatan SmartScreen bila tidak).                                                       | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `SEC-0055-AC4` | [AC-4](#ac-4) | Docker image dibangun dari binary linux (x64 dan arm64, multi arch manifest): berbasis image distroless/slim, data directory sebagai volume (/data), user non... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `SEC-0055-AC5` | [AC-5](#ac-5) | service file tersedia dan teruji: unit systemd (Linux) dan plist launchd (macOS) dengan hardening wajar (user tersendiri, batasan filesystem), terdokumentasi... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |

### Performance

Tidak ada performance yang diwajibkan oleh acceptance criteria saat ini.

### Visual dan accessibility

Tidak ada visual dan accessibility yang diwajibkan oleh acceptance criteria saat ini.

### Smoke dan operational acceptance

| ID               | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                   | Expected result                                      |
| ---------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `SMOKE-0055-AC1` | [AC-1](#ac-1) | GitHub Releases menjadi saluran rilis: release.yml (spec 0054) diperluas mempublikasikan artefak, checksum, dan catatan rilis dari changelog (scripts/release... | Jalankan artefak atau workflow pada environment bersih dan simpan bukti operasional. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `SMOKE-0055-AC2` | [AC-2](#ac-2) | signing macOS: binary ditandatangani Developer ID dan di notarize (langkah CI dengan secret sertifikat); tanpa sertifikat terpasang, rilis tetap jalan dengan... | Jalankan artefak atau workflow pada environment bersih dan simpan bukti operasional. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `SMOKE-0055-AC3` | [AC-3](#ac-3) | signing Windows: pola yang sama (langkah siap, aktif bila sertifikat ada, catatan SmartScreen bila tidak).                                                       | Jalankan artefak atau workflow pada environment bersih dan simpan bukti operasional. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `SMOKE-0055-AC4` | [AC-4](#ac-4) | Docker image dibangun dari binary linux (x64 dan arm64, multi arch manifest): berbasis image distroless/slim, data directory sebagai volume (/data), user non... | Jalankan artefak atau workflow pada environment bersih dan simpan bukti operasional. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `SMOKE-0055-AC5` | [AC-5](#ac-5) | service file tersedia dan teruji: unit systemd (Linux) dan plist launchd (macOS) dengan hardening wajar (user tersendiri, batasan filesystem), terdokumentasi... | Jalankan artefak atau workflow pada environment bersih dan simpan bukti operasional. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `SMOKE-0055-AC6` | [AC-6](#ac-6) | dokumentasi operator di docs/operations/ mencakup: instalasi per platform, menjalankan dan konfigurasi (referensi key config dan env lengkap dari registry sp... | Jalankan artefak atau workflow pada environment bersih dan simpan bukti operasional. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `SMOKE-0055-AC8` | [AC-8](#ac-8) | uji penerimaan distribusi: pasang dari artefak rilis nyata di VM/container bersih per platform yang tersedia (linux systemd, macos launchd, docker) mengikuti... | Jalankan artefak atau workflow pada environment bersih dan simpan bukti operasional. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

### Manual atau external proof

| ID                | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                               | Expected result                                      |
| ----------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `MANUAL-0055-AC1` | [AC-1](#ac-1) | GitHub Releases menjadi saluran rilis: release.yml (spec 0054) diperluas mempublikasikan artefak, checksum, dan catatan rilis dari changelog (scripts/release... | Publikasi harus dibuktikan dengan GitHub Release nyata.                                          | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `MANUAL-0055-AC2` | [AC-2](#ac-2) | signing macOS: binary ditandatangani Developer ID dan di notarize (langkah CI dengan secret sertifikat); tanpa sertifikat terpasang, rilis tetap jalan dengan... | Signing memerlukan Apple Developer ID dan layanan notarization nyata.                            | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `MANUAL-0055-AC3` | [AC-3](#ac-3) | signing Windows: pola yang sama (langkah siap, aktif bila sertifikat ada, catatan SmartScreen bila tidak).                                                       | Signing memerlukan sertifikat Windows dan validasi artefak nyata.                                | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `MANUAL-0055-AC5` | [AC-5](#ac-5) | service file tersedia dan teruji: unit systemd (Linux) dan plist launchd (macOS) dengan hardening wajar (user tersendiri, batasan filesystem), terdokumentasi... | Service file harus dibuktikan pada host systemd dan launchd nyata.                               | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `MANUAL-0055-AC6` | [AC-6](#ac-6) | dokumentasi operator di docs/operations/ mencakup: instalasi per platform, menjalankan dan konfigurasi (referensi key config dan env lengkap dari registry sp... | Lakukan review manusia atau kumpulkan bukti eksternal yang tidak dapat digantikan test otomatis. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `MANUAL-0055-AC7` | [AC-7](#ac-7) | SECURITY.md berisi kebijakan pelaporan kerentanan; README repo diperbarui menjadi pintu masuk pengguna (unduh, mulai cepat).                                     | Kualitas isi `SECURITY.md` dan README memerlukan review manusia.                                 | Seluruh outcome dan failure boundary AC-7 terpenuhi. |
| `MANUAL-0055-AC8` | [AC-8](#ac-8) | uji penerimaan distribusi: pasang dari artefak rilis nyata di VM/container bersih per platform yang tersedia (linux systemd, macos launchd, docker) mengikuti... | Acceptance memerlukan VM atau container bersih dan artefak rilis nyata.                          | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

## Critical test scenarios

- Penerimaan: pasang di Ubuntu bersih lewat dokumen systemd sendiri sampai alur inti, verifikasi **AC-5**, **AC-6**, **AC-8**.
- Docker: `docker run` varian tools, backup restore bekerja dalam container, verifikasi **AC-4**.
- Kejujuran: rilis tanpa sertifikat menyatakan status tak bertanda tangan di notes, verifikasi **AC-2**, **AC-3**.

## Staged, environment, dan external proof

| AC            | Jenis bukti | Kewajiban                                                               |
| ------------- | ----------- | ----------------------------------------------------------------------- |
| [AC-1](#ac-1) | `external`  | Publikasi harus dibuktikan dengan GitHub Release nyata.                 |
| [AC-2](#ac-2) | `external`  | Signing memerlukan Apple Developer ID dan layanan notarization nyata.   |
| [AC-3](#ac-3) | `external`  | Signing memerlukan sertifikat Windows dan validasi artefak nyata.       |
| [AC-5](#ac-5) | `external`  | Service file harus dibuktikan pada host systemd dan launchd nyata.      |
| [AC-7](#ac-7) | `manual`    | Kualitas isi `SECURITY.md` dan README memerlukan review manusia.        |
| [AC-8](#ac-8) | `external`  | Acceptance memerlukan VM atau container bersih dan artefak rilis nyata. |

## Fixture dan environment

| Area         | Aturan                                                                                                         |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| Data         | Gunakan data sintetis atau tersanitasi. Jangan memakai credential, token, atau data produksi nyata.            |
| Resource     | Database, file, port, process, dan container harus disposable serta memiliki cleanup deterministik.            |
| Version      | Pin versi environment yang dibuktikan. Jangan memakai label dinamis seperti `latest` sebagai bukti acceptance. |
| Root command | Instalasi dan command test selalu dimulai dari akar repo dan satu `package.json`.                              |

## Exit criteria test

- Setiap AC memiliki test ID atau jalur proof yang eksplisit pada [verify.md](verify.md).
- Unit dan integration test yang relevan diimplementasikan, lulus, dan dapat diulang dari checkout bersih.
- Test yang tidak relevan ditandai `n/a` dengan alasan yang tetap benar setelah implementasi.
- External proof tidak boleh diganti local smoke test. Staged proof tidak boleh ditutup sebelum dependency yang disebut tersedia.
- Tidak ada test yang dianggap lulus hanya karena file atau placeholder tersedia.
