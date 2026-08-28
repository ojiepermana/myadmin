# Test dan acceptance criteria 0016. Initial setup end to end

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Belum dijalankan
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0016.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

`GET /setup/status` publik mengembalikan `{ initialized }`; nilai berasal dari keberadaan user role admin.

### AC-2

saat belum terinisialisasi, semua route UI selain `/setup` dialihkan ke `/setup`, dan semua endpoint API non publik menjawab 409 `SETUP_REQUIRED`.

### AC-3

`POST /setup/admin` memvalidasi username (3 sampai 32 karakter, huruf angka titik strip bawah) dan password (policy spec 0010), membuat user admin, dan menjawab 201 dengan data user tanpa hash.

### AC-4

setup hanya bisa sukses sekali: dua request bersamaan menghasilkan tepat satu admin (transaksi plus pemeriksaan dalam transaksi); percobaan setelah terinisialisasi menjawab 409 `ALREADY_INITIALIZED`; tidak ada jalur mengulang setup dari API.

### AC-5

setelah setup sukses, UI mengarahkan ke halaman login (auto login tidak dilakukan; sesi lahir hanya lewat login, spec 0017).

### AC-6

endpoint setup di rate limit per IP (maksimum 5 percobaan per menit) untuk menahan brute force sebelum instance diklaim.

### AC-7

setup sukses tercatat sebagai audit event `auth.initial_admin.created` (memakai jalur audit sementara bila spec 0019 belum terpasang: tulis langsung lewat AuditRepository) tanpa memuat password.

### AC-8

halaman setup memakai komponen form foundation, menampilkan kekuatan validasi secara langsung, bisa diselesaikan dengan keyboard, dan menampilkan error `ApiError` lewat presenter spec 0015.

### AC-9

e2e Playwright: instance kosong → buka root → dialihkan ke setup → buat admin → diarahkan ke login; percobaan setup kedua ditolak.

## Matriks cakupan

| AC | Unit | Integration | Contract | E2E | Security | Performance | Visual | Smoke | Manual atau external |
|---|---|---|---|---|---|---|---|---|---|
| [AC-1](#ac-1) | n/a | `IT-0016-AC1` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-2](#ac-2) | n/a | n/a | n/a | `E2E-0016-AC2` | n/a | n/a | n/a | n/a | n/a |
| [AC-3](#ac-3) | n/a | `IT-0016-AC3` | n/a | n/a | `SEC-0016-AC3` | n/a | n/a | n/a | n/a |
| [AC-4](#ac-4) | n/a | `IT-0016-AC4` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-5](#ac-5) | n/a | n/a | n/a | `E2E-0016-AC5` | n/a | n/a | n/a | n/a | n/a |
| [AC-6](#ac-6) | n/a | n/a | n/a | n/a | `SEC-0016-AC6` | n/a | n/a | n/a | n/a |
| [AC-7](#ac-7) | n/a | `IT-0016-AC7` | n/a | n/a | `SEC-0016-AC7` | n/a | n/a | n/a | n/a |
| [AC-8](#ac-8) | n/a | n/a | n/a | `E2E-0016-AC8` | n/a | n/a | `VIS-0016-AC8` | n/a | n/a |
| [AC-9](#ac-9) | n/a | n/a | n/a | `E2E-0016-AC9` | n/a | n/a | n/a | n/a | n/a |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

Tidak ada unit yang diwajibkan oleh acceptance criteria saat ini.

## Integration test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `IT-0016-AC1` | [AC-1](#ac-1) | GET /setup/status publik mengembalikan { initialized }; nilai berasal dari keberadaan user role admin. | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `IT-0016-AC3` | [AC-3](#ac-3) | POST /setup/admin memvalidasi username (3 sampai 32 karakter, huruf angka titik strip bawah) dan password (policy spec 0010), membuat user admin, dan menjawa... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `IT-0016-AC4` | [AC-4](#ac-4) | setup hanya bisa sukses sekali: dua request bersamaan menghasilkan tepat satu admin (transaksi plus pemeriksaan dalam transaksi); percobaan setelah terinisia... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `IT-0016-AC7` | [AC-7](#ac-7) | setup sukses tercatat sebagai audit event auth.initial_admin.created (memakai jalur audit sementara bila spec 0019 belum terpasang: tulis langsung lewat Audi... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

## Test tambahan

### Contract test

Tidak ada contract yang diwajibkan oleh acceptance criteria saat ini.

### E2E

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `E2E-0016-AC2` | [AC-2](#ac-2) | saat belum terinisialisasi, semua route UI selain /setup dialihkan ke /setup, dan semua endpoint API non publik menjawab 409 SETUP_REQUIRED. | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `E2E-0016-AC5` | [AC-5](#ac-5) | setelah setup sukses, UI mengarahkan ke halaman login (auto login tidak dilakukan; sesi lahir hanya lewat login, spec 0017). | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `E2E-0016-AC8` | [AC-8](#ac-8) | halaman setup memakai komponen form foundation, menampilkan kekuatan validasi secara langsung, bisa diselesaikan dengan keyboard, dan menampilkan error ApiEr... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |
| `E2E-0016-AC9` | [AC-9](#ac-9) | e2e Playwright: instance kosong → buka root → dialihkan ke setup → buat admin → diarahkan ke login; percobaan setup kedua ditolak. | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-9 terpenuhi. |

### Security

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `SEC-0016-AC3` | [AC-3](#ac-3) | POST /setup/admin memvalidasi username (3 sampai 32 karakter, huruf angka titik strip bawah) dan password (policy spec 0010), membuat user admin, dan menjawa... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `SEC-0016-AC6` | [AC-6](#ac-6) | endpoint setup di rate limit per IP (maksimum 5 percobaan per menit) untuk menahan brute force sebelum instance diklaim. | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `SEC-0016-AC7` | [AC-7](#ac-7) | setup sukses tercatat sebagai audit event auth.initial_admin.created (memakai jalur audit sementara bila spec 0019 belum terpasang: tulis langsung lewat Audi... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

### Performance

Tidak ada performance yang diwajibkan oleh acceptance criteria saat ini.

### Visual dan accessibility

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `VIS-0016-AC8` | [AC-8](#ac-8) | halaman setup memakai komponen form foundation, menampilkan kekuatan validasi secara langsung, bisa diselesaikan dengan keyboard, dan menampilkan error ApiEr... | Kunci viewport, mode warna, state komponen, interaksi keyboard, dan bukti screenshot. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

### Smoke dan operational acceptance

Tidak ada smoke dan operational yang diwajibkan oleh acceptance criteria saat ini.

### Manual atau external proof

Tidak ada manual atau external yang diwajibkan oleh acceptance criteria saat ini.

## Critical test scenarios

- Happy path: e2e setup lengkap, verifikasi **AC-1**, **AC-3**, **AC-5**, **AC-9**.
- Race: dua POST paralel → satu 201 satu 409, tepat satu baris admin, verifikasi **AC-4**.
- Guard: sebelum setup, `GET /api/v1/auth/me` menjawab 409 SETUP_REQUIRED, verifikasi **AC-2**.

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
