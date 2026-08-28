# Relation 0054. Packaging binary dan smoke test

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

| Jenis      | Spec                                                                                | Sumber                        |
| ---------- | ----------------------------------------------------------------------------------- | ----------------------------- |
| `requires` | [0006. CLI runtime dan data directory](../0006-cli-runtime-data-directory/index.md) | Indeks build dan konteks spec |
| `requires` | [0053. Hardening keamanan lintas fitur](../0053-security-hardening/index.md)        | Indeks build dan konteks spec |

Tidak ada dependency kelompok atau prasyarat bernomor lain dari indeks. Alur P0 yang dipakai smoke test dicatat sebagai `references`, bukan sebagai build gate tambahan.

## Konteks prasyarat dari spec utama

> Prasyarat build: spec 0006 dan 0053. Referensi isi smoke test: spec 0016, 0017, dan 0026. `security.yml` dari spec 0053 adalah gerbang rilis.

Ringkasan ini sama dengan tabel `requires` di atas. Referensi isi smoke dan kebutuhan runner dicatat terpisah agar tidak menjadi prasyarat build bernomor baru.

## Kontrak repo global

- Seluruh dependency, script, instalasi, dan command test dimiliki satu `package.json` di akar repo sesuai spec 0001.
- `apps/*` dan `packages/*` adalah modul source. Keduanya tidak boleh memiliki `package.json` sendiri.
- Setiap command verifikasi dan test dijalankan dari akar repo, bukan dari manifest nested.

## Output dan konsumen langsung

| Jenis     | Spec konsumen                                                                                           | Kontrak                                         |
| --------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `enables` | [0055. Distribusi, signing, installer, dan dokumentasi operator](../0055-distribution-release/index.md) | Spec ini harus selesai sebelum konsumen dimulai |

## Relasi nonblocking dan handoff

| Jenis        | Spec                                                                                 | Cara membaca relasi                                                                        |
| ------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `references` | [0016. Initial setup end to end](../0016-initial-setup-flow/index.md)                | Alur setup yang dibuktikan smoke test; bukan gerbang build langsung.                       |
| `references` | [0017. Login, logout, dan session](../0017-login-session/index.md)                   | Alur login dan `/auth/me` yang dibuktikan smoke test; bukan gerbang build langsung.        |
| `references` | [0026. Connection manager: CRUD dan vault](../0026-connection-manager-crud/index.md) | Alur tambah dan connect database yang dibuktikan smoke test; bukan gerbang build langsung. |

## Prasyarat environment atau manusia

| Jenis         | Kebutuhan                                                                                                                                                                       | Bukti kesiapan                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `environment` | Matrix runner CI untuk lima target, runner yang dapat menjalankan smoke test, data directory dan database test yang disposable, serta hosted CI dengan tag dan artifact upload. | Disediakan sebelum packaging, smoke, atau release workflow proof yang terkait dijalankan. |

## Boundary lintas spec

- Perubahan kontrak yang dikonsumsi spec lain wajib memperbarui relasi dan spec konsumen yang terdampak.
- Perubahan acceptance criteria wajib dimulai dari [test.md](test.md#acceptance-criteria), lalu mirror pada [index.md](index.md#requirements) disinkronkan.
- Perubahan cara pembuktian tidak mengubah acceptance criteria. Catat perubahan tersebut pada [verify.md](verify.md).

## Handoff tertunda

Mention ke spec yang lebih akhir pada tabel relasi nonblocking adalah kandidat handoff. Sebelum implementasi, pemilik spec harus memastikan apakah relasinya `coordinates` atau `deferred` dan mencatat kewajiban yang benar bila ada.
