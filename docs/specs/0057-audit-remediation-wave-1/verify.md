# Verify 0057. Remediasi audit gelombang 1

**Date**: 2026-09-04
**Spec status**: mengikuti [index.md](index.md)
**Verdict**: Belum diverifikasi secara formal. Tabel di bawah mencatat hasil build plus self check `/develop`; `/check verify` belum dijalankan.
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Plan](plan.md)

## Ruang verifikasi

Verifikasi membuktikan perilaku implementasi terhadap seluruh acceptance criteria pada [test.md](test.md#acceptance-criteria). File ini tidak mengubah definisi AC dan tidak boleh diberi verdict lulus sebelum aplikasi, test, serta environment yang relevan benar benar dijalankan.

## Prasyarat eksekusi

| Kebutuhan    | Cara memeriksa                                                    | Status awal                        |
| ------------ | ----------------------------------------------------------------- | ---------------------------------- |
| Implementasi | Build plan pada `index.md` selesai untuk slice yang diverifikasi. | 14 dari 15                         |
| Test plan    | Test ID relevan pada `test.md` sudah diimplementasikan.           | UT dan MANUAL ya; IT dan E2E belum |
| Environment  | PostgreSQL dan MySQL disposable, browser, akses admin repository. | Belum diperiksa                    |

## Matriks verifikasi AC

| AC                     | Test atau proof ID            | Metode                  | Bukti wajib                                              | Result                                                                                                                                                                                                                        |
| ---------------------- | ----------------------------- | ----------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [AC-1](test.md#ac-1)   | `UT-0057-AC1`, `IT-0057-AC1`  | Unit, Integration       | output command; query filter lulus pada PostgreSQL nyata | PARTIAL. Unit test bentuk SQL lulus, dan builder nyata dijalankan terhadap PostgreSQL 18 lokal: filter dan search kembali mengembalikan baris, sebelumnya `invalid escape string`. Integration test yang di commit belum ada. |
| [AC-2](test.md#ac-2)   | `UT-0057-AC2`, `IT-0057-AC2`  | Unit, Integration       | output command; kunci di atas 2^53 pada kedua engine     | PARTIAL. Unit test presisi lulus pada kedua provider, dan UPDATE terhadap PostgreSQL 18 nyata mengenai tepat satu baris untuk kunci 9007199254740993, sebelumnya dua baris. Integration test yang di commit belum ada.        |
| [AC-3](test.md#ac-3)   | `UT-0057-AC3`, `IT-0057-AC3`  | Unit, Integration       | output command; akun MySQL tetap butuh password          | PARTIAL. Unit test penolakan lulus, dan semantik dikonfirmasi pada MySQL 9.7.1 nyata (`authentication_string` 70 byte menjadi 0 tanpa `BY`). Integration test yang di commit belum ada.                                       |
| [AC-4](test.md#ac-4)   | `UT-0057-AC4`                 | Unit                    | output command dan assertion pemetaan                    | PASS. `UT-0057-AC4` dijalankan dan lulus.                                                                                                                                                                                     |
| [AC-5](test.md#ac-5)   | `UT-0057-AC5`                 | Unit                    | output command; direktori upload bersih setelah restore  | PASS. `UT-0057-AC5` dijalankan dan lulus.                                                                                                                                                                                     |
| [AC-6](test.md#ac-6)   | `UT-0057-AC6`                 | Unit, Security          | output command; env subprocess tanpa secret              | PASS. `UT-0057-AC6` dijalankan dan lulus.                                                                                                                                                                                     |
| [AC-7](test.md#ac-7)   | `UT-0057-AC7`                 | Unit                    | output command dan assertion argumen                     | PASS. `UT-0057-AC7` dijalankan dan lulus.                                                                                                                                                                                     |
| [AC-8](test.md#ac-8)   | `UT-0057-AC8`, `IT-0057-AC8`  | Unit, Integration       | output command; correlation id respons sama dengan log   | PARTIAL. `UT-0057-AC8` lulus dan membuktikan correlation id respons sama dengan yang dicatat logger. Integration test lintas route belum ada.                                                                                 |
| [AC-9](test.md#ac-9)   | `UT-0057-AC9`, `E2E-0057-AC9` | Unit, E2E               | output command; proof aksesibilitas di browser           | PARTIAL. `UT-0057-AC9` merender komponen nyata dan membuktikan `role="status"` untuk sukses serta `role="alert"` untuk kegagalan. Proof aksesibilitas di browser belum dijalankan.                                            |
| [AC-10](test.md#ac-10) | `UT-0057-AC10`                | Unit                    | output command dan assertion konfigurasi                 | PASS. `UT-0057-AC10` membuktikan injector menyediakan NgZone zoneless.                                                                                                                                                        |
| [AC-11](test.md#ac-11) | `MANUAL-0057-AC11`            | Quality                 | output `test:fast`; tree bersih setelah run              | PASS. Output perintah tercatat pada evidence 2026-09-05.                                                                                                                                                                      |
| [AC-12](test.md#ac-12) | `UT-0057-AC12`                | Quality                 | output `matrix:ac --check`                               | PASS. `UT-0057-AC12` menguji aturannya langsung, termasuk bahwa skip dan fail tidak pernah menjadi bukti.                                                                                                                     |
| [AC-13](test.md#ac-13) | `MANUAL-0057-AC13`            | Operational (eksternal) | output `gh api` proteksi branch; run hosted hijau        | BLOCKED. `concurrency` dan determinisme realtime selesai; proteksi branch `main` belum ada dan butuh akses admin repository.                                                                                                  |
| [AC-14](test.md#ac-14) | `MANUAL-0057-AC14`            | Quality                 | output `lint` dan `typecheck`                            | PASS. Output perintah tercatat pada evidence 2026-09-05, termasuk uji diskriminatif `strictTemplates`.                                                                                                                        |
| [AC-15](test.md#ac-15) | `MANUAL-0057-AC15`            | Operational             | laporan komposisi bundle dan angka budget                | PASS. Output perintah tercatat pada evidence 2026-09-05; headroom 4,1 persen, di bawah target audit 15 persen.                                                                                                                |
