# Test dan acceptance criteria 0019. Subsistem audit append only

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Belum dijalankan
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0019.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

taksonomi event terdefinisi dengan penamaan `domain.aksi` (contoh: `auth.login_succeeded`, `auth.login_failed`, `connection.created`, `connection.deleted`, `table.dropped`, `security.privilege_granted`, `import.completed`, `backup.completed`, `restore.completed`) dalam satu modul `events/` yang menjadi daftar tertutup; event baru ditambahkan lewat modul itu, bukan string bebas.

### AC-2

`AuditWriter.record(event)` menerima bentuk terstruktur: action, actorUserId (nullable untuk kegagalan pra login), targetType, targetRef (nama object, tanpa isi data), connectionId nullable, result (`success`/`failure`/`denied`), details objek kecil; seluruh payload melewati `Redaction.redactObject` sebelum tulis.

### AC-3

API `withAudit(event, fn)` menjalankan `fn`, lalu menulis event dengan result sesuai hasil, dan baru mengembalikan; kegagalan menulis audit untuk aksi wajib audit membuat operasi dianggap gagal (response error, bukan sukses tanpa audit); daftar aksi wajib audit dari FR-AUD-01 dikodekan sebagai flag di taksonomi.

### AC-4

correlation ID request (spec 0013) otomatis terlampir pada setiap event.

### AC-5

tidak ada API update atau delete pada audit; percobaan menghapus lewat SQL bukan bagian aplikasi (dilindungi review dan tidak ada jalurnya di kode).

### AC-6

kegagalan login dicatat dengan username yang dicoba pada `details.usernameAttempted` hanya bila lolos redaction dan dibatasi panjang; tanpa password dalam bentuk apa pun.

### AC-7

unit test membuktikan: urutan sukses menunggu audit, kegagalan audit menggagalkan aksi wajib, redaction bekerja pada details, dan taksonomi menolak action di luar daftar.

### AC-8

retensi V1: audit tidak dipangkas otomatis; ukuran dipantau lewat doctor check informasional (jumlah baris, perkiraan ukuran); pemangkasan adalah keputusan V2.

## Matriks cakupan

| AC | Unit | Integration | Contract | E2E | Security | Performance | Visual | Smoke | Manual atau external |
|---|---|---|---|---|---|---|---|---|---|
| [AC-1](#ac-1) | `UT-0019-AC1` | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-2](#ac-2) | n/a | `IT-0019-AC2` | n/a | n/a | `SEC-0019-AC2` | n/a | n/a | n/a | n/a |
| [AC-3](#ac-3) | `UT-0019-AC3` | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-4](#ac-4) | n/a | `IT-0019-AC4` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-5](#ac-5) | n/a | n/a | `CT-0019-AC5` | n/a | n/a | n/a | n/a | n/a | `MANUAL-0019-AC5` |
| [AC-6](#ac-6) | n/a | n/a | n/a | n/a | `SEC-0019-AC6` | n/a | n/a | n/a | n/a |
| [AC-7](#ac-7) | `UT-0019-AC7` | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-8](#ac-8) | n/a | `IT-0019-AC8` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `UT-0019-AC1` | [AC-1](#ac-1) | taksonomi event terdefinisi dengan penamaan domain.aksi (contoh: auth.login_succeeded, auth.login_failed, connection.created, connection.deleted, table.dropp... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `UT-0019-AC3` | [AC-3](#ac-3) | API withAudit(event, fn) menjalankan fn, lalu menulis event dengan result sesuai hasil, dan baru mengembalikan; kegagalan menulis audit untuk aksi wajib audi... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `UT-0019-AC7` | [AC-7](#ac-7) | unit test membuktikan: urutan sukses menunggu audit, kegagalan audit menggagalkan aksi wajib, redaction bekerja pada details, dan taksonomi menolak action di... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

## Integration test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `IT-0019-AC2` | [AC-2](#ac-2) | AuditWriter.record(event) menerima bentuk terstruktur: action, actorUserId (nullable untuk kegagalan pra login), targetType, targetRef (nama object, tanpa is... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `IT-0019-AC4` | [AC-4](#ac-4) | correlation ID request (spec 0013) otomatis terlampir pada setiap event. | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `IT-0019-AC8` | [AC-8](#ac-8) | retensi V1: audit tidak dipangkas otomatis; ukuran dipantau lewat doctor check informasional (jumlah baris, perkiraan ukuran); pemangkasan adalah keputusan V2. | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

## Test tambahan

### Contract test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `CT-0019-AC5` | [AC-5](#ac-5) | tidak ada API update atau delete pada audit; percobaan menghapus lewat SQL bukan bagian aplikasi (dilindungi review dan tidak ada jalurnya di kode). | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |

### E2E

Tidak ada e2e yang diwajibkan oleh acceptance criteria saat ini.

### Security

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `SEC-0019-AC2` | [AC-2](#ac-2) | AuditWriter.record(event) menerima bentuk terstruktur: action, actorUserId (nullable untuk kegagalan pra login), targetType, targetRef (nama object, tanpa is... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `SEC-0019-AC6` | [AC-6](#ac-6) | kegagalan login dicatat dengan username yang dicoba pada details.usernameAttempted hanya bila lolos redaction dan dibatasi panjang; tanpa password dalam bent... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

### Performance

Tidak ada performance yang diwajibkan oleh acceptance criteria saat ini.

### Visual dan accessibility

Tidak ada visual dan accessibility yang diwajibkan oleh acceptance criteria saat ini.

### Smoke dan operational acceptance

Tidak ada smoke dan operational yang diwajibkan oleh acceptance criteria saat ini.

### Manual atau external proof

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `MANUAL-0019-AC5` | [AC-5](#ac-5) | tidak ada API update atau delete pada audit; percobaan menghapus lewat SQL bukan bagian aplikasi (dilindungi review dan tidak ada jalurnya di kode). | Lakukan review manusia atau kumpulkan bukti eksternal yang tidak dapat digantikan test otomatis. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |

## Critical test scenarios

- Urutan: aksi wajib audit dengan writer di fail kan → response error, tanpa efek "sukses diam diam", verifikasi **AC-3**.
- Redaksi: details berisi field password → tersensor di baris tersimpan, verifikasi **AC-2**.
- Korelasi: event dalam satu request memuat correlation yang sama dengan log, verifikasi **AC-4**.

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
