# 0006. CLI runtime dan data directory

**Date**: 2026-08-28
**Status**: Proposed
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini membangun tulang punggung runtime binary: perintah `myadmin serve` dan `myadmin version`, resolusi data directory per platform beserta subfolder nya, penanganan sinyal untuk shutdown yang rapi, dan penyajian aset web Angular dengan fallback SPA. Setelah spec ini, siklus hidup proses Myadmin sudah berbentuk final; fitur tinggal menempel.

## Context

Myadmin didistribusikan sebagai satu executable: CLI melakukan bootstrap (menentukan data directory, menjalankan migrasi, memulai server, menyajikan aset), sementara server tetap bisa diuji sebagai aplikasi HTTP biasa tanpa packaging (struktur.md bagian 3, apps/cli). FR-RUN-01 menuntut host dan port bisa dioverride tanpa rebuild. Keputusan yang belum diambil dokumen dan diputuskan di sini: lokasi default data directory per platform dan default bind address.

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0001. Perintah `doctor` dan `migrate` menyusul di spec 0007; migrasi dipanggil dari boot begitu spec 0008 ada.

## Requirements

**User stories**:
- Sebagai operator, saya ingin `myadmin serve` langsung jalan dengan default aman dan bisa dioverride lewat flag atau environment variable.
- Sebagai operator, saya ingin menghentikan proses dengan Ctrl+C tanpa merusak data internal.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): `myadmin serve` memulai HTTP server dan menyajikan SPA; default bind `127.0.0.1:8080`; `--host`, `--port`, `MYADMIN_HOST`, `MYADMIN_PORT` mengoverride tanpa rebuild; prioritas flag di atas environment variable.
- [**AC-2**](test.md#ac-2): data directory default per platform: macOS `~/Library/Application Support/myadmin`, Linux `$XDG_DATA_HOME/myadmin` (fallback `~/.local/share/myadmin`), Windows `%APPDATA%\myadmin`; `--data-dir` dan `MYADMIN_DATA_DIR` mengoverride.
- [**AC-3**](test.md#ac-3): saat boot, data directory dibuat bila belum ada berisi subfolder `config/`, `logs/`, `backups/`, `temp/`; kegagalan menulis membuat proses berhenti dengan pesan jelas dan exit code bukan nol, tanpa membocorkan isi file lain.
- [**AC-4**](test.md#ac-4): SIGINT dan SIGTERM memicu graceful shutdown: server berhenti menerima koneksi baru, koneksi berjalan diberi tenggat singkat, resource ditutup, proses keluar dengan kode 0; sinyal kedua memaksa keluar.
- [**AC-5**](test.md#ac-5): aset web disajikan dari aset yang di embed saat build release, atau dari `dist/web` saat pengembangan; route bukan `/api` dan bukan file nyata mendapat fallback `index.html` (SPA), sementara path `/api/*` yang tak dikenal tetap 404 `ApiError`.
- [**AC-6**](test.md#ac-6): `myadmin version` mencetak versi, commit hash bila tersedia, dan platform, tanpa membaca data directory.
- [**AC-7**](test.md#ac-7): `myadmin serve` mencetak ke terminal: alamat yang dilayani, lokasi data directory, dan cara berhenti; tanpa secret.
- [**AC-8**](test.md#ac-8): boot memanggil rangkaian bootstrap terurut (resolve data dir → siapkan folder → [migrasi, setelah spec 0008] → compose → listen) yang tiap tahapnya melaporkan kegagalan secara berbeda dan aman.

## Options considered

### Option 1: Default bind loopback 127.0.0.1 (dipilih)

**Pros**:
- Aman secara default: aplikasi berisi kredensial database tidak terekspos jaringan tanpa keputusan sadar operator.

**Cons**:
- Operator yang ingin akses jaringan harus menyetel `--host 0.0.0.0` secara eksplisit.

### Option 2: Default bind 0.0.0.0

**Pros**:
- Langsung bisa diakses dari mesin lain, cocok untuk server.

**Cons**:
- Sebelum initial admin dibuat, siapa pun di jaringan bisa mengklaim instance; risiko tak sepadan.

## Decision

**Chosen option**: Option 1: default loopback.

CLI dengan parsing argumen ringan tanpa framework CLI berat, resolusi data directory platform aware di `runtime/data-directory.ts`, penanganan sinyal di `runtime/signal-handling.ts`, penyajian aset lewat `static-web` server (basis: struktur.md pohon apps/cli dan kontrak runtime bagian 6; FR-RUN-01).

## Rationale

Loopback default adalah konsekuensi langsung dari sifat aplikasi: satu binary yang menyimpan kredensial database orang. Instance baru yang belum punya admin tidak boleh terekspos jaringan secara tidak sengaja; FR-AUTH-01 melindungi route, tapi eksposur jaringan tetap permukaan serangan yang tidak perlu. Pemisahan CLI dan server dipertahankan persis seperti struktur.md supaya server bisa diuji tanpa packaging.

## Feature design

**Data model sketch**: tidak ada entity database; artefak filesystem:

~~~text
<data-dir>/
├── myadmin.db        (dibuat spec 0008)
├── config/           (keyfile spec 0010, config file spec 0012)
├── logs/
├── backups/
└── temp/
~~~

**State transitions** (proses): starting → serving → draining → stopped; kegagalan tahap boot → failed dengan exit code bukan nol.

**API surface**: tidak menambah endpoint API; menyajikan `/health` (spec 0001) dan aset statis.

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| serve | host, port | flag → env → default, dirapikan spec 0012 menjadi config loader tunggal |
| serve | lokasi data directory | resolusi platform (AC-2) |
| version | versi, commit | di inject saat build (spec 0054); dev membaca `package.json` akar sesuai spec 0001 |
| static | aset web | embed release atau dist/web dev |

**Key invariants**:
- CLI tidak berisi use case bisnis atau SQL provider (struktur.md bagian 3); hanya bootstrap dan concern native.
- Semua penulisan file internal berada di bawah data directory; tidak ada tulisan ke lokasi lain.
- Path traversal pada penyajian aset mustahil: resolusi path dinormalisasi dan dikurung di root aset.

**Security model**: belum ada auth di lapisan ini; kontribusinya adalah default loopback dan tidak mencetak secret. Pesan kegagalan boot tidak memuat isi config.

**Configuration required**:
- `MYADMIN_HOST`, `MYADMIN_PORT`: override bind.
- `MYADMIN_DATA_DIR`: override data directory.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. Bangun `runtime/data-directory.ts` (resolusi platform, override, pembuatan subfolder, pemeriksaan tulis), memenuhi **AC-2**, **AC-3**.
2. Bangun parsing perintah dan flag di `main.ts` plus `commands/serve.ts`, `commands/version.ts`, memenuhi **AC-1**, **AC-6**.
3. Bangun `runtime/signal-handling.ts` dan alur draining di server (`bootstrap/runtime-lifecycle.ts`), memenuhi **AC-4**.
4. Bangun `static-web/serve-assets.ts` dan `spa-fallback.ts` dengan pengurungan path, plus `runtime/embedded-assets.ts` (embed release, dist saat dev), memenuhi **AC-5**.
5. Bangun keluaran terminal (`output/terminal-presenter.ts`) untuk pesan boot dan kegagalan, memenuhi **AC-7**, **AC-8**.
6. Test unit resolusi data directory per platform dan test e2e proses: boot, sinyal, exit code (di `tests/e2e/binary/` versi dev), memenuhi **AC-1** sampai **AC-5**.

## Consequences

**Positive**:
- Siklus hidup proses final sejak awal; smoke test binary (spec 0054) tinggal memakai perilaku yang sudah teruji.

**Negative / tradeoffs**:
- Loopback default menambah satu langkah bagi operator server; ditebus keamanan default.

**Neutral**:
- Boot memanggil migrasi hanya setelah spec 0008; sampai saat itu tahap migrasi adalah no op yang ditandai jelas.

## Follow-up

- [ ] Setelah spec 0012, pindahkan pembacaan flag/env ke config loader tunggal supaya prioritas konfigurasi hidup di satu tempat.

## References

**Project sources**:
- struktur.md bagian 3 (apps/cli), bagian 6 (kontrak runtime dan data directory); v1-feature-specification.md FR-RUN-01, FR-RUN-03.

**Practices & standards**:
- Aman secara default (bind loopback); graceful shutdown dengan tenggat; XDG Base Directory di Linux.

**Links**: tidak ada yang diverifikasi untuk spec ini.
