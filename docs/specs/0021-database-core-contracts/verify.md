# Verify 0021. Kontrak database-core, capability model, dan registry

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Verdict**: Belum diverifikasi
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md)

## Ruang verifikasi

Verifikasi membuktikan perilaku implementasi terhadap seluruh acceptance criteria pada [test.md](test.md#acceptance-criteria). File ini tidak mengubah definisi AC dan tidak boleh diberi verdict lulus sebelum aplikasi, test, serta environment yang relevan benar benar dijalankan.

## Prasyarat eksekusi

| Kebutuhan     | Cara memeriksa                                                                   | Status awal                    |
| ------------- | -------------------------------------------------------------------------------- | ------------------------------ |
| Implementasi  | Build plan pada `index.md` selesai untuk slice yang diverifikasi.                | Tersedia; bukti lokal tercatat |
| Dependency    | Semua relation `requires` pada `relation.md` sudah diterima.                     | Belum diperiksa                |
| Root manifest | Tepat satu `package.json` ada di akar dan tidak ada manifest nested.             | Belum diperiksa                |
| Test plan     | Test ID relevan pada `test.md` sudah diimplementasikan.                          | Belum siap                     |
| Environment   | Service, database, browser, VM, certificate, atau akun yang dibutuhkan tersedia. | Belum diperiksa                |

## Matriks verifikasi AC

| AC                   | Test atau proof ID               | Metode                         | Bukti wajib                                                         | Result                                                                                                                     |
| -------------------- | -------------------------------- | ------------------------------ | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [AC-1](test.md#ac-1) | `CT-0021-AC1`                    | Contract                       | output command dan assertion                                        | Lulus lokal pada contract suite                                                                                            |
| [AC-2](test.md#ac-2) | `CT-0021-AC2`                    | Contract                       | output command dan assertion                                        | Lulus lokal pada contract suite                                                                                            |
| [AC-3](test.md#ac-3) | `UT-0021-AC3`, `CT-0021-AC3`     | Unit, Contract                 | output command dan assertion                                        | Lulus lokal pada contract suite                                                                                            |
| [AC-4](test.md#ac-4) | `UT-0021-AC4`, `SEC-0021-AC4`    | Unit, Security                 | output command dan assertion; log tersanitasi tanpa secret          | Lulus lokal pada contract/security suite                                                                                   |
| [AC-5](test.md#ac-5) | `UT-0021-AC5`, `CT-0021-AC5`     | Unit, Contract                 | output command dan assertion                                        | Lulus lokal pada contract suite                                                                                            |
| [AC-6](test.md#ac-6) | `UT-0021-AC6`, `SEC-0021-AC6`    | Unit, Security                 | output command dan assertion; log tersanitasi tanpa secret          | Lulus lokal pada contract/security suite                                                                                   |
| [AC-7](test.md#ac-7) | `CT-0021-AC7`                    | Contract                       | output command dan assertion                                        | Lulus lokal pada contract suite                                                                                            |
| [AC-8](test.md#ac-8) | `CT-0021-AC8`, `MANUAL-0021-AC8` | Contract, Manual atau external | output command dan assertion; review manusia atau artefak eksternal | Contract completeness lulus; review lokal Codex atas `port-contracts.md` selesai; external reviewer sign-off tidak diklaim |
| [AC-9](test.md#ac-9) | `CT-0021-AC9`                    | Contract                       | output command dan assertion                                        | Lulus lokal pada contract suite                                                                                            |

## Urutan verifikasi

1. Catat commit, versi Bun, sistem operasi, dan environment yang benar benar dipakai.
2. Dari akar repo, jalankan pemeriksaan satu manifest, lint, typecheck, serta command test yang tersedia pada `package.json` akar.
3. Jalankan seluruh test ID pada matriks sesuai jenisnya. Jangan mengganti integration atau operational proof dengan mock.
4. Kumpulkan manual, staged, environment, atau external proof yang ditetapkan. Jangan menandainya lulus bila dependency belum tersedia.
5. Simpan evidence yang tersanitasi, lalu isi result per AC dan verdict akhir.

## Pemeriksaan otomatis

| Area     | Command source                                        | Expected result                                                  |
| -------- | ----------------------------------------------------- | ---------------------------------------------------------------- |
| Unit     | Script root yang didaftarkan pada satu `package.json` | Semua `UT-0021-*` lulus dan memiliki assertion yang menutup AC.  |
| Contract | Script root yang didaftarkan pada satu `package.json` | Semua `CT-0021-*` lulus dan memiliki assertion yang menutup AC.  |
| Security | Script root yang didaftarkan pada satu `package.json` | Semua `SEC-0021-*` lulus dan memiliki assertion yang menutup AC. |

## Pemeriksaan manual, staged, environment, atau external

| ID                  | AC                   | Langkah atau dependency                                                        | Expected result                                                                     | Evidence  |
| ------------------- | -------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | --------- |
| `EVIDENCE-0021-AC8` | [AC-8](test.md#ac-8) | Review outcome AC secara langsung dan catat alasan bila tidak dapat diotomasi. | Seluruh kewajiban AC terbukti tanpa mengganti external proof dengan simulasi lokal. | Belum ada |

## Catatan eksekusi

| Waktu      | Commit       | Environment                                             | Hasil                                                                                                                                                                                          | Evidence                                                       |
| ---------- | ------------ | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 2026-08-30 | Working tree | Bun 1.4.0, macOS arm64, provider-neutral contract suite | **23 pass, 224 assertions**; core ports, documented port contracts, closed capabilities, secret boundaries, normalized errors, provider registry, dan PostgreSQL/MySQL source boundaries lulus | `bun test tests/contract/database-provider-acceptance.test.ts` |
| 2026-08-30 | Working tree | Dokumentasi `database-core`                             | Ringkasan perilaku seluruh port dan cross-port invariants tersedia untuk review; ini menyiapkan artefak manual, bukan menggantikan sign-off reviewer                                           | `port-contracts.md`                                            |

## Gap dan blocker

| AC        | Gap                                                                                                                | Dampak                          | Tindak lanjut                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------- | --------------------------------------------- |
| Tidak ada | Contract completeness dan review lokal sudah tercatat; external reviewer sign-off tetap bukan bagian yang diklaim. | Tidak ada gap lokal untuk AC-8. | Pertahankan review saat kontrak port berubah. |

## Verdict akhir

Belum diverifikasi. Status ini hanya boleh berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau.
