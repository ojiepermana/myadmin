# 0033. Query editor: tab dan eksekusi

**Date**: 2026-08-28
**Status**: In Progress
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini membangun inti query editor: tab editor SQL berbasis CodeMirror 6 yang terikat eksplisit pada koneksi, database, dan schema; eksekusi SQL terpilih, penuh, atau multi statement lewat sesi provider khusus per tab; hasil per statement dengan durasi dan posisi error; autocomplete dari metadata; dan pencatatan history. Result grid detail, cancel, dan EXPLAIN dilengkapi spec 0034 dan 0035.

## Context

FR-QRY-01 sampai FR-QRY-03 dan FR-QRY-06 sebagian: tab dengan konteks dan draft sendiri, highlighting dan autocomplete metadata (tanpa mengunduh katalog penuh), eksekusi selected/full/multi statement dengan hasil per eksekusi dan konteks yang selalu terlihat. Keputusan penting yang diambil di sini: setiap tab yang pernah mengeksekusi mendapat sesi provider khusus (bukan pool bersama) supaya transaksi manual, SET session, dan temporary table berperilaku seperti yang diharapkan pengguna alat database; dan hasil dibatasi `limits.resultMaxRows` (default 1000) dengan pemberitahuan, set hasil penuh lewat export.

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0027 (sesi koneksi), 0029 (channel query). CodeMirror 6 dipilih di sesi desain; catatan lanskap: repo GitHub nya pindah hosting ke code.haverbeke.berlin (diarsipkan di GitHub, April 2026), paket npm tetap jalur distribusi resmi dan aktif.

## Requirements

**User stories**:

