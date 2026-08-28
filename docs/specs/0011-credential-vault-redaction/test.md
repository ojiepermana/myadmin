# Test dan acceptance criteria 0011. Credential vault dan redaction

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Belum dijalankan
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0011.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

vault mengenkripsi payload credential (JSON berisi password/token/passphrase opsi rahasia) dengan AES-256-GCM: nonce acak 12 byte per enkripsi, tag autentikasi tersimpan, AAD berisi `connection_id` sehingga ciphertext tidak bisa dipindah antar baris.

### AC-2

hasil enkripsi tersimpan lewat `CredentialRepository` sebagai kolom terpisah: `ciphertext`, `nonce`, `algorithm` (`aes-256-gcm`), `key_id`; tidak ada format gabungan yang menyembunyikan metadata.

### AC-3

dekripsi memverifikasi `key_id` cocok dengan key aktif sebelum mencoba, dan gagal dengan error kategori jelas: `VAULT_KEY_MISMATCH`, `VAULT_INTEGRITY_FAILED` (tag tidak valid), tanpa membocorkan isi.

### AC-4

API vault mengembalikan plaintext hanya sebagai objek berumur pendek dengan metode `use(fn)` atau setara yang mendorong pemakaian sesaat; tidak ada API yang mengembalikan string password untuk disimpan bebas; plaintext tidak pernah dipersist, dikirim ke browser, atau dipancarkan WebSocket (FR-INT-04).

### AC-5

modul redaction menyediakan: (a) redaksi berbasis field name (password, secret, token, passphrase, key, credential, dan variasinya) untuk objek terstruktur, (b) redaksi berbasis pola untuk string bebas (connection string dengan password, nilai berlabel password), (c) registrasi nilai sesaat (plaintext yang sedang hidup) supaya nilai persisnya tersensor di mana pun muncul selama proses berjalan.

### AC-6

logger, error presenter transport, dan audit writer memakai redaction yang sama lewat satu API; test membuktikan secret yang disengaja bocor lewat ketiga jalur itu tersensor.

### AC-7

test keamanan di `tests/security/crypto/` dan `tests/security/redaction/` membuktikan: ciphertext berbeda untuk plaintext sama (nonce acak), AAD mengikat connection_id, round trip utuh, dan tidak ada plaintext di file SQLite setelah menyimpan koneksi (pemeriksaan byte pada file db di test).

## Matriks cakupan

| AC | Unit | Integration | Contract | E2E | Security | Performance | Visual | Smoke | Manual atau external |
|---|---|---|---|---|---|---|---|---|---|
| [AC-1](#ac-1) | n/a | n/a | n/a | n/a | `SEC-0011-AC1` | n/a | n/a | n/a | n/a |
| [AC-2](#ac-2) | n/a | `IT-0011-AC2` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-3](#ac-3) | n/a | n/a | n/a | n/a | `SEC-0011-AC3` | n/a | n/a | n/a | n/a |
| [AC-4](#ac-4) | n/a | n/a | n/a | n/a | `SEC-0011-AC4` | n/a | n/a | n/a | n/a |
| [AC-5](#ac-5) | `UT-0011-AC5` | n/a | n/a | n/a | `SEC-0011-AC5` | n/a | n/a | n/a | n/a |
| [AC-6](#ac-6) | n/a | `IT-0011-AC6` | n/a | n/a | `SEC-0011-AC6` | n/a | n/a | n/a | n/a |
| [AC-7](#ac-7) | n/a | `IT-0011-AC7` | n/a | n/a | `SEC-0011-AC7` | n/a | n/a | n/a | n/a |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `UT-0011-AC5` | [AC-5](#ac-5) | modul redaction menyediakan: (a) redaksi berbasis field name (password, secret, token, passphrase, key, credential, dan variasinya) untuk objek terstruktur,... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |

## Integration test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `IT-0011-AC2` | [AC-2](#ac-2) | hasil enkripsi tersimpan lewat CredentialRepository sebagai kolom terpisah: ciphertext, nonce, algorithm (aes-256-gcm), key_id; tidak ada format gabungan yan... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `IT-0011-AC6` | [AC-6](#ac-6) | logger, error presenter transport, dan audit writer memakai redaction yang sama lewat satu API; test membuktikan secret yang disengaja bocor lewat ketiga jal... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `IT-0011-AC7` | [AC-7](#ac-7) | test keamanan di tests/security/crypto/ dan tests/security/redaction/ membuktikan: ciphertext berbeda untuk plaintext sama (nonce acak), AAD mengikat connect... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

## Test tambahan

### Contract test

Tidak ada contract yang diwajibkan oleh acceptance criteria saat ini.

### E2E

Tidak ada e2e yang diwajibkan oleh acceptance criteria saat ini.

### Security

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `SEC-0011-AC1` | [AC-1](#ac-1) | vault mengenkripsi payload credential (JSON berisi password/token/passphrase opsi rahasia) dengan AES-256-GCM: nonce acak 12 byte per enkripsi, tag autentika... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `SEC-0011-AC3` | [AC-3](#ac-3) | dekripsi memverifikasi key_id cocok dengan key aktif sebelum mencoba, dan gagal dengan error kategori jelas: VAULT_KEY_MISMATCH, VAULT_INTEGRITY_FAILED (tag... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `SEC-0011-AC4` | [AC-4](#ac-4) | API vault mengembalikan plaintext hanya sebagai objek berumur pendek dengan metode use(fn) atau setara yang mendorong pemakaian sesaat; tidak ada API yang me... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `SEC-0011-AC5` | [AC-5](#ac-5) | modul redaction menyediakan: (a) redaksi berbasis field name (password, secret, token, passphrase, key, credential, dan variasinya) untuk objek terstruktur,... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `SEC-0011-AC6` | [AC-6](#ac-6) | logger, error presenter transport, dan audit writer memakai redaction yang sama lewat satu API; test membuktikan secret yang disengaja bocor lewat ketiga jal... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `SEC-0011-AC7` | [AC-7](#ac-7) | test keamanan di tests/security/crypto/ dan tests/security/redaction/ membuktikan: ciphertext berbeda untuk plaintext sama (nonce acak), AAD mengikat connect... | Uji jalur sukses dan penyalahgunaan tanpa mencatat credential atau secret nyata. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

### Performance

Tidak ada performance yang diwajibkan oleh acceptance criteria saat ini.

### Visual dan accessibility

Tidak ada visual dan accessibility yang diwajibkan oleh acceptance criteria saat ini.

### Smoke dan operational acceptance

Tidak ada smoke dan operational yang diwajibkan oleh acceptance criteria saat ini.

### Manual atau external proof

Tidak ada manual atau external yang diwajibkan oleh acceptance criteria saat ini.

## Critical test scenarios

- Happy path: simpan koneksi dengan password → file db tidak mengandung byte password → connect mendekripsi dan memakai, verifikasi **AC-1**, **AC-4**, **AC-7**.
- Failure case: ciphertext baris A dipasang ke baris B → `VAULT_INTEGRITY_FAILED`, verifikasi **AC-1**, **AC-3**.
- Redaksi: error driver berisi password terdaftar → log dan response tersensor, verifikasi **AC-5**, **AC-6**.

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
