# 0052. Settings dan preferences

**Date**: 2026-08-28
**Status**: In Progress
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini membangun dua permukaan pengaturan: preferences per user (theme, ukuran halaman default, preferensi editor) yang tersambung ke store yang sudah ada, dan settings aplikasi yang dikelola Admin (retensi history, batas yang boleh diubah runtime) dengan audit. Ini juga momen menyambungkan persistensi theme (spec 0014 AC-3) ke server.

## Context

FR internal menyebut settings dan preferences sebagai bagian internal state (FR-INT-02); struktur.md menyediakan feature settings. Pembagian yang dikunci di data model: `preferences` per user (key value), `settings` scope aplikasi (key value, Admin). Prinsip pemisahan: nilai yang mengubah perilaku server untuk semua orang adalah settings (Admin, diaudit); nilai selera per orang adalah preferences. Config file (spec 0012) tetap sumber untuk hal boot dan infrastruktur; settings runtime tidak menduplikasinya kecuali yang memang dirancang bisa diubah tanpa restart.

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0017. Menyambung spec 0014 (theme).

## Requirements

**User stories**:

- Sebagai pengguna, saya ingin preferensi saya (theme, ukuran halaman) mengikuti akun saya di browser mana pun.
- Sebagai Admin, saya ingin mengatur kebijakan aplikasi (retensi history) dari UI dengan jejak audit.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): preferences API: `GET /preferences` (semua milik user), `PUT /preferences/:key` (nilai JSON tervalidasi terhadap daftar key dikenal dengan schema per key); key V1: `ui.theme`, `ui.pageSize` (default ukuran halaman data browser), `editor.fontSize`, `editor.wordWrap`; key tak dikenal ditolak 422.
- [**AC-2**](test.md#ac-2): theme store (spec 0014) membaca dan menulis `ui.theme` lewat preferences setelah login; sebelum login tetap localStorage; konflik diselesaikan dengan nilai server menang saat login, lalu perubahan berikutnya tersinkron.
- [**AC-3**](test.md#ac-3): settings API (admin only): `GET /settings`, `PUT /settings/:key` untuk key V1: `history.maxEntriesPerUser` (dipakai retensi spec 0009), `security.sessionNote` tidak ada... hanya key yang benar benar dipakai: `history.maxEntriesPerUser`; daftar ini kecil dengan sengaja dan bertambah hanya lewat spec fitur; nilai tervalidasi (angka positif berbatas).
- [**AC-4**](test.md#ac-4): perubahan settings diaudit (`settings.changed`: key, nilai lama dan baru bila tidak sensitif) sebelum sukses; preferences tidak diaudit (selera pribadi).
- [**AC-5**](test.md#ac-5): UI: halaman settings dengan dua bagian: Preferensi (semua user; theme, page size, editor) dan Pengaturan Aplikasi (tampil hanya untuk Admin; form per key dengan penjelasan dampak); perubahan langsung berlaku (store reaktif) tanpa reload.
- [**AC-6**](test.md#ac-6): nilai preferences dan settings dibaca lewat lapisan tunggal di server (SettingsService dengan cache dan invalidasi saat tulis) sehingga pemakai (retensi history) selalu melihat nilai kini.
- [**AC-7**](test.md#ac-7): e2e: ganti theme di satu browser, login di konteks lain, theme mengikuti; Admin mengubah retensi dan nilai efektif berubah (dibuktikan lewat perilaku retensi); user biasa tidak melihat bagian Admin dan API nya menolak 403.

## Options considered

### Option 1: Daftar key tertutup dengan schema per key (dipilih)

**Pros**:

- Nilai selalu tervalidasi; UI bisa digenerate dari daftar; tidak ada tempat sampah key bebas yang membusuk.

**Cons**:

- Menambah key butuh perubahan kode; disengaja, key adalah kontrak.

### Option 2: Key value bebas

**Pros**:

- Fleksibel.

**Cons**:

- Nilai tak tervalidasi merusak pemakainya diam diam; tidak ada dokumentasi diri.

## Decision

**Chosen option**: Option 1: registry key tertutup (schema, default, scope user atau app, sensitifitas) di satu modul, dipakai API, UI, dan pemakai nilai.

## Rationale

Settings adalah kontrak antar fitur; registry tertutup membuat penambahan nilai baru selalu melewati pemikiran (siapa pemakainya, validasinya apa, siapa boleh mengubah). Pemisahan dari config file mengikuti garis restart: yang dibaca saat boot tinggal di config (spec 0012), yang boleh berubah hidup tinggal di settings, dan tidak ada nilai yang punya dua rumah.

## Feature design

**Data model sketch**: memakai `settings` dan `preferences` (spec 0008) apa adanya.

**API surface**:

| Endpoint          | Method | Key inputs | Key outputs              | Auth  | Key errors    |
| ----------------- | ------ | ---------- | ------------------------ | ----- | ------------- |
| /preferences      | GET    | tidak ada  | peta key nilai           | sesi  |               |
| /preferences/:key | PUT    | value      | kosong                   | sesi  | 422 key/nilai |
| /settings         | GET    | tidak ada  | peta key nilai plus meta | admin | 403           |
| /settings/:key    | PUT    | value      | kosong                   | admin | 403, 422      |

**Value sourcing**:

| Action                 | Value produced / displayed | Source                                                          |
| ---------------------- | -------------------------- | --------------------------------------------------------------- |
| daftar key dan schema  | registry                   | modul registry key (server, dibagikan ke UI lewat endpoint GET) |
| nilai efektif retensi  | angka                      | SettingsService (cache plus invalidasi)                         |
| theme lintas perangkat | nilai                      | preferences server, localStorage hanya pra login                |

**Key invariants**:

- Tidak ada key di luar registry; tidak ada nilai yang hidup di config dan settings sekaligus.
- Perubahan settings terlihat pemakainya tanpa restart (AC-6).

**Security model**: preferences milik user; settings admin only dengan audit; tidak ada nilai rahasia di keduanya di V1.

**Configuration required**: tidak ada baru.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. [x] Bangun registry key (schema, scope, default) plus SettingsService dengan cache, memenuhi **AC-1**, **AC-3**, **AC-6**.
2. [x] Kontrak dan endpoint preferences dan settings, audit settings, regenerasi, contract test, memenuhi **AC-1**, **AC-3**, **AC-4**.
3. [x] Sambungkan theme store dan pageSize/editor prefs ke preferences, memenuhi **AC-2**.
4. [x] UI halaman settings dua bagian dengan form dari registry, memenuhi **AC-5**.
5. [x] E2e tiga skenario, memenuhi **AC-7**.

## Consequences

**Positive**:

- Preferensi mengikuti akun; kebijakan aplikasi bisa diatur dengan jejak; janji FR-INT-02 bagian settings dan preferences genap.

**Negative / tradeoffs**:

- Registry menuntut disiplin penambahan key lewat spec; itu fitur, bukan bug.

**Neutral**:

- Key bertambah alami saat fitur V2 datang.

## Follow-up

- [ ] Tidak ada.

## References

**Project sources**:

- v1-feature-specification.md FR-INT-02, FR-UI-02; struktur.md feature settings; spec 0008, 0009, 0012, 0014.

**Practices & standards**:

- Registry konfigurasi tertutup dan tervalidasi; pemisahan boot config dari runtime settings.

**Links**: tidak ada yang diverifikasi untuk spec ini.
