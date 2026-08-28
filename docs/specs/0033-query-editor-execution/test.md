# Test dan acceptance criteria 0033. Query editor: tab dan eksekusi

**Date**: 2026-08-28
**Spec status**: mengikuti [index.md](index.md)
**Execution**: Belum dijalankan
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Verify](verify.md)

## Aturan dokumen

- File ini adalah sumber normatif acceptance criteria dan test design untuk spec 0033.
- `index.md` memuat mirror acceptance criteria untuk kompatibilitas workflow. Isi mirror wajib identik dengan bagian ini.
- Test ID di bawah adalah rencana, bukan bukti bahwa test sudah diimplementasikan atau lulus.
- Kategori dipilih per AC pada boundary terendah yang masih membuktikan perilaku. Kategori tambahan hanya dipakai untuk jaminan yang memang berbeda.
- Semua command test dijalankan dari akar repo melalui satu `package.json`. Tidak ada command package level atau manifest nested.

## Acceptance criteria

### AC-1

tab query dibuka dari explorer atau menu; setiap tab menyimpan connectionId, database, schema (bila berlaku), draft SQL, dan state eksekusinya sendiri (FR-QRY-01); konteks tampil permanen di header tab dan dapat diganti lewat pemilih (ganti database membuka sesi baru dengan konfirmasi bila ada transaksi aktif).

### AC-2

editor CodeMirror 6 dengan dialek SQL sesuai engine koneksi (dari capability/engine tampilan, bukan logika bercabang di fitur: dialek dipilih lewat pemetaan terpusat), highlighting, nomor baris, pencarian dalam editor, dan keymap eksekusi (Ctrl/Cmd Enter menjalankan seleksi atau statement di kursor; tombol Run menjalankan penuh).

### AC-3

autocomplete menawarkan schema, table, view, kolom, dan kata kunci dari metadata provider untuk konteks aktif, dimuat malas per kebutuhan (schema → table saat schema diketik) dari cache metadata (spec 0023/0025); tidak ada unduhan katalog penuh saat tab dibuka (FR-QRY-02).

### AC-4

eksekusi: `POST /query/executions` menerima { connectionId, database, schema?, sql, mode: selection|full|statementAtCursor } dan mengembalikan executionId seketika; pemecahan multi statement dilakukan provider (aware terhadap string, komentar, dollar quoting PostgreSQL, delimiter); statement dieksekusi berurutan pada sesi tab, berhenti pada error pertama (sisa dilaporkan dilewati); state dan hasil mengalir lewat channel `query.<executionId>` (spec 0029) dengan fallback `GET /query/executions/:id`.

### AC-5

sesi provider per tab: eksekusi pertama tab membuka sesi khusus (terpisah dari sesi status spec 0027) yang dipakai semua eksekusi tab itu; menutup tab atau idle timeout menutup sesi; transaksi manual (BEGIN tanpa COMMIT) tetap terbuka antar eksekusi tab yang sama dan indikator "transaksi aktif" tampil.

### AC-6

hasil per statement: kolom dan baris (maksimum `limits.resultMaxRows`, dengan penanda "terpotong, N baris pertama" bila terpotong), jumlah affected rows untuk DML, durasi per statement, dan pesan sukses per statement; error menampilkan pesan ternormalisasi plus posisi yang dipetakan balik ke offset editor bila tersedia (FR-QRY-03).

### AC-7

setiap eksekusi tercatat ke query history (user, koneksi, database, SQL, status, durasi, jumlah baris) lewat repository (spec 0009); SQL dicatat utuh (bukan hasil), status failed juga dicatat.

### AC-8

nilai baris di serialisasi aman ke klien: tipe tanggal/angka besar/bytea dalam bentuk yang tidak kehilangan presisi (string berlabel tipe), NULL dibedakan dari string kosong; kontrak mendefinisikan bentuk sel berlabel tipe ini.

### AC-9

