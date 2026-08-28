# 0015. App shell dan navigation

**Date**: 2026-08-28
**Status**: Proposed
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Summary

Spec ini membangun kerangka layar aplikasi: top bar, sidebar, workspace host, tab host, panel yang bisa diubah ukurannya, status bar, infrastruktur context menu, dan presentasi error, semuanya dari primitive @ojiepermana/angular. Juga kerangka routing lazy untuk seluruh fitur. Setelah spec ini, setiap fitur tinggal mengisi slot di shell yang sudah hidup.

## Context

FR-UI-03 menuntut shell dengan sidebar, workspace, tab host, resizable panel, context menu, dan status bar yang bisa membuka lebih dari satu context. Struktur.md memisahkan `layout/` (shell, tanpa pengetahuan SQL atau provider) dari `features/` (lazy loaded). Shell dibangun sebelum fitur auth supaya halaman pertama (setup, login) sudah punya rumah, tapi state workspace yang dipulihkan menunggu spec 0030.

**Relasi dan prasyarat**: [relation.md](relation.md). Ringkasan konteks: spec 0014. Terkait: spec 0005 (SDK untuk error presenter), 0030 (persistensi state).

## Requirements

**User stories**:
- Sebagai pengguna, saya ingin tata letak kerja yang bisa saya atur (panel, tab) seperti alat database pada umumnya.
- Sebagai pengguna keyboard, saya ingin navigasi utama bisa dijalankan tanpa mouse.

**Acceptance criteria**:

