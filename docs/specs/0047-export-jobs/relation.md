# Relation 0047. Export

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
| `requires` | [0028. Jobs infrastructure](../0028-jobs-infrastructure/index.md) | Indeks build dan konteks spec |
| `requires` | [0029. Realtime WebSocket dan klien SDK](../0029-realtime-websocket/index.md) | Indeks build dan konteks spec |
| `requires` | [0037. Data browser: jalur baca](../0037-data-browser-read/index.md) | Indeks build dan konteks spec |

Tidak ada dependency kelompok tambahan dari indeks.

## Konteks prasyarat dari spec utama

> spec 0028, 0029, 0037. Mengaktifkan jalur "export semua baris" pada tombol result grid (spec 0034 AC-5).

Baris di atas dipertahankan utuh. Bila bertentangan dengan tabel prasyarat wajib, selesaikan perbedaan melalui `/architect` sebelum implementasi.

## Kontrak repo global

- Seluruh dependency, script, instalasi, dan command test dimiliki satu `package.json` di akar repo sesuai spec 0001.
- `apps/*` dan `packages/*` adalah modul source. Keduanya tidak boleh memiliki `package.json` sendiri.
- Setiap command verifikasi dan test dijalankan dari akar repo, bukan dari manifest nested.

## Output dan konsumen langsung

| Jenis | Spec konsumen | Kontrak |
|---|---|---|
| `enables` | [0048. Import](../0048-import-jobs/index.md) | Spec ini harus selesai sebelum konsumen dimulai |

## Relasi nonblocking dan handoff

| Jenis awal | Spec | Cara membaca relasi |
|---|---|---|
| `references` | [0006. CLI runtime dan data directory](../0006-cli-runtime-data-directory/index.md) | Mention dalam spec utama bukan otomatis prasyarat. Baca konteks sebelum mengubah graph build. |
| `references` | [0034. Result grid dan export result](../0034-result-grid-export/index.md) | Mention dalam spec utama bukan otomatis prasyarat. Baca konteks sebelum mengubah graph build. |

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
