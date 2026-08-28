# Test dan acceptance criteria 0004. Pipeline codegen dan contract test

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Belum dijalankan
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0004.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

`scripts/codegen/generate-contract-types.ts` menghasilkan tipe dari bundel OpenAPI ke `packages/api-contract/src/generated/`; hasilnya deterministik (dua kali generate menghasilkan byte yang sama).

### AC-2

CI menjalankan generate ulang lalu `git diff --exit-code` pada folder generated; drift membuat CI gagal.

### AC-3

harness contract test membuktikan cakupan dua arah: setiap operasi di kontrak punya route terimplementasi di server, dan setiap route terdaftar di server ada di kontrak; ketidakcocokan menyebut operasi yang hilang.

### AC-4

contract test memvalidasi bentuk response nyata server (minimal untuk enam path awal) terhadap schema kontrak; response yang menyimpang membuat test gagal dengan path field yang salah.

### AC-5

request tidak valid ke endpoint mana pun menghasilkan `ApiError` sesuai schema, dibuktikan test.

### AC-6

folder `src/generated/` dilindungi: aturan lint atau CI menolak edit manual (header file generated plus pemeriksaan drift).

### AC-7

workflow CI `contract.yml` menjalankan validasi kontrak (spec 0003), codegen drift, dan contract test.

## Matriks cakupan

| AC | Unit | Integration | Contract | E2E | Security | Performance | Visual | Smoke | Manual atau external |
|---|---|---|---|---|---|---|---|---|---|
| [AC-1](#ac-1) | n/a | n/a | `CT-0004-AC1` | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-2](#ac-2) | n/a | n/a | n/a | n/a | n/a | n/a | n/a | `SMOKE-0004-AC2` | n/a |
| [AC-3](#ac-3) | n/a | n/a | `CT-0004-AC3` | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-4](#ac-4) | n/a | n/a | `CT-0004-AC4` | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-5](#ac-5) | n/a | n/a | `CT-0004-AC5` | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-6](#ac-6) | n/a | `IT-0004-AC6` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-7](#ac-7) | n/a | n/a | n/a | n/a | n/a | n/a | n/a | `SMOKE-0004-AC7` | n/a |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

Tidak ada unit yang diwajibkan oleh acceptance criteria saat ini.

## Integration test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `IT-0004-AC6` | [AC-6](#ac-6) | folder src/generated/ dilindungi: aturan lint atau CI menolak edit manual (header file generated plus pemeriksaan drift). | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |

## Test tambahan

### Contract test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `CT-0004-AC1` | [AC-1](#ac-1) | scripts/codegen/generate-contract-types.ts menghasilkan tipe dari bundel OpenAPI ke packages/api-contract/src/generated/; hasilnya deterministik (dua kali ge... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `CT-0004-AC3` | [AC-3](#ac-3) | harness contract test membuktikan cakupan dua arah: setiap operasi di kontrak punya route terimplementasi di server, dan setiap route terdaftar di server ada... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `CT-0004-AC4` | [AC-4](#ac-4) | contract test memvalidasi bentuk response nyata server (minimal untuk enam path awal) terhadap schema kontrak; response yang menyimpang membuat test gagal de... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `CT-0004-AC5` | [AC-5](#ac-5) | request tidak valid ke endpoint mana pun menghasilkan ApiError sesuai schema, dibuktikan test. | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |

### E2E

Tidak ada e2e yang diwajibkan oleh acceptance criteria saat ini.

### Security

Tidak ada security yang diwajibkan oleh acceptance criteria saat ini.

### Performance

Tidak ada performance yang diwajibkan oleh acceptance criteria saat ini.

### Visual dan accessibility

Tidak ada visual dan accessibility yang diwajibkan oleh acceptance criteria saat ini.

### Smoke dan operational acceptance

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `SMOKE-0004-AC2` | [AC-2](#ac-2) | CI menjalankan generate ulang lalu git diff --exit-code pada folder generated; drift membuat CI gagal. | Jalankan artefak atau workflow pada environment bersih dan simpan bukti operasional. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `SMOKE-0004-AC7` | [AC-7](#ac-7) | workflow CI contract.yml menjalankan validasi kontrak (spec 0003), codegen drift, dan contract test. | Jalankan artefak atau workflow pada environment bersih dan simpan bukti operasional. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

### Manual atau external proof

Tidak ada manual atau external yang diwajibkan oleh acceptance criteria saat ini.

## Critical test scenarios

- Happy path: kontrak berubah → regenerasi → tipe berubah → compile error di pemakai yang belum menyesuaikan, verifikasi **AC-1**, **AC-2**.
- Failure case: route ditambah di server tanpa kontrak → contract test gagal menyebut route itu, verifikasi **AC-3**.
- Failure case: server mengembalikan field ekstra atau tipe salah → validasi ajv gagal menyebut path field, verifikasi **AC-4**.

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