Definisi normatif dan rancangan test hidup di [test.md](test.md#acceptance-criteria). Salinan navigasi berikut wajib tetap identik agar implementer dapat membaca kontrak lengkap dari spec utama.

- [**AC-1**](test.md#ac-1): app shell terdiri dari top bar (branding, menu user placeholder, toggle theme), sidebar kiri yang bisa dilipat, area workspace dengan tab host, panel bawah opsional, dan status bar; semua memakai primitive layout dan navigation @ojiepermana/angular.
- [**AC-2**](test.md#ac-2): panel sidebar dan panel bawah bisa diubah ukurannya dengan drag dan dilipat; ukuran tersimpan sementara di memori (persistensi lintas sesi milik spec 0030).
- [**AC-3**](test.md#ac-3): tab host mendukung buka, tutup, pindah aktif, dan menampung konten fitur lewat router outlet atau portal; state tiap tab terisolasi.
- [**AC-4**](test.md#ac-4): infrastruktur context menu tersedia sebagai directive/service yang fitur pakai untuk menu klik kanan; satu menu terbuka pada satu waktu; bisa diakses keyboard (tombol menu, Escape menutup).
- [**AC-5**](test.md#ac-5): routing kerangka terdefinisi untuk semua fitur V1 sebagai lazy route (initial-setup, auth, connections, workspace, explorer, database, schema, table-designer, data-browser, query-editor, query-history, security, import-export, backup-restore, monitoring, audit, settings) dengan placeholder ringan; guard auth dipasang belakangan (spec 0017).
- [**AC-6**](test.md#ac-6): `core/errors/` menyediakan error presenter (toast/dialog dari paket foundation) yang menerima `SdkError` dan menampilkan pesan aman plus correlation ID yang bisa disalin; error boundary menangkap error render fitur tanpa merobohkan shell.
- [**AC-7**](test.md#ac-7): navigasi utama, toggle sidebar, perpindahan tab, dan menutup dialog dapat dijalankan dengan keyboard; fokus terlihat; landmark ARIA dasar terpasang (FR-UI-05, NFR-04 baseline).
- [**AC-8**](test.md#ac-8): layout tidak rusak pada lebar 1024 px; di bawah itu sidebar otomatis menjadi overlay.

## Options considered

### Option 1: Tab lewat router outlet bernama dan store tab milik shell (dipilih)

**Pros**:
- Tab adalah state aplikasi (bisa dipersist spec 0030), bukan tumpukan komponen ad hoc; deep link per tab tetap mungkin.

**Cons**:
- Perlu disiplin: konten tab harus bisa direkonstruksi dari deskriptor tab (tipe plus context), bukan dari instance hidup.

### Option 2: Tab sebagai komponen dinamis tanpa router

**Pros**:
- Bebas dari batasan router.

**Cons**:
- Kehilangan deep link dan mempersulit restore workspace; setiap fitur menangani lifecycle sendiri.

## Decision

**Chosen option**: Option 1: tab dideskripsikan oleh `TabDescriptor { id, type, context }` di `core/state/workspace.store.ts`, dirender lewat router; shell tidak tahu isi context selain menampilkannya.

**Implementation skills**: `angular-developer` (level user).

## Rationale

Workspace yang bisa dipulihkan (FR-UI-03, spec 0030) menuntut tab berbentuk data sejak awal; memilih Option 2 sekarang berarti refactor saat persistensi datang. Shell yang buta terhadap domain (aturan struktur.md: layout tidak tahu SQL) dipertahankan dengan membuat context tab opak bagi shell. Error presenter dibangun di sini karena halaman pertama yang butuh (setup, login) lahir tepat setelah spec ini.

## Feature design

**Data model sketch** (state klien, belum dipersist):

~~~text
TabDescriptor { id, type: 'welcome'|'query'|'data'|'table'|..., title, context: object opak }
WorkspaceState { tabs: TabDescriptor[], activeTabId, panels: { sidebarWidth, bottomHeight, collapsed } }
~~~

**State transitions** (tab): dibuka → aktif ⇄ latar → ditutup; menutup tab aktif mengaktifkan tetangga terdekat.

**API surface**: tidak ada endpoint baru.

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| render tab | judul tab | descriptor tab, diisi fitur pembuka |
| status bar | konten segmen | store status (diisi spec 0027 dan fitur lain) |
| error presenter | pesan dan correlationId | `SdkError` (spec 0005) |

**Key invariants**:
- `layout/` tidak mengimpor apa pun dari `features/` atau SDK domain; komunikasi lewat store di `core/state/`.
- Setiap dialog dan menu dapat ditutup dengan Escape; fokus kembali ke pemicunya.

**Security model**: shell tidak menampilkan data sensitif; error presenter hanya menampilkan pesan yang sudah aman dari server.

**Configuration required**: tidak ada.

**Critical test scenarios**:

Scenario kritis dipelihara di [test.md](test.md#critical-test-scenarios) bersama matriks cakupan unit, integration, dan test khusus.

## Build plan

1. Bangun komponen layout (top-bar, sidebar, workspace-host, tab-host, panel-layout, status-bar) di atas primitive foundation, memenuhi **AC-1**, **AC-2**.
2. Bangun `workspace.store.ts` dengan `TabDescriptor` dan operasi tab, sambungkan ke tab host, memenuhi **AC-3**.
3. Bangun infrastruktur context menu (directive plus service) dengan dukungan keyboard, memenuhi **AC-4**.
4. Definisikan `app.routes.ts` lazy untuk semua fitur dengan placeholder, memenuhi **AC-5**.
5. Bangun `core/errors/` (presenter plus boundary) terhubung `SdkError`, memenuhi **AC-6**.
6. Baseline aksesibilitas dan responsivitas (landmark, fokus, breakpoint 1024), plus e2e keyboard dasar di Playwright, memenuhi **AC-7**, **AC-8**.

## Consequences

**Positive**:
- Semua fitur mendapatkan kerangka yang sama; persistensi workspace tinggal menyimpan store yang sudah berbentuk data.

**Negative / tradeoffs**:
- Deskriptor tab opak menuntut tiap fitur mendefinisikan context serializable; disiplin ini ditagih di spec fitur masing masing.

**Neutral**:
- Status bar berisi placeholder sampai spec 0027 mengisinya.

## Follow-up

- [ ] Spec 0030 menambahkan persistensi `WorkspaceState` ke server.

## References

**Project sources**:
- v1-feature-specification.md FR-UI-03, FR-UI-05, NFR-04; struktur.md bagian 3 (layout, core, features).
- Spec 0005 (SdkError), 0014 (foundation).

**Practices & standards**:
- Shell buta domain; state UI sebagai data yang bisa direkonstruksi; aksesibilitas keyboard sejak kerangka.

**Links**: tidak ada yang diverifikasi untuk spec ini.
