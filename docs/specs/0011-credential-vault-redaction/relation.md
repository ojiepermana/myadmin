# Relation 0011. Credential vault dan redaction

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Tujuan

Dokumen ini mencatat relasi yang memengaruhi urutan build, kontrak yang dikonsumsi, dan konsumen downstream. Jenis relasi dibedakan agar setiap mention `spec NNNN` tidak otomatis dianggap sebagai blocker.

## Legenda relasi

| Jenis | Makna |
|---|---|
| `requires` | Spec belum boleh dimulai sebelum dependency selesai. |
| `references` | Spec memakai keputusan atau istilah dari spec lain, tetapi bukan gerbang build langsung. |
| `enables` | Spec lain menjadikan spec ini dependency langsung. |
| `coordinates` | Perubahan perlu diselaraskan tanpa mengubah urutan build. |
| `deferred` | Kewajiban sengaja diteruskan ke spec yang lebih akhir. |
| `environment` | Kebutuhan layanan, runner, sertifikat, akun, atau resource manusia. |

## Prasyarat wajib

| Jenis | Spec | Sumber |
|---|---|---|
| `requires` | [0010. Key provider dan password hashing](../0010-key-provider-password-hashing/index.md) | Indeks build dan konteks spec |

Tidak ada dependency kelompok tambahan dari indeks.

## Konteks prasyarat dari spec utama

> spec 0010.

Baris di atas dipertahankan utuh. Bila bertentangan dengan tabel prasyarat wajib, selesaikan perbedaan melalui `/architect` sebelum implementasi.

## Kontrak repo global

- Seluruh dependency, script, instalasi, dan command test dimiliki satu `package.json` di akar repo sesuai spec 0001.
- `apps/*` dan `packages/*` adalah modul source. Keduanya tidak boleh memiliki `package.json` sendiri.
- Setiap command verifikasi dan test dijalankan dari akar repo, bukan dari manifest nested.

## Output dan konsumen langsung

| Jenis | Spec konsumen | Kontrak |
|---|---|---|
| `enables` | [0013. Package observability](../0013-observability-package/index.md) | Spec ini harus selesai sebelum konsumen dimulai |
| `enables` | [0019. Subsistem audit append only](../0019-audit-subsystem/index.md) | Spec ini harus selesai sebelum konsumen dimulai |
| `enables` | [0026. Connection manager: CRUD dan vault](../0026-connection-manager-crud/index.md) | Spec ini harus selesai sebelum konsumen dimulai |

## Relasi nonblocking dan handoff

| Jenis awal | Spec | Cara membaca relasi |
|---|---|---|
| `references` | [0008. SQLite core dan migration runner](../0008-sqlite-core-migrations/index.md) | Mention dalam spec utama bukan otomatis prasyarat. Baca konteks sebelum mengubah graph build. |
| `references` | [0009. Internal repositories](../0009-internal-repositories/index.md) | Mention dalam spec utama bukan otomatis prasyarat. Baca konteks sebelum mengubah graph build. |

## Prasyarat environment atau manusia

| Jenis | Kebutuhan | Bukti kesiapan |
|---|---|---|
| `environment` | Tidak ada prasyarat environment atau manusia yang dinyatakan eksplisit pada baris prasyarat. | Dicatat sebelum build atau verify dimulai. |

## Boundary lintas spec

- Perubahan kontrak yang dikonsumsi spec lain wajib memperbarui relasi dan spec konsumen yang terdampak.
- Perubahan acceptance criteria wajib dimulai dari [test.md](test.md#acceptance-criteria), lalu mirror pada [index.md](index.md#requirements) disinkronkan.
- Perubahan cara pembuktian tidak mengubah acceptance criteria. Catat perubahan tersebut pada [verify.md](verify.md).

## Handoff tertunda

Mention ke spec yang lebih akhir pada tabel relasi nonblocking adalah kandidat handoff. Sebelum implementasi, pemilik spec harus memastikan apakah relasinya `coordinates` atau `deferred` dan mencatat kewajiban yang benar bila ada.