- Sebagai pengguna, saya ingin beberapa tab query dengan konteks masing masing yang tidak saling tertukar.
- Sebagai pengguna, saya ingin menjalankan bagian SQL yang saya blok saja, dan melihat error menunjuk posisinya.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): tab query dibuka dari explorer atau menu; setiap tab menyimpan connectionId, database, schema (bila berlaku), draft SQL, dan state eksekusinya sendiri (FR-QRY-01); konteks tampil permanen di header tab dan dapat diganti lewat pemilih (ganti database membuka sesi baru dengan konfirmasi bila ada transaksi aktif).
- [**AC-2**](test.md#ac-2): editor CodeMirror 6 dengan dialek SQL sesuai engine koneksi (dari capability/engine tampilan, bukan logika bercabang di fitur: dialek dipilih lewat pemetaan terpusat), highlighting, nomor baris, pencarian dalam editor, dan keymap eksekusi (Ctrl/Cmd Enter menjalankan seleksi atau statement di kursor; tombol Run menjalankan penuh).
- [**AC-3**](test.md#ac-3): autocomplete menawarkan schema, table, view, kolom, dan kata kunci dari metadata provider untuk konteks aktif, dimuat malas per kebutuhan (schema → table saat schema diketik) dari cache metadata (spec 0023/0025); tidak ada unduhan katalog penuh saat tab dibuka (FR-QRY-02).
- [**AC-4**](test.md#ac-4): eksekusi: `POST /query/executions` menerima { connectionId, database, schema?, sql, mode: selection|full|statementAtCursor } dan mengembalikan executionId seketika; pemecahan multi statement dilakukan provider (aware terhadap string, komentar, dollar quoting PostgreSQL, delimiter); statement dieksekusi berurutan pada sesi tab, berhenti pada error pertama (sisa dilaporkan dilewati); state dan hasil mengalir lewat channel `query.<executionId>` (spec 0029) dengan fallback `GET /query/executions/:id`.
- [**AC-5**](test.md#ac-5): sesi provider per tab: eksekusi pertama tab membuka sesi khusus (terpisah dari sesi status spec 0027) yang dipakai semua eksekusi tab itu; menutup tab atau idle timeout menutup sesi; transaksi manual (BEGIN tanpa COMMIT) tetap terbuka antar eksekusi tab yang sama dan indikator "transaksi aktif" tampil.
- [**AC-6**](test.md#ac-6): hasil per statement: kolom dan baris (maksimum `limits.resultMaxRows`, dengan penanda "terpotong, N baris pertama" bila terpotong), jumlah affected rows untuk DML, durasi per statement, dan pesan sukses per statement; error menampilkan pesan ternormalisasi plus posisi yang dipetakan balik ke offset editor bila tersedia (FR-QRY-03).
- [**AC-7**](test.md#ac-7): setiap eksekusi tercatat ke query history (user, koneksi, database, SQL, status, durasi, jumlah baris) lewat repository (spec 0009); SQL dicatat utuh (bukan hasil), status failed juga dicatat.
- [**AC-8**](test.md#ac-8): nilai baris di serialisasi aman ke klien: tipe tanggal/angka besar/bytea dalam bentuk yang tidak kehilangan presisi (string berlabel tipe), NULL dibedakan dari string kosong; kontrak mendefinisikan bentuk sel berlabel tipe ini.
- [**AC-9**](test.md#ac-9): e2e kedua engine: buka tab, autocomplete muncul, jalankan seleksi, multi statement dengan error di tengah menunjuk posisi, transaksi manual lintas eksekusi bekerja, history bertambah.

## Options considered

### Option 1: Sesi provider khusus per tab (dipilih)

**Pros**:

- Perilaku transaksi, SET, temp table sesuai harapan pengguna alat database; cancel menarget sesi yang jelas.

**Cons**:

- Lebih banyak koneksi ke server target (satu per tab yang aktif mengeksekusi); ditahan idle timeout dan penutupan bersama tab.

### Option 2: Pool bersama per koneksi

**Pros**:

- Koneksi lebih sedikit.

**Cons**:

- Transaksi manual dan session state pecah antar statement; kelas kebingungan yang fatal untuk alat administrasi.

## Decision

**Chosen option**: Option 1: sesi per tab dengan idle timeout; eksekusi asinkron dengan executionId dan aliran state lewat WS.

CodeMirror 6 plus `@codemirror/lang-sql` untuk editor (keputusan sesi desain), pemecah statement hidup di provider (basis: FR-QRY-03; dialek berbeda per engine adalah semantik provider).

## Rationale

Semantik sesi adalah keputusan paling berdampak di editor; per tab adalah satu satunya pilihan yang membuat BEGIN, SET, dan temp table jujur. Eksekusi asinkron dengan executionId dipilih sejak awal (bukan response sinkron) karena cancel (spec 0035) dan progress hanya mungkin pada model itu, dan kontraknya tidak perlu diubah dua kali. Batas baris hasil melindungi browser dan server (NFR-01); jalur data penuh adalah export yang memang streaming.

## Feature design

**Data model sketch**: memakai `query_history` (spec 0008); state runtime `QueryExecution { id, tabSessionId, statements[], currentIndex, state, results[] }`.

**State transitions** (execution): running → completed | failed | cancelled (cancel di spec 0035); per statement: pending → running → done | error | skipped.

**API surface**:

| Endpoint              | Method | Key inputs                                 | Key outputs                | Auth                | Key errors             |
| --------------------- | ------ | ------------------------------------------ | -------------------------- | ------------------- | ---------------------- |
| /query/executions     | POST   | connectionId, database, schema?, sql, mode | executionId                | pemilik, tersambung | 409 NOT_CONNECTED, 422 |
| /query/executions/:id | GET    | tidak ada                                  | state, hasil per statement | pemilik             | 404                    |

**Value sourcing**:

| Action       | Value produced / displayed | Source                                                                |
| ------------ | -------------------------- | --------------------------------------------------------------------- |
| autocomplete | daftar object/kolom        | cache metadata provider konteks tab                                   |
| posisi error | offset editor              | `DbError.position` provider dipetakan ke offset statement dalam draft |
| durasi       | ms per statement           | pengukuran server di provider                                         |
| batas baris  | nilai                      | config `limits.resultMaxRows`                                         |
| history      | SQL, status, durasi        | eksekusi ini; ditulis use case query                                  |

**Key invariants**:

- Konteks eksekusi selalu eksplisit dari tab; tidak pernah "koneksi aktif global" diam diam (FR-EXP-04).
- Semua SQL pengguna berjalan hanya pada sesi tab miliknya; tidak ada penggunaan sesi lintas user.
- Hasil yang terpotong selalu ditandai; klien tidak pernah mengira data lengkap.

**Security model**: hak eksekusi sepenuhnya hak credential koneksi (bagian 8.2 butir 6); Myadmin tidak menambah atau mengurangi. SQL pengguna tidak diaudit per eksekusi (SELECT tidak diaudit default), tapi masuk history milik user.

**Configuration required**: memakai `limits.resultMaxRows` (spec 0012).

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. Definisikan operasi eksekusi plus bentuk hasil sel berlabel tipe di kontrak, regenerasi, contract test, memenuhi **AC-4**, **AC-6**, **AC-8**.
2. Bangun pemecah statement di masing masing provider (`query/` package provider) dengan test dialek menyeluruh, memenuhi **AC-4**.
3. Bangun use case eksekusi di modul server query: sesi per tab, eksekusi berurutan, state, event WS, history, memenuhi **AC-4**, **AC-5**, **AC-7**.
4. Bangun editor CodeMirror (dialek, keymap, pencarian) di feature query-editor plus tab context header dan pemilih konteks, memenuhi **AC-1**, **AC-2**.
5. Bangun autocomplete berbasis cache metadata malas, memenuhi **AC-3**.
6. Render hasil sementara (tabel sederhana; grid penuh di spec 0034), pemetaan posisi error ke editor, indikator transaksi, memenuhi **AC-6**.
7. E2e dua engine, memenuhi **AC-9**.

## Consequences

**Positive**:

- Fitur inti produk hidup; model eksekusi asinkron siap untuk cancel dan EXPLAIN tanpa perombakan.

**Negative / tradeoffs**:

- Sesi per tab menambah koneksi ke server target; idle timeout dan penutupan tab menahannya.
- Pemecah statement adalah kode rawan; dibayar dengan test dialek yang luas.

**Neutral**:

- Draft SQL tab ikut workspace persistence (spec 0030).

## Follow-up

- [ ] Spec 0034 mengganti render hasil sementara dengan result grid foundation.
- [ ] Spec 0035 menambah cancel dan EXPLAIN pada model eksekusi ini.

## References

**Project sources**:

- v1-feature-specification.md FR-QRY-01, 02, 03, 06, NFR-01; spec 0023, 0025, 0027, 0029.
- Keputusan CodeMirror 6, sesi desain 2026-08-28.

**Practices & standards**:

- Sesi eksplisit per konteks kerja; eksekusi asinkron dengan id; serialisasi berlabel tipe untuk presisi.

**Links** (terverifikasi web 2026-08-28):

- Repo lang-sql pindah hosting (arsip GitHub): https://github.com/codemirror/lang-sql
- Rumah baru pengembangan CodeMirror: https://code.haverbeke.berlin/codemirror/lang-sql
