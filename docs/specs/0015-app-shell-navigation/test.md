# Test dan acceptance criteria 0015. App shell dan navigation

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Parsial lokal — shell E2E 6 test, lazy-route invariant, dan integration error presenter AC-6 lulus; visual/manual review dan visual AC-8 belum lengkap.
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0015.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

app shell terdiri dari top bar (branding, menu user placeholder, toggle theme), sidebar kiri yang bisa dilipat, area workspace dengan tab host, panel bawah opsional, dan status bar; semua memakai primitive layout dan navigation @ojiepermana/angular.

### AC-2

panel sidebar dan panel bawah bisa diubah ukurannya dengan drag dan dilipat; ukuran tersimpan sementara di memori (persistensi lintas sesi milik spec 0030).

### AC-3

tab host mendukung buka, tutup, pindah aktif, dan menampung konten fitur lewat router outlet atau portal; state tiap tab terisolasi.

### AC-4

infrastruktur context menu tersedia sebagai directive/service yang fitur pakai untuk menu klik kanan; satu menu terbuka pada satu waktu; bisa diakses keyboard (tombol menu, Escape menutup).

### AC-5

routing kerangka terdefinisi untuk semua fitur V1 sebagai lazy route (initial-setup, auth, connections, workspace, explorer, database, schema, table-designer, data-browser, query-editor, query-history, security, import-export, backup-restore, monitoring, audit, settings) dengan placeholder ringan; guard auth dipasang belakangan (spec 0017).

### AC-6

`core/errors/` menyediakan error presenter (toast/dialog dari paket foundation) yang menerima `SdkError` dan menampilkan pesan aman plus correlation ID yang bisa disalin; error boundary menangkap error render fitur tanpa merobohkan shell.

### AC-7

navigasi utama, toggle sidebar, perpindahan tab, dan menutup dialog dapat dijalankan dengan keyboard; fokus terlihat; landmark ARIA dasar terpasang (FR-UI-05, NFR-04 baseline).

### AC-8

layout tidak rusak pada lebar 1024 px; di bawah itu sidebar otomatis menjadi overlay.

## Matriks cakupan

