# Relation 0044. Manajemen view (CRUD GUI)

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

| Jenis      | Spec                                                                            | Sumber                        |
| ---------- | ------------------------------------------------------------------------------- | ----------------------------- |
| `requires` | [0019. Subsistem audit append only](../0019-audit-subsystem/index.md)           | Indeks build dan konteks spec |
| `requires` | [0031. Object explorer](../0031-object-explorer/index.md)                       | Indeks build dan konteks spec |
| `requires` | [0033. Query editor: tab dan eksekusi](../0033-query-editor-execution/index.md) | Indeks build dan konteks spec |

Tidak ada dependency kelompok atau prasyarat bernomor lain dari indeks.

## Konteks prasyarat dari spec utama

> Prasyarat build: spec 0019 (audit), 0031 (explorer), dan 0033 (komponen editor).

Ringkasan ini sama dengan tabel `requires` di atas. Spec yang hanya dirujuk dicatat pada tabel `references` dan tidak menjadi gerbang build.

## Kontrak repo global

- Seluruh dependency, script, instalasi, dan command test dimiliki satu `package.json` di akar repo sesuai spec 0001.
- `apps/*` dan `packages/*` adalah modul source. Keduanya tidak boleh memiliki `package.json` sendiri.
- Setiap command verifikasi dan test dijalankan dari akar repo, bukan dari manifest nested.

## Output dan konsumen langsung

Tidak ada konsumen langsung yang terdaftar sebagai dependency build pada indeks saat ini.

## Relasi nonblocking dan handoff

| Jenis awal   | Spec                                                                                                    | Cara membaca relasi                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `references` | [0021. Kontrak database-core, capability model, dan registry](../0021-database-core-contracts/index.md) | Kontrak `ViewPort` dan capability `viewEditor`; bukan gerbang build langsung. |
| `references` | [0023. Provider PostgreSQL: metadata dan introspeksi](../0023-postgresql-metadata/index.md)             | Definisi view dan metadata PostgreSQL; bukan gerbang build langsung.          |
| `references` | [0025. Provider MySQL: metadata dan introspeksi](../0025-mysql-metadata/index.md)                       | Definisi view dan metadata MySQL; bukan gerbang build langsung.               |
| `references` | [0037. Data browser: jalur baca](../0037-data-browser-read/index.md)                                    | Jalur read only saat view dibuka dari explorer; bukan gerbang build langsung. |
| `references` | [0041. Table designer: kolom dan properti](../0041-table-designer-columns/index.md)                     | Pola pratinjau DDL yang dipakai ulang; bukan gerbang build langsung.          |

## Prasyarat environment atau manusia

| Jenis         | Kebutuhan                                                                                                                                   | Bukti kesiapan                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `environment` | Database test PostgreSQL dan MySQL yang disposable dengan dukungan view, fixture metadata dependensi, serta browser untuk E2E kedua engine. | Disediakan sebelum integration atau E2E proof yang terkait dijalankan. |

## Boundary lintas spec

- Perubahan kontrak yang dikonsumsi spec lain wajib memperbarui relasi dan spec konsumen yang terdampak.
- Perubahan acceptance criteria wajib dimulai dari [test.md](test.md#acceptance-criteria), lalu mirror pada [index.md](index.md#requirements) disinkronkan.
- Perubahan cara pembuktian tidak mengubah acceptance criteria. Catat perubahan tersebut pada [verify.md](verify.md).

## Handoff tertunda

Mention ke spec yang lebih akhir pada tabel relasi nonblocking adalah kandidat handoff. Sebelum implementasi, pemilik spec harus memastikan apakah relasinya `coordinates` atau `deferred` dan mencatat kewajiban yang benar bila ada.
