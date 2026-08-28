# Relation 0053. Hardening keamanan lintas fitur

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Tujuan

Dokumen ini mencatat relasi yang memengaruhi urutan build, kontrak yang dikonsumsi, dan konsumen downstream. Jenis relasi dibedakan agar setiap mention `spec NNNN` tidak otomatis dianggap sebagai blocker.

## Legenda relasi

| Jenis         | Makna                                                                                    |
| ------------- | ---------------------------------------------------------------------------------------- |
| `requires`    | Spec belum boleh dimulai sebelum dependency selesai.                                     |
| `references`  | Spec memakai keputusan atau istilah dari spec lain, tetapi bukan gerbang build langsung. |
| `enables`     | Spec lain menjadikan spec ini dependency langsung.                                       |
| `coordinates` | Perubahan perlu diselaraskan tanpa mengubah urutan build.                                |
| `deferred`    | Kewajiban sengaja diteruskan ke spec yang lebih akhir.                                   |
| `environment` | Kebutuhan layanan, runner, sertifikat, akun, atau resource manusia.                      |

## Prasyarat build

| Jenis      | Dependency                                       | Sumber                              |
| ---------- | ------------------------------------------------ | ----------------------------------- |
| `requires` | Seluruh fitur P0 (kelompok, bukan spec bernomor) | Indeks build dan definisi prioritas |

Tidak ada prasyarat spec bernomor terpisah. Definisi canonical P0 berada di [v1-feature-specification.md](../../../plan/v1-feature-specification.md#tingkat-prioritas); dependency ini tetap diperlakukan sebagai gate kelompok, bukan synthetic numbered edge.

## Konteks prasyarat dari spec utama

> Prasyarat build: seluruh fitur P0 selesai. Spec ini idealnya dijalankan saat fitur P1 sudah lengkap, tetapi P1 bukan gate build.

Ringkasan ini sama dengan tabel `requires` di atas. Spec bernomor yang menjadi sumber pola atau kontrak dicatat pada tabel `references` dan tidak menambah gerbang build.

## Kontrak repo global

- Seluruh dependency, script, instalasi, dan command test dimiliki satu `package.json` di akar repo sesuai spec 0001.
- `apps/*` dan `packages/*` adalah modul source. Keduanya tidak boleh memiliki `package.json` sendiri.
- Setiap command verifikasi dan test dijalankan dari akar repo, bukan dari manifest nested.

## Output dan konsumen langsung

| Jenis     | Spec konsumen                                                                    | Kontrak                                         |
| --------- | -------------------------------------------------------------------------------- | ----------------------------------------------- |
| `enables` | [0054. Packaging binary dan smoke test](../0054-binary-packaging-smoke/index.md) | Spec ini harus selesai sebelum konsumen dimulai |

## Relasi nonblocking dan handoff

| Jenis awal   | Spec                                                                                | Cara membaca relasi                                                                           |
| ------------ | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `references` | [0011. Credential vault dan redaction](../0011-credential-vault-redaction/index.md) | Modul redaction yang disweep lintas saluran; bukan gerbang build langsung.                    |
| `references` | [0013. Package observability](../0013-observability-package/index.md)               | Saluran logging dan observability yang masuk cakupan hardening; bukan gerbang build langsung. |
| `references` | [0017. Login, logout, dan session](../0017-login-session/index.md)                  | Sumber pola sesi dan otorisasi untuk matriks lintas fitur; bukan gerbang build langsung.      |
| `references` | [0019. Subsistem audit append only](../0019-audit-subsystem/index.md)               | Taksonomi audit untuk pemeriksaan operasi destructive; bukan gerbang build langsung.          |

## Prasyarat environment atau manusia

| Jenis         | Kebutuhan                                                                                                              | Bukti kesiapan                                                     |
| ------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `environment` | Runner CI yang dapat menjalankan `security.yml`, resource SQLite test yang disposable, dan hosted CI untuk proof AC-8. | Disediakan sebelum security suite atau hosted CI proof dijalankan. |

## Boundary lintas spec

- Perubahan kontrak yang dikonsumsi spec lain wajib memperbarui relasi dan spec konsumen yang terdampak.
- Perubahan acceptance criteria wajib dimulai dari [test.md](test.md#acceptance-criteria), lalu mirror pada [index.md](index.md#requirements) disinkronkan.
- Perubahan cara pembuktian tidak mengubah acceptance criteria. Catat perubahan tersebut pada [verify.md](verify.md).

## Handoff tertunda

Mention ke spec yang lebih akhir pada tabel relasi nonblocking adalah kandidat handoff. Sebelum implementasi, pemilik spec harus memastikan apakah relasinya `coordinates` atau `deferred` dan mencatat kewajiban yang benar bila ada.
