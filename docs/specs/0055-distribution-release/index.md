# 0055. Distribusi, signing, installer, dan dokumentasi operator

**Date**: 2026-08-28
**Status**: In Progress
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini menutup V1: mengantarkan artefak binary ke tangan pengguna. Isinya signing dan notarization untuk macOS dan Windows, image Docker, service file systemd dan launchd, saluran rilis GitHub Releases dengan changelog, dan dokumentasi operator lengkap (menjalankan, data directory, model keamanan keyfile, backup data internal, upgrade, pemulihan). Beberapa langkahnya membutuhkan akun dan sertifikat yang hanya bisa disiapkan pemilik proyek; itu ditandai sebagai prasyarat manusia.

## Context

FR-RUN-02 menuntut distribusi terdokumentasi; Definition of Done butir 10 menuntut dokumentasi operator lengkap (menjalankan binary, lokasi data, perilaku backup restore, ketersediaan native tool, upgrade dan migrasi, pemulihan dasar). struktur.md menyediakan `distribution/` (docker, installers, manifests, service, signing, targets). Artefak terverifikasi sudah dihasilkan `release.yml` (spec 0054). Signing macOS dan Windows membutuhkan Apple Developer ID dan sertifikat code signing Windows, keduanya keputusan dan belanja pemilik proyek.

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0054. Prasyarat manusia: akun Apple Developer dan sertifikat Windows bila signing penuh diinginkan pada rilis pertama.

## Requirements

**User stories**:

