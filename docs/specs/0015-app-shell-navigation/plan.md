# Plan 0015. App shell dan navigation

**Date**: 2026-08-30
**Spec status**: mengikuti [index.md](index.md)
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Relation](relation.md) | [Test dan acceptance criteria](test.md) | [Verify](verify.md)

## Aturan dokumen

- Dokumen planning ini disusulkan setelah spec berjalan. Isinya diturunkan dari `index.md`, `test.md`, `verify.md`, dan `docs/specs/ac-evidence-matrix.md`; file ini bukan sumber kebenaran baru.
- Status pada tabel di bawah adalah snapshot per 2026-08-30. Bila build plan, acceptance criteria, atau evidence berubah, perbarui tabel ini bersama file sumbernya.
- Status implementasi tidak boleh dinaikkan tanpa evidence pada `verify.md` atau matrix acceptance.

## Ringkasan progres

| Dimensi             | Nilai                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Status spec         | In Progress                                                                                                         |
| Build plan          | 6 dari 6 langkah selesai                                                                                            |
| Acceptance criteria | 8 AC: 8 PASS, 0 PARTIAL, 0 BLOCKED                                                                                  |
| Verdict verifikasi  | Belum diverifikasi; verdict hanya boleh berubah setelah setiap AC memiliki result dan evidence yang dapat ditinjau. |

## Rencana build dan status implementasi

| #   | Langkah rencana                                                                                                            | AC terkait | Status  |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ---------- | ------- |
| 1   | Bangun komponen layout (top-bar, sidebar, workspace-host, tab-host, panel-layout, status-bar) di atas primitive foundation | AC-1, AC-2 | Selesai |
| 2   | Bangun `workspace.store.ts` dengan `TabDescriptor` dan operasi tab, sambungkan ke tab host                                 | AC-3       | Selesai |
| 3   | Bangun infrastruktur context menu (directive plus service) dengan dukungan keyboard                                        | AC-4       | Selesai |
| 4   | Definisikan `app.routes.ts` lazy untuk semua fitur dengan placeholder                                                      | AC-5       | Selesai |
| 5   | Bangun `core/errors/` (presenter plus boundary) terhubung `SdkError`                                                       | AC-6       | Selesai |
| 6   | Baseline aksesibilitas dan responsivitas (landmark, fokus, breakpoint 1024), plus e2e keyboard dasar di Playwright         | AC-7, AC-8 | Selesai |

## Rencana acceptance dan status evidence

| AC                   | Ringkasan kebutuhan                                                                                                 | Test / proof ID                   | Status evidence |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------- | --------------- |
| [AC-1](test.md#ac-1) | Shell lengkap: top bar, sidebar lipat, workspace dengan tab host, panel bawah, status bar dari primitive foundation | `VIS-0015-AC1`, `MANUAL-0015-AC1` | Terbukti (PASS) |
| [AC-2](test.md#ac-2) | Panel sidebar dan bawah bisa di drag dan dilipat; ukuran tersimpan sementara di memori                              | `E2E-0015-AC2`                    | Terbukti (PASS) |
| [AC-3](test.md#ac-3) | Tab host mendukung buka, tutup, pindah aktif; state tiap tab terisolasi                                             | `E2E-0015-AC3`                    | Terbukti (PASS) |
| [AC-4](test.md#ac-4) | Context menu sebagai directive/service; satu menu terbuka; bisa diakses keyboard                                    | `E2E-0015-AC4`, `VIS-0015-AC4`    | Terbukti (PASS) |
| [AC-5](test.md#ac-5) | Routing lazy untuk semua fitur V1 dengan placeholder ringan                                                         | `IT-0015-AC5`, `E2E-0015-AC5`     | Terbukti (PASS) |
| [AC-6](test.md#ac-6) | Error presenter menerima `SdkError`, menampilkan pesan aman plus correlation ID; boundary menjaga shell             | `IT-0015-AC6`                     | Terbukti (PASS) |
| [AC-7](test.md#ac-7) | Navigasi utama, toggle sidebar, tab, dan dialog dapat dijalankan keyboard; landmark ARIA dasar                      | `E2E-0015-AC7`, `VIS-0015-AC7`    | Terbukti (PASS) |
| [AC-8](test.md#ac-8) | Layout utuh pada 1024 px; di bawahnya sidebar otomatis menjadi overlay                                              | `VIS-0015-AC8`                    | Terbukti (PASS) |

## Follow-up

- [ ] Spec 0030 menambahkan persistensi `WorkspaceState` ke server.
