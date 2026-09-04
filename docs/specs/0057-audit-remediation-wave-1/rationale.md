# Rationale 0057. Remediasi audit gelombang 1

**Date**: 2026-09-04
**Ratified**: 2026-09-05 oleh `/architect`
**Spec status**: mengikuti [index.md](index.md)
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md) | [Plan](plan.md)

## Aturan dokumen

- File ini memuat catatan keputusan: konteks, opsi yang ditimbang, alasan pemilihan, dan bukti pendukung yang terlalu besar untuk `index.md`.
- File ini tidak memuat acceptance criteria. Sumber normatif AC ada di [test.md](test.md#acceptance-criteria).
- `/develop` membaca `index.md`, bukan file ini. Isi di sini untuk manusia yang perlu tahu mengapa batasnya begini.

## Context

Audit codebase 2026-09-04 dijalankan terhadap commit `abe2aa9` di `main`, pada
titik ketika proyek punya 52.499 baris kode produksi, 56 spec, dan 275 commit
dalam tiga hari kalender. Audit menyimpulkan fondasi teknisnya kuat, tetapi
menemukan tiga hal yang menuntut tindakan cepat.

Pertama, tiga bug runtime yang merusak jalur pengguna: filter dan pencarian data
browser PostgreSQL selalu gagal (DB-1), identitas baris kehilangan presisi
sehingga UPDATE dan DELETE bisa mengenai baris tetangga (DB-2), dan edit
principal MySQL bisa menghasilkan akun tanpa password (DB-3).

Kedua, proses pembuktian proyek tidak sekuat klaimnya. Matrix evidence hanya
mencocokkan token ID di file source dan tidak pernah menjalankan test, branch
`main` tidak diproteksi, dan CI hosted pernah gagal serta pernah dibatalkan pada
SHA yang sama dengan run yang dinyatakan lolos. Ini adalah temuan yang paling
merusak, karena membuat seluruh klaim `Accepted` pada spec lain menjadi tidak
dapat dipercaya sampai gate diperbaiki.

Ketiga, duplikasi struktural yang tumbuh pada tiap fitur baru: cangkang HTTP
disalin ke 13 file route, builder data disalin di dua provider, pemuatan daftar
koneksi disalin di 10 halaman web.

Audit menyusun tiga gelombang perbaikan. Gelombang 1 adalah pekerjaan berisiko
rendah yang bisa selesai sendiri; gelombang 2 menyatukan yang digandakan;
gelombang 3 membangun untuk provider dan fitur berikutnya. Spec ini menutup
gelombang 1.

Spec ini lahir berstatus `Assumed`: `/develop` mencatatnya ketika pekerjaan
dimulai sebelum keputusannya dideliberasi. Dokumen ini adalah deliberasi yang
terhutang itu, dijalankan 2026-09-05.

## Options considered

### Keputusan 1: aturan batas gelombang 1

Pertanyaan yang terhutang adalah mana dari temuan audit yang menjadi kewajiban
normatif dengan acceptance criteria, dan sampai mana perbaikan berhenti.

| Opsi                                                            | Isi                                                                                 | Konsekuensi                                                                                                                                                 |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Batas mengikuti roadmap audit apa adanya                     | 15 AC yang menutup sepuluh baris pekerjaan gelombang 1                              | Sederhana dan dapat diaudit, tetapi mewarisi kelalaian roadmap tanpa memeriksanya                                                                           |
| B. Perluas sampai seluruh temuan bersevertias Tinggi dan Sedang | Menambah SRV-3, SRV-5, INF-4, INF-8, SRV-7, WEB-9 ke dalam spec ini                 | Menutup lebih banyak risiko, tetapi menarik pekerjaan effort M yang menyentuh kebijakan redaction dan config, sehingga gelombang 1 berhenti berisiko rendah |
| C. Batas mengikuti roadmap, ditambah triase eksplisit           | 15 AC apa adanya, ditambah penugasan gelombang untuk temuan yang dilewatkan roadmap | Build tetap utuh dan berisiko rendah, dan tidak ada temuan yang menghilang dari catatan                                                                     |

**Dipilih: C.**

### Keputusan 2: bentuk klausa `ESCAPE` pada MySQL

DB-1 hanya menyebut PostgreSQL. Implementasi memperbaiki PostgreSQL menjadi satu
backslash dan membiarkan MySQL mengirim dua, dengan dasar probe manual pada MySQL
9.7.1.

| Opsi                                        | Konsekuensi                                                                                                                             |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| A. Terima probe apa adanya                  | Tidak ada pekerjaan tambahan, tetapi klaim AC-1 untuk sisi MySQL berdiri di atas pengamatan yang tidak bisa diulang siapa pun           |
| B. Samakan kedua provider                   | Seragam dan sejalan arah dialect di core, tetapi mengubah jalur MySQL yang sekarang bekerja demi keseragaman yang belum ada tempatnya   |
| C. Pertahankan perbedaan, kunci dengan test | Perbedaan bentuk diakui sebagai perbedaan dialect yang sah, dan probe diubah menjadi bukti yang dapat diulang pada dua nilai `sql_mode` |

**Dipilih: C.**

### Keputusan 3: kewajiban di luar repo pada AC-13

AC-13 versi awal mencampur tiga hal dalam satu kriteria: `concurrency` pada
workflow, determinisme test realtime, dan proteksi branch `main`. Dua yang
pertama hidup di dalam repo dan sudah selesai; yang ketiga menuntut akses admin
GitHub.

| Opsi                              | Konsekuensi                                                                                                                                  |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Biarkan satu AC, tetap BLOCKED | Gate paling ketat, tetapi satu tugas organisasi menutupi kenyataan bahwa seluruh pekerjaan kode sudah tuntas dan terbukti                    |
| B. Keluarkan dari daftar AC       | Feature bisa ditutup lebih cepat, tetapi kewajibannya kehilangan pemilik dan mudah terlupakan                                                |
| C. Pecah menjadi dua AC           | AC-13 memuat yang dapat dibuktikan dari repo; AC-16 memuat kewajiban eksternal dan tetap BLOCKED, sehingga jelas apa yang sebenarnya menahan |

**Dipilih: C.**

## Rationale

**Mengapa triase eksplisit, bukan sekadar mengikuti roadmap.** Asumsi yang
dicatat `/develop` berbunyi: laporan audit sudah menjadi sumber kebenaran yang
cukup untuk gelombang 1. Asumsi itu bertahan untuk isi gelombang 1, karena tiap
temuannya menyebut bukti `file:baris`, dampak, dan bentuk perbaikan. Yang tidak
bertahan adalah kesimpulan turunannya, yaitu bahwa mengikuti roadmap berarti
tidak ada temuan yang tertinggal.

Bagian 4 audit mendefinisikan 57 temuan. Bagian 6 hanya menempatkan 45 di antaranya
ke dalam gelombang. **12 temuan tidak masuk gelombang mana pun**, dan enam di
antaranya bersevertias Sedang. Roadmap audit bukan pembagian yang habis, dan
mengadopsinya sebagai aturan batas berarti mewarisi lubang itu diam diam. Karena
itu spec ini menambahkan triase di bawah, sehingga tiap temuan audit punya
gelombang, termasuk yang jawabannya "kebersihan, tunggu gelombang 3".

Membangunnya sekarang bukan pilihan yang benar. Tiga temuan yang paling mendesak
menuntut keputusan tersendiri: SRV-3 mengubah kebijakan redaction yang sudah
diputuskan spec 0011 dan 0053, SRV-5 menambah opsi trusted proxy pada config yang
juga disentuh INF-8, dan INF-4 menyentuh alokasi artefak yang disentuh INF-7 di
gelombang 2. Menariknya ke sini akan membuat gelombang 1 berhenti menjadi
pekerjaan berisiko rendah, dan itulah satu satunya sifat yang membuat gelombang
ini bisa selesai tanpa gelombang berikutnya.

**Mengapa perbedaan `ESCAPE` dipertahankan.** PostgreSQL dengan
`standard_conforming_strings=on` membaca `'\\'` sebagai dua karakter dan menolak
klausa `ESCAPE` dua karakter. MySQL pada `sql_mode` default membaca `'\\\\'`
sebagai dua karakter backslash lalu memampatkannya menjadi satu, karena MySQL
memproses escape backslash di dalam string literal. Bentuk yang berbeda pada dua
provider di sini bukan ketidakkonsistenan; itu adalah dua dialect yang memang
memperlakukan backslash secara berbeda. Menyamakan bentuk teksnya justru akan
memecahkan salah satunya.

Yang tidak dapat diterima adalah dasar buktinya. Klaim untuk MySQL berdiri di
atas probe manual sekali jalan yang tidak dicatat sebagai test. Pada
`NO_BACKSLASH_ESCAPES` MySQL berhenti memproses escape backslash, sehingga bentuk
yang sama sangat mungkin ditolak. Karena itu AC-1 kini menuntut regresi yang
memaku bentuk yang diterima pada kedua nilai `sql_mode`. Bila regresi itu
membuktikan bentuknya gagal pada `NO_BACKSLASH_ESCAPES`, keputusan ini berubah
menjadi opsi B dan dicatat sebagai revisi.

**Mengapa AC-13 dipecah, dan mengapa itu bukan pelonggaran gate.** Kewajiban
proteksi branch tidak dihapus dan tidak dipindahkan ke luar spec; ia menjadi AC-16
yang berdiri sendiri dan tetap berstatus BLOCKED. Feature 57 tetap tidak bisa
ditutup sebelum ada bukti `gh api`. Yang berubah hanya keterbacaannya: sebelumnya
satu AC gagal dan tidak jelas bagian mana yang gagal, sehingga pekerjaan
`concurrency` dan determinisme realtime yang sudah terbukti ikut tenggelam.
Memisahkan kewajiban yang dapat dibuktikan dari repo dan yang tidak adalah syarat
supaya checklist tetap berarti.

**Mengapa AC-15 lulus meski meleset dari target audit.** Audit meminta ruang
budget 15 persen; hasilnya 4,1 persen. AC-15 tidak pernah menuntut angka 15
persen; ia menuntut komposisi bundle dianalisis lewat perintah yang dapat
diulang, ukuran initial berkurang, dan angka headroom dicatat bersama keputusan
eksplisit tentang budget. Ketiganya terpenuhi, dan selisih terhadap target audit
dicatat sebagai hutang beserta alasannya, yaitu 103 kB sisanya berada di kode
framework. Ini adalah bentuk yang benar: AC lulus dengan syaratnya sendiri, dan
kekurangannya tercatat, bukan dihaluskan.

## Triase temuan yang dilewatkan roadmap audit

Dua belas temuan berikut didefinisikan di bagian 4 audit tetapi tidak muncul di
gelombang mana pun pada bagian 6. Tabel ini menugaskan tiap temuan ke gelombang,
sehingga roadmap menjadi pembagian yang habis. Tidak satu pun dikerjakan di spec
ini.

| Temuan | Severitas | Effort | Gelombang | Alasan penugasan                                                                                                         |
| ------ | --------- | ------ | --------- | ------------------------------------------------------------------------------------------------------------------------ |
| SRV-3  | Sedang    | M      | 2         | Bug kebenaran yang dilihat pengguna, tetapi perbaikannya mengubah kebijakan redaction yang diputuskan spec 0011 dan 0053 |
| SRV-5  | Sedang    | S      | 2         | Kontrol keamanan; menuntut opsi trusted proxy pada config yang juga disentuh INF-8                                       |
| INF-4  | Sedang    | S      | 2         | Risiko kehilangan data backup; menyentuh alokasi artefak yang juga disentuh INF-7                                        |
| INF-8  | Sedang    | S      | 2         | Sejalan dengan pembenahan platform internal pada bagian 5.4 audit                                                        |
| WEB-9  | Sedang    | S      | 2         | Reaktivitas web; sejalan dengan WEB-1 yang sudah ada di gelombang 2                                                      |
| SRV-7  | Sedang    | M      | 3         | Pemecahan modul yang mencampur enam tanggung jawab, sejenis WEB-4 di gelombang 3                                         |
| DB-10  | Rendah    | S      | 2         | Menempel pada DB-6 dialect di core; lihat catatan di bawah, label Rendah menyembunyikan dua bug kebenaran                |
| INF-10 | Rendah    | S      | 2         | Menempel pada SRV-3 dan pembenahan 5.4; mengeluarkan redaksi dari `crypto` melepas tujuh package                         |
| CI-10  | Rendah    | S      | 3         | Kebersihan tooling dan pinning dependency                                                                                |
| INF-11 | Rendah    | S      | 3         | Kebersihan, kecuali `InternalUnitOfWork.transaction<T>` yang menerima `T = Promise<...>`; lihat catatan di bawah         |
| SRV-9  | Rendah    | S      | 3         | Kebersihan dan pemindahan mapper HTTP, yang akan ikut selesai bersama kernel HTTP penuh di gelombang 2                   |
| DOC-4  | Rendah    | S      | 3         | Dokumen; sejalan dengan DOC-3                                                                                            |

### Catatan: dua label severitas yang layak ditinjau

Triase ini menemukan dua temuan berlabel Rendah yang isinya memuat bug kebenaran,
sehingga labelnya lebih rendah daripada dampaknya. Keduanya tetap ditugaskan
sesuai tabel, tetapi dicatat di sini supaya tidak dibaca sebagai kebersihan
belaka.

- **DB-10** memuat dua hal yang bukan kebersihan. `total()` membangun COUNT
  dengan memotong teks SQL di antara `' FROM '` dan `' LIMIT '`
  (`packages/database-postgresql/src/data.ts:551-555`), yang rapuh terhadap
  identifier berkutip yang memuat token itu. Regex tipe `/int/` juga cocok dengan
  `interval` dan `point`, dan akibatnya kolom bertipe `time` tidak pernah bisa
  diedit. Yang kedua adalah cacat perilaku yang dilihat pengguna.
- **INF-11** memuat `InternalUnitOfWork.transaction<T>` yang menerima
  `T = Promise<...>` (`ports/unit-of-work.ts:4-5`), sehingga callback async akan
  commit sebelum pekerjaannya selesai. Ini adalah cacat integritas transaksi,
  bukan kebersihan.

### Catatan: satu klaim spec yang audit tandai tidak valid

Bagian 7 audit mencatat bahwa AC-4 pada spec 0056 dinyatakan selesai, padahal
bocoran detail engine yang menjadi isinya masih ada (DB-10). Menurut aturan
integritas checklist proyek ini, kotak yang klaimnya tidak lagi terbukti harus
dibuka kembali. Itu adalah pekerjaan pada spec 0056, bukan di sini, dan dicatat
sebagai Follow-up pada [index.md](index.md#follow-up).

## References

Sumber internal, tanpa pengambilan dari web.

- [Audit codebase MyAdmin 2026-09-04](../../reviews/2026-09-04-audit-codebase.md), basis commit `abe2aa9`. Bagian 4 memuat definisi 57 temuan, bagian 6 memuat roadmap tiga gelombang, bagian 7 memetakan temuan ke spec 0056.
- [Spec 0056 Standar runtime Bun dan reaktivitas Angular](../0056-bun-angular-runtime-standard/index.md), berstatus `Accepted`, memiliki AC-9 (helper HTTP bersama) dan AC-18 sampai AC-20 (channel sukses dan error, zoneless) yang sebagian dipenuhi spec ini.
- [Spec 0011 Credential vault dan redaction](../0011-credential-vault-redaction/index.md) dan [spec 0053 Security hardening](../0053-security-hardening/index.md), pemilik kebijakan redaction yang harus ikut diperbarui ketika SRV-3 dikerjakan.
- [Evidence 2026-09-05 audit wave 1](../evidence/2026-09-05-audit-wave-1.md), output perintah untuk AC-11, AC-14, dan AC-15.
- [AGENTS.md](../../../AGENTS.md), bagian aturan integritas checklist dan sinkronisasi scope dengan spec.
