# Test dan acceptance criteria 0008. SQLite core dan migration runner

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Belum dijalankan
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0008.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

database dibuka dari `<data-dir>/myadmin.db` dengan pragma: `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout` 5000 ms, `synchronous=NORMAL`; pragma diterapkan di satu tempat (`database/pragmas.ts`).

### AC-2

runner migrasi menjalankan migrasi bernomor berurutan dari `migrations/`, masing masing dalam transaksi, mencatat ke tabel `migrations` (version, name, applied_at, checksum); menjalankan ulang tanpa migrasi baru adalah no op.

### AC-3

checksum migrasi yang sudah diterapkan diverifikasi; file migrasi lama yang berubah membuat start gagal dengan pesan jelas (skema riwayat tidak boleh ditulis ulang).

### AC-4

migrasi `0001-initial` membuat sebelas tabel sesuai data model terkonfirmasi (lihat Feature design) lengkap dengan primary key, foreign key, unique constraint, dan index yang disebutkan.

### AC-5

kegagalan membuka atau memigrasi database menghentikan boot dengan exit code bukan nol dan pesan aman (NFR-02); database tidak tertinggal setengah termigrasi (transaksi per migrasi).

### AC-6

helper transaksi tersedia (`database/transaction.ts`) dengan dukungan nested lewat savepoint, dipakai repositories (spec 0009).

### AC-7

shutdown rapi menjalankan checkpoint WAL supaya file db aman disalin saat proses mati.

### AC-8

integration test membuktikan: migrasi dari kosong, idempotensi, checksum mismatch gagal, foreign key ditegakkan.

## Matriks cakupan

| AC | Unit | Integration | Contract | E2E | Security | Performance | Visual | Smoke | Manual atau external |
|---|---|---|---|---|---|---|---|---|---|
| [AC-1](#ac-1) | n/a | `IT-0008-AC1` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-2](#ac-2) | n/a | `IT-0008-AC2` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-3](#ac-3) | n/a | `IT-0008-AC3` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-4](#ac-4) | n/a | `IT-0008-AC4` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-5](#ac-5) | n/a | `IT-0008-AC5` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-6](#ac-6) | n/a | `IT-0008-AC6` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-7](#ac-7) | n/a | `IT-0008-AC7` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-8](#ac-8) | n/a | `IT-0008-AC8` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

Tidak ada unit yang diwajibkan oleh acceptance criteria saat ini.

## Integration test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `IT-0008-AC1` | [AC-1](#ac-1) | database dibuka dari <data-dir>/myadmin.db dengan pragma: journal_mode=WAL, foreign_keys=ON, busy_timeout 5000 ms, synchronous=NORMAL; pragma diterapkan di s... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `IT-0008-AC2` | [AC-2](#ac-2) | runner migrasi menjalankan migrasi bernomor berurutan dari migrations/, masing masing dalam transaksi, mencatat ke tabel migrations (version, name, applied_a... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `IT-0008-AC3` | [AC-3](#ac-3) | checksum migrasi yang sudah diterapkan diverifikasi; file migrasi lama yang berubah membuat start gagal dengan pesan jelas (skema riwayat tidak boleh ditulis... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `IT-0008-AC4` | [AC-4](#ac-4) | migrasi 0001-initial membuat sebelas tabel sesuai data model terkonfirmasi (lihat Feature design) lengkap dengan primary key, foreign key, unique constraint,... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `IT-0008-AC5` | [AC-5](#ac-5) | kegagalan membuka atau memigrasi database menghentikan boot dengan exit code bukan nol dan pesan aman (NFR-02); database tidak tertinggal setengah termigrasi... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `IT-0008-AC6` | [AC-6](#ac-6) | helper transaksi tersedia (database/transaction.ts) dengan dukungan nested lewat savepoint, dipakai repositories (spec 0009). | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `IT-0008-AC7` | [AC-7](#ac-7) | shutdown rapi menjalankan checkpoint WAL supaya file db aman disalin saat proses mati. | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |
| `IT-0008-AC8` | [AC-8](#ac-8) | integration test membuktikan: migrasi dari kosong, idempotensi, checksum mismatch gagal, foreign key ditegakkan. | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

## Test tambahan

### Contract test

Tidak ada contract yang diwajibkan oleh acceptance criteria saat ini.

### E2E

Tidak ada e2e yang diwajibkan oleh acceptance criteria saat ini.

### Security

Tidak ada security yang diwajibkan oleh acceptance criteria saat ini.

### Performance

Tidak ada performance yang diwajibkan oleh acceptance criteria saat ini.

### Visual dan accessibility

Tidak ada visual dan accessibility yang diwajibkan oleh acceptance criteria saat ini.

### Smoke dan operational acceptance

Tidak ada smoke dan operational yang diwajibkan oleh acceptance criteria saat ini.

### Manual atau external proof

Tidak ada manual atau external yang diwajibkan oleh acceptance criteria saat ini.

## Critical test scenarios

- Happy path: dari file kosong ke skema penuh, jalankan dua kali, riwayat satu kali, verifikasi **AC-2**, **AC-4**.
- Failure case: migrasi 0001 diubah setelah diterapkan → boot gagal menyebut checksum, verifikasi **AC-3**.
- Integritas: insert `connection_credentials` tanpa `connections` induk gagal foreign key, verifikasi **AC-1**, **AC-4**.

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