| AC            | Unit | Integration   | Contract | E2E            | Security | Performance | Visual         | Smoke | Manual atau external |
| ------------- | ---- | ------------- | -------- | -------------- | -------- | ----------- | -------------- | ----- | -------------------- |
| [AC-1](#ac-1) | n/a  | n/a           | n/a      | n/a            | n/a      | n/a         | `VIS-0015-AC1` | n/a   | `MANUAL-0015-AC1`    |
| [AC-2](#ac-2) | n/a  | n/a           | n/a      | `E2E-0015-AC2` | n/a      | n/a         | n/a            | n/a   | n/a                  |
| [AC-3](#ac-3) | n/a  | n/a           | n/a      | `E2E-0015-AC3` | n/a      | n/a         | n/a            | n/a   | n/a                  |
| [AC-4](#ac-4) | n/a  | n/a           | n/a      | `E2E-0015-AC4` | n/a      | n/a         | `VIS-0015-AC4` | n/a   | n/a                  |
| [AC-5](#ac-5) | n/a  | `IT-0015-AC5` | n/a      | `E2E-0015-AC5` | n/a      | n/a         | n/a            | n/a   | n/a                  |
| [AC-6](#ac-6) | n/a  | `IT-0015-AC6` | n/a      | n/a            | n/a      | n/a         | n/a            | n/a   | n/a                  |
| [AC-7](#ac-7) | n/a  | n/a           | n/a      | `E2E-0015-AC7` | n/a      | n/a         | `VIS-0015-AC7` | n/a   | n/a                  |
| [AC-8](#ac-8) | n/a  | n/a           | n/a      | n/a            | n/a      | n/a         | `VIS-0015-AC8` | n/a   | n/a                  |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

Tidak ada unit yang diwajibkan oleh acceptance criteria saat ini.

## Integration test

| ID            | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                         | Expected result                                      |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `IT-0015-AC6` | [AC-6](#ac-6) | core/errors/ menyediakan error presenter (toast/dialog dari paket foundation) yang menerima SdkError dan menampilkan pesan aman plus correlation ID yang bisa... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

## Test tambahan

### Contract test

Tidak ada contract yang diwajibkan oleh acceptance criteria saat ini.

### E2E

| ID             | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                       | Expected result                                      |
| -------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------- |
| `E2E-0015-AC2` | [AC-2](#ac-2) | panel sidebar dan panel bawah bisa diubah ukurannya dengan drag dan dilipat; ukuran tersimpan sementara di memori (persistensi lintas sesi milik spec 0030).     | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `E2E-0015-AC3` | [AC-3](#ac-3) | tab host mendukung buka, tutup, pindah aktif, dan menampung konten fitur lewat router outlet atau portal; state tiap tab terisolasi.                             | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `E2E-0015-AC4` | [AC-4](#ac-4) | infrastruktur context menu tersedia sebagai directive/service yang fitur pakai untuk menu klik kanan; satu menu terbuka pada satu waktu; bisa diakses keyboar... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `E2E-0015-AC5` | [AC-5](#ac-5) | routing kerangka terdefinisi untuk semua fitur V1 sebagai lazy route (initial-setup, auth, connections, workspace, explorer, database, schema, table-designer... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `E2E-0015-AC7` | [AC-7](#ac-7) | navigasi utama, toggle sidebar, perpindahan tab, dan menutup dialog dapat dijalankan dengan keyboard; fokus terlihat; landmark ARIA dasar terpasang (FR-UI-05... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

### Security

Tidak ada security yang diwajibkan oleh acceptance criteria saat ini.

### Performance

Tidak ada performance yang diwajibkan oleh acceptance criteria saat ini.

### Visual dan accessibility

| ID             | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                    | Expected result                                      |
| -------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `VIS-0015-AC1` | [AC-1](#ac-1) | app shell terdiri dari top bar (branding, menu user placeholder, toggle theme), sidebar kiri yang bisa dilipat, area workspace dengan tab host, panel bawah o... | Kunci viewport, mode warna, state komponen, interaksi keyboard, dan bukti screenshot. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `VIS-0015-AC4` | [AC-4](#ac-4) | infrastruktur context menu tersedia sebagai directive/service yang fitur pakai untuk menu klik kanan; satu menu terbuka pada satu waktu; bisa diakses keyboar... | Kunci viewport, mode warna, state komponen, interaksi keyboard, dan bukti screenshot. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `VIS-0015-AC7` | [AC-7](#ac-7) | navigasi utama, toggle sidebar, perpindahan tab, dan menutup dialog dapat dijalankan dengan keyboard; fokus terlihat; landmark ARIA dasar terpasang (FR-UI-05... | Kunci viewport, mode warna, state komponen, interaksi keyboard, dan bukti screenshot. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |
| `VIS-0015-AC8` | [AC-8](#ac-8) | layout tidak rusak pada lebar 1024 px; di bawah itu sidebar otomatis menjadi overlay.                                                                            | Kunci viewport, mode warna, state komponen, interaksi keyboard, dan bukti screenshot. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

### Smoke dan operational acceptance

Tidak ada smoke dan operational yang diwajibkan oleh acceptance criteria saat ini.

### Manual atau external proof

| ID                | AC            | Fokus                                                                                                                                                            | Scenario terencana                                                                               | Expected result                                      |
| ----------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `MANUAL-0015-AC1` | [AC-1](#ac-1) | app shell terdiri dari top bar (branding, menu user placeholder, toggle theme), sidebar kiri yang bisa dilipat, area workspace dengan tab host, panel bawah o... | Lakukan review manusia atau kumpulkan bukti eksternal yang tidak dapat digantikan test otomatis. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |

## Critical test scenarios

- Happy path: buka dua tab, pindah, tutup satu, ukuran panel berubah, verifikasi **AC-2**, **AC-3**.
- Keyboard: navigasi sidebar dan tab tanpa mouse, verifikasi **AC-7**.
- Error: fitur melempar error render → boundary menampilkan fallback, shell tetap hidup, verifikasi **AC-6**.

## Staged, environment, dan external proof

Tidak ada staged, environment, atau external proof khusus yang sudah diidentifikasi.

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