- Sebagai operator, saya ingin memasang Myadmin dengan cara wajar untuk platform saya (unduhan langsung, Docker, atau service) dan membaca dokumentasi yang menjawab pertanyaan operasional saya.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): GitHub Releases menjadi saluran rilis: `release.yml` (spec 0054) diperluas mempublikasikan artefak, checksum, dan catatan rilis dari changelog (`scripts/release/changelog.ts` dari conventional commits) saat tag `v*`.
- [**AC-2**](test.md#ac-2): signing macOS: binary ditandatangani Developer ID dan di notarize (langkah CI dengan secret sertifikat); tanpa sertifikat terpasang, rilis tetap jalan dengan artefak tak bertanda tangan plus catatan jelas di release notes tentang peringatan Gatekeeper dan cara membukanya; struktur langkah signing tetap siap sehingga memasang sertifikat tidak mengubah pipeline.
- [**AC-3**](test.md#ac-3): signing Windows: pola yang sama (langkah siap, aktif bila sertifikat ada, catatan SmartScreen bila tidak).
- [**AC-4**](test.md#ac-4): Docker image dibangun dari binary linux (x64 dan arm64, multi arch manifest): berbasis image distroless/slim, data directory sebagai volume (`/data`), user non root, ENTRYPOINT `myadmin serve --host 0.0.0.0 --data-dir /data` dengan dokumentasi bahwa eksposur port adalah keputusan operator; catatan native tool: image varian `-tools` menyertakan klien postgresql dan mysql untuk backup restore (keputusan pembundelan tool dijawab di sini: lewat image varian, bukan menempel di binary).
- [**AC-5**](test.md#ac-5): service file tersedia dan teruji: unit systemd (Linux) dan plist launchd (macOS) dengan hardening wajar (user tersendiri, batasan filesystem), terdokumentasi cara pasangnya; installer per platform selain arsip tar/zip ditunda V2 kecuali formula Homebrew sederhana bila mudah (opsional, bukan gerbang).
- [**AC-6**](test.md#ac-6): dokumentasi operator di `docs/operations/` mencakup: instalasi per platform, menjalankan dan konfigurasi (referensi key config dan env lengkap dari registry spec 0012), lokasi dan isi data directory, model keamanan keyfile dan cara memisahkan key (spec 0010), backup dan pemulihan data internal Myadmin (file SQLite plus WAL, spec 0008), perilaku backup restore database target dan kebutuhan native tool (spec 0049), upgrade (ganti binary, migrasi otomatis, `migrate --status`), pemulihan dasar (doctor, log), dan batasan yang diketahui; Definition of Done butir 10 dipenuhi seluruhnya.
- [**AC-7**](test.md#ac-7): SECURITY.md berisi kebijakan pelaporan kerentanan; README repo diperbarui menjadi pintu masuk pengguna (unduh, mulai cepat).
- [**AC-8**](test.md#ac-8): uji penerimaan distribusi: pasang dari artefak rilis nyata di VM/container bersih per platform yang tersedia (linux systemd, macos launchd, docker) mengikuti dokumen sendiri, sampai alur setup login koneksi; ketidaksesuaian dokumen adalah bug rilis.

## Options considered

### Option 1: GitHub Releases plus Docker sebagai saluran utama (dipilih)

**Pros**:

- Cocok untuk alat self hosted open source; tanpa infrastruktur distribusi sendiri; Docker menjawab pemakaian server sekaligus persoalan native tool lewat varian image.

**Cons**:

- Pemakai di luar GitHub/Docker harus unduh manual; wajar untuk V1.

### Option 2: Installer penuh per platform (msi, pkg, deb, rpm) di V1

**Pros**:

- Pengalaman pasang paling halus.

**Cons**:

- Empat toolchain packaging dan pemeliharaannya untuk rilis pertama produk; arsip plus service file plus Docker sudah melayani target pengguna awal.

## Decision

**Chosen option**: Option 1: GitHub Releases (arsip per target plus checksum plus catatan), Docker multi arch dengan varian `-tools`, service file systemd dan launchd, signing bergerbang ketersediaan sertifikat, dokumentasi operator lengkap sebagai bagian dari definisi selesai.

## Rationale

Target pengguna V1 adalah operator yang nyaman mengunduh binary atau menarik image; energi rilis pertama lebih berharga dipakai untuk dokumentasi operator yang benar (satu satunya butir Definition of Done yang murni prosa) daripada empat format installer. Keputusan native tool via varian image Docker menjawab FR-BKR-02 untuk lingkungan server paling umum tanpa membengkakkan binary; pengguna binary telanjang tetap dilayani deteksi tool dan panduan doctor (spec 0049). Signing dibuat bergerbang supaya ketiadaan sertifikat tidak menyandera rilis, sementara jalurnya siap begitu pemilik proyek menyediakannya.

## Feature design

**Data model sketch**: tidak ada; artefak distribusi dan dokumen.

**API surface**: tidak ada.

**Value sourcing**:

| Action                 | Value produced / displayed | Source                                                       |
| ---------------------- | -------------------------- | ------------------------------------------------------------ |
| catatan rilis          | changelog                  | conventional commits sejak tag sebelumnya                    |
| status signing         | ditandatangani atau tidak  | keberadaan secret sertifikat di CI                           |
| isi dokumentasi config | referensi key dan env      | registry config (spec 0012) di ekspor ke markdown oleh skrip |
| varian tools           | paket klien db             | manifest Docker `-tools`                                     |

**Key invariants**:

- Tidak ada secret signing di repo; hanya di secret CI (struktur.md: signing input privat tidak disimpan repo).
- Dokumen operator dihasilkan sebagian dari sumber kebenaran kode (referensi config) supaya tidak basi.
- Rilis selalu menyertakan checksum; release notes menyatakan status signing per platform dengan jujur.

**Security model**: rantai pasok: checksum plus signing bila tersedia; image non root; service file dengan hardening; SECURITY.md untuk pelaporan.

**Configuration required**: secret CI untuk signing (disediakan pemilik proyek): identitas Developer ID macOS, sertifikat Windows.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. [x] Perluas `release.yml`: publish GitHub Releases plus changelog, memenuhi **AC-1**.
2. [x] Bangun langkah signing macOS dan Windows bergerbang secret, plus catatan otomatis di release notes, memenuhi **AC-2**, **AC-3**.
3. [x] Bangun Dockerfile multi arch dan varian `-tools`, publish image, memenuhi **AC-4**.
4. [x] Tulis dan uji service file systemd dan launchd plus dokumen pemasangannya, memenuhi **AC-5**.
5. [x] Tulis dokumentasi operator lengkap (dengan ekspor referensi config dari registry), SECURITY.md, README, memenuhi **AC-6**, **AC-7**.
6. Jalankan uji penerimaan distribusi per platform tersedia, memenuhi **AC-8**.

## Consequences

**Positive**:

- V1 benar benar bisa diserahkan ke orang lain; Definition of Done butir 10 selesai; FR-BKR-02 terjawab operasional lewat varian image dan dokumentasi.

**Negative / tradeoffs**:

- Tanpa installer native di V1; pengguna desktop non teknis menunggu V2.
- Signing bergantung belanja sertifikat pemilik proyek; rilis tak bertanda tangan menampilkan peringatan OS.

**Neutral**:

- Homebrew formula opsional bisa menyusul kapan pun tanpa mengubah pipeline.

## Follow-up

- [ ] Pemilik proyek: putuskan dan sediakan sertifikat signing (Apple Developer ID, sertifikat Windows) bila rilis bertanda tangan diinginkan sejak V1.
- [ ] V2: installer native (msi, pkg, deb, rpm) dan pembaruan otomatis bila diminta pengguna.

## References

**Project sources**:

- v1-feature-specification.md FR-RUN-02, FR-BKR-02, Definition of Done butir 10; struktur.md folder distribution; spec 0010, 0012, 0049, 0054.

**Practices & standards**:

- Rantai pasok rilis dengan checksum dan signing; dokumentasi dihasilkan dari sumber kebenaran; uji penerimaan mengikuti dokumen sendiri.

**Links**: tidak ada yang diverifikasi untuk spec ini.