e2e kedua engine: buka tab, autocomplete muncul, jalankan seleksi, multi statement dengan error di tengah menunjuk posisi, transaksi manual lintas eksekusi bekerja, history bertambah.

## Matriks cakupan

| AC | Unit | Integration | Contract | E2E | Security | Performance | Visual | Smoke | Manual atau external |
|---|---|---|---|---|---|---|---|---|---|
| [AC-1](#ac-1) | `UT-0033-AC1` | n/a | n/a | `E2E-0033-AC1` | n/a | n/a | n/a | n/a | n/a |
| [AC-2](#ac-2) | `UT-0033-AC2` | n/a | n/a | `E2E-0033-AC2` | n/a | n/a | `VIS-0033-AC2` | n/a | n/a |
| [AC-3](#ac-3) | n/a | `IT-0033-AC3` | n/a | `E2E-0033-AC3` | n/a | n/a | n/a | n/a | n/a |
| [AC-4](#ac-4) | `UT-0033-AC4` | `IT-0033-AC4` | `CT-0033-AC4` | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-5](#ac-5) | n/a | `IT-0033-AC5` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-6](#ac-6) | n/a | `IT-0033-AC6` | `CT-0033-AC6` | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-7](#ac-7) | n/a | `IT-0033-AC7` | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-8](#ac-8) | `UT-0033-AC8` | n/a | `CT-0033-AC8` | n/a | n/a | n/a | n/a | n/a | n/a |
| [AC-9](#ac-9) | n/a | n/a | n/a | `E2E-0033-AC9` | n/a | n/a | n/a | n/a | n/a |

Setiap AC memiliki minimal satu jalur pembuktian. `n/a` berarti jenis test itu tidak relevan untuk AC tersebut, bukan berarti AC boleh dilewati.

## Unit test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `UT-0033-AC1` | [AC-1](#ac-1) | tab query dibuka dari explorer atau menu; setiap tab menyimpan connectionId, database, schema (bila berlaku), draft SQL, dan state eksekusinya sendiri (FR-QR... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `UT-0033-AC2` | [AC-2](#ac-2) | editor CodeMirror 6 dengan dialek SQL sesuai engine koneksi (dari capability/engine tampilan, bukan logika bercabang di fitur: dialek dipilih lewat pemetaan... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `UT-0033-AC4` | [AC-4](#ac-4) | eksekusi: POST /query/executions menerima { connectionId, database, schema?, sql, mode: selection\|full\|statementAtCursor } dan mengembalikan executionId se... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `UT-0033-AC8` | [AC-8](#ac-8) | nilai baris di serialisasi aman ke klien: tipe tanggal/angka besar/bytea dalam bentuk yang tidak kehilangan presisi (string berlabel tipe), NULL dibedakan da... | Isolasi unit terkecil yang menentukan perilaku AC. Ganti I/O eksternal dengan test double deterministik. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

## Integration test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `IT-0033-AC3` | [AC-3](#ac-3) | autocomplete menawarkan schema, table, view, kolom, dan kata kunci dari metadata provider untuk konteks aktif, dimuat malas per kebutuhan (schema → table saa... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `IT-0033-AC4` | [AC-4](#ac-4) | eksekusi: POST /query/executions menerima { connectionId, database, schema?, sql, mode: selection\|full\|statementAtCursor } dan mengembalikan executionId se... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `IT-0033-AC5` | [AC-5](#ac-5) | sesi provider per tab: eksekusi pertama tab membuka sesi khusus (terpisah dari sesi status spec 0027) yang dipakai semua eksekusi tab itu; menutup tab atau i... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-5 terpenuhi. |
| `IT-0033-AC6` | [AC-6](#ac-6) | hasil per statement: kolom dan baris (maksimum limits.resultMaxRows, dengan penanda "terpotong, N baris pertama" bila terpotong), jumlah affected rows untuk... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `IT-0033-AC7` | [AC-7](#ac-7) | setiap eksekusi tercatat ke query history (user, koneksi, database, SQL, status, durasi, jumlah baris) lewat repository (spec 0009); SQL dicatat utuh (bukan... | Jalankan boundary nyata yang disebut AC memakai resource disposable, lalu lakukan cleanup. | Seluruh outcome dan failure boundary AC-7 terpenuhi. |

## Test tambahan

### Contract test

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `CT-0033-AC4` | [AC-4](#ac-4) | eksekusi: POST /query/executions menerima { connectionId, database, schema?, sql, mode: selection\|full\|statementAtCursor } dan mengembalikan executionId se... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-4 terpenuhi. |
| `CT-0033-AC6` | [AC-6](#ac-6) | hasil per statement: kolom dan baris (maksimum limits.resultMaxRows, dengan penanda "terpotong, N baris pertama" bila terpotong), jumlah affected rows untuk... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-6 terpenuhi. |
| `CT-0033-AC8` | [AC-8](#ac-8) | nilai baris di serialisasi aman ke klien: tipe tanggal/angka besar/bytea dalam bentuk yang tidak kehilangan presisi (string berlabel tipe), NULL dibedakan da... | Bandingkan request, response, schema, event, atau provider contract dengan bentuk normatif. | Seluruh outcome dan failure boundary AC-8 terpenuhi. |

### E2E

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `E2E-0033-AC1` | [AC-1](#ac-1) | tab query dibuka dari explorer atau menu; setiap tab menyimpan connectionId, database, schema (bila berlaku), draft SQL, dan state eksekusinya sendiri (FR-QR... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-1 terpenuhi. |
| `E2E-0033-AC2` | [AC-2](#ac-2) | editor CodeMirror 6 dengan dialek SQL sesuai engine koneksi (dari capability/engine tampilan, bukan logika bercabang di fitur: dialek dipilih lewat pemetaan... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |
| `E2E-0033-AC3` | [AC-3](#ac-3) | autocomplete menawarkan schema, table, view, kolom, dan kata kunci dari metadata provider untuk konteks aktif, dimuat malas per kebutuhan (schema → table saa... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-3 terpenuhi. |
| `E2E-0033-AC9` | [AC-9](#ac-9) | e2e kedua engine: buka tab, autocomplete muncul, jalankan seleksi, multi statement dengan error di tengah menunjuk posisi, transaksi manual lintas eksekusi b... | Jalankan alur dari permukaan pengguna sampai outcome yang dapat diamati. | Seluruh outcome dan failure boundary AC-9 terpenuhi. |

### Security

Tidak ada security yang diwajibkan oleh acceptance criteria saat ini.

### Performance

Tidak ada performance yang diwajibkan oleh acceptance criteria saat ini.

### Visual dan accessibility

| ID | AC | Fokus | Scenario terencana | Expected result |
|---|---|---|---|---|
| `VIS-0033-AC2` | [AC-2](#ac-2) | editor CodeMirror 6 dengan dialek SQL sesuai engine koneksi (dari capability/engine tampilan, bukan logika bercabang di fitur: dialek dipilih lewat pemetaan... | Kunci viewport, mode warna, state komponen, interaksi keyboard, dan bukti screenshot. | Seluruh outcome dan failure boundary AC-2 terpenuhi. |

### Smoke dan operational acceptance

Tidak ada smoke dan operational yang diwajibkan oleh acceptance criteria saat ini.

### Manual atau external proof

Tidak ada manual atau external yang diwajibkan oleh acceptance criteria saat ini.

## Critical test scenarios

- Multi statement: tiga statement dengan error di kedua → pertama done, kedua error berposisi, ketiga skipped, verifikasi **AC-4**, **AC-6**.
- Sesi: BEGIN di eksekusi pertama, INSERT di kedua, ROLLBACK di ketiga → data tidak berubah; indikator transaksi tampil, verifikasi **AC-5**.
- Presisi: BIGINT besar dan timestamp tampil tanpa kehilangan presisi, verifikasi **AC-8**.

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
