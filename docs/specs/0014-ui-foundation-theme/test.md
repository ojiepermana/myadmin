# Test dan acceptance criteria 0014. UI foundation dan theme

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Belum dijalankan
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0014.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

@ojiepermana/angular terpasang dari npm publik pada versi 22.1.7 atau lebih baru dengan versi terkunci di lockfile, termasuk peer opsional @angular/material bila komponen select, date picker, atau calendar dipakai; aplikasi web mengimpor theme dan providernya lewat `core/theme/` (`myadmin-theme.ts`, `theme.config.ts`).

### AC-2

mode light, dark, dan system bekerja: system mengikuti `prefers-color-scheme` dan berubah hidup saat OS berubah; perpindahan mode tidak memerlukan reload.

### AC-3

preferensi theme tersimpan: sebelum login di localStorage; setelah spec 0052 tersambung ke preferences server per user; struktur store (`theme-preference.store.ts`) sudah memisahkan sumber supaya penyambungan itu tidak mengubah pemakai.

### AC-4

identitas Myadmin didefinisikan sebagai konfigurasi theme (warna aksen, radius, tipografi, spacing) lewat mekanisme extension paket foundation, bukan CSS yang menimpa komponen.

### AC-5

audit kapabilitas terdokumentasi: daftar kebutuhan generik V1 (button, input, select, dialog, drawer, popover, tooltip, tabs, menu, breadcrumb, table/data grid, tree, form, toast, loading, resizable panel) dipetakan ke API paket foundation; setiap gap dicatat di Follow-up dengan rencana fallback yang tetap patuh aturan (minta penambahan di paket foundation, bukan membuat komponen generik lokal).

### AC-6

satu halaman demo internal (route dev saja, tidak masuk build production) menampilkan komponen inti pada kedua mode untuk verifikasi visual cepat.

### AC-7

aturan boundary/lint menolak import langsung design system lain di kode aplikasi (@angular/material, PrimeNG, Bootstrap) dan menolak pembuatan komponen bernama pola generik di `shared/` (daftar larangan dari struktur.md bagian 3); pengecualian tunggal: @angular/material boleh dipasang hanya pada `package.json` akar bila dibutuhkan untuk memenuhi peer dependency @ojiepermana/angular, tetapi tetap tidak boleh diimpor oleh kode `apps/web`.

## Matriks cakupan

| AC | Unit | Integration | Contract | E2E | Security | Performance | Visual | Smoke | Manual atau external |
|---|---|---|---|---|---|---|---|---|---|
| [AC-1](#ac-1) | n/a | n/a | n/a | n/a | n/a | n/a | n/a | `SMOKE-0014-AC1` | n/a |
| [AC-2](#ac-2) | n/a | n/a | n/a | `E2E-0014-AC2` | n/a | n/a | `VIS-0014-AC2` | n/a | n/a |
| [AC-3](#ac-3) | n/a | n/a | n/a | `E2E-0014-AC3` | n/a | n/a | n/a | n/a | n/a |
| [AC-4](#ac-4) | n/a | n/a | n/a | n/a | n/a | n/a | `VIS-0014-AC4` | n/a | `MANUAL-0014-AC4` |
| [AC-5](#ac-5) | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | `MANUAL-0014-AC5` |
| [AC-6](#ac-6) | n/a | n/a | n/a | n/a | n/a | n/a | `VIS-0014-AC6` | `SMOKE-0014-AC6` | n/a |
| [AC-7](#ac-7) | n/a | `IT-0014-AC7` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

Tidak ada unit yang diwajibkan oleh acceptance criteria saat ini.

## Integration test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `IT-0014-AC7` | [AC-7](#ac-7) | aturan boundary/lint menolak import langsung design system lain di kode aplikasi (@angular/material, PrimeNG, Bootstrap) dan menolak pembuatan komponen berna... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

## Test tambahan

### Contract test

Tidak ada contract yang diwajibkan oleh acceptance criteria saat ini.

### E2E

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `E2E-0014-AC2` | [AC-2](#ac-2) | mode light, dark, dan system bekerja: system mengikuti prefers-color-scheme dan berubah hidup saat OS berubah; perpindahan mode tidak memerlukan reload. | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `E2E-0014-AC3` | [AC-3](#ac-3) | preferensi theme tersimpan: sebelum login di localStorage; setelah spec 0052 tersambung ke preferences server per user; struktur store (theme-preference.stor... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |

### Security

Tidak ada security yang diwajibkan oleh acceptance criteria saat ini.

### Performance

Tidak ada performance yang diwajibkan oleh acceptance criteria saat ini.

### Visual dan accessibility

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `VIS-0014-AC2` | [AC-2](#ac-2) | mode light, dark, dan system bekerja: system mengikuti prefers-color-scheme dan berubah hidup saat OS berubah; perpindahan mode tidak memerlukan reload. | Kunci viewport, mode warna, state komponen, interaksi keyboard, dan bukti screenshot. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `VIS-0014-AC4` | [AC-4](#ac-4) | identitas Myadmin didefinisikan sebagai konfigurasi theme (warna aksen, radius, tipografi, spacing) lewat mekanisme extension paket foundation, bukan CSS yan... | Kunci viewport, mode warna, state komponen, interaksi keyboard, dan bukti screenshot. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `VIS-0014-AC6` | [AC-6](#ac-6) | satu halaman demo internal (route dev saja, tidak masuk build production) menampilkan komponen inti pada kedua mode untuk verifikasi visual cepat. | Kunci viewport, mode warna, state komponen, interaksi keyboard, dan bukti screenshot. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

### Smoke dan operational acceptance

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `SMOKE-0014-AC1` | [AC-1](#ac-1) | @ojiepermana/angular terpasang dari npm publik pada versi 22.1.7 atau lebih baru dengan versi terkunci di lockfile, termasuk peer opsional @angular/material... | Jalankan artefak atau workflow pada environment bersih dan simpan bukti operasional. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `SMOKE-0014-AC6` | [AC-6](#ac-6) | satu halaman demo internal (route dev saja, tidak masuk build production) menampilkan komponen inti pada kedua mode untuk verifikasi visual cepat. | Jalankan artefak atau workflow pada environment bersih dan simpan bukti operasional. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

### Manual atau external proof

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `MANUAL-0014-AC4` | [AC-4](#ac-4) | identitas Myadmin didefinisikan sebagai konfigurasi theme (warna aksen, radius, tipografi, spacing) lewat mekanisme extension paket foundation, bukan CSS yan... | Lakukan review manusia atau kumpulkan bukti eksternal yang tidak dapat digantikan test otomatis. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `MANUAL-0014-AC5` | [AC-5](#ac-5) | audit kapabilitas terdokumentasi: daftar kebutuhan generik V1 (button, input, select, dialog, drawer, popover, tooltip, tabs, menu, breadcrumb, table/data gr... | Lakukan review manusia atau kumpulkan bukti eksternal yang tidak dapat digantikan test otomatis. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |

## Critical test scenarios

- Happy path: ganti ke dark → seluruh shell berubah → reload → tetap dark, verifikasi **AC-2**, **AC-3**.
- System: preferensi system plus perubahan `prefers-color-scheme` termak, verifikasi **AC-2**.
- Boundary: PR yang menambah @angular/material gagal lint, verifikasi **AC-7**.

## Staged, environment, dan external proof

Tidak ada staged, environment, atau external proof khusus yang sudah diidentifikasi.

## Fixture dan environment

| Area | Aturan |
|---|---|
| Data | Gunakan data sintetis atau tersanitasi. Jangan memakai credential, token, atau data produksi nyata. |
| Resource | Database, file, port, process, dan container harus disposable serta memiliki cleanup deterministik. |
| Version | Pin versi environment yang dibuktikan. Jangan memakai label dinamis seperti `latest` sebagai bukti acceptance. |
| Root command | Instalasi dan command test selalu dimulai dari akar repo dan satu `package.json`. |

## Exit criteria test

- Setiap AC memiliki test ID atau jalur proof yang eksplisit pada [verify.md](verify.md).
- Unit dan integration test yang relevan diimplementasikan, lulus, dan dapat diulang dari checkout bersih.
- Test yang tidak relevan ditandai `n/a` dengan alasan yang tetap benar setelah implementasi.
- External proof tidak boleh diganti local smoke test. Staged proof tidak boleh ditutup sebelum dependency yang disebut tersedia.
- Tidak ada test yang dianggap lulus hanya karena file atau placeholder tersedia.
