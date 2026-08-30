# 0056. UI foundation dan capability gap

## Summary

UI generik tetap memakai `@ojiepermana/angular` sebagai foundation tunggal. Custom component hanya dibuat untuk capability gap yang tertulis, dengan accessibility dan interaction proof yang sesuai.

## Scope

1. Shell, dialog, menu, tabs, forms, loading, table, overlay, dan resizable foundation.
2. Table designer serta object explorer yang memiliki gap capability.
3. WCAG AA, keyboard behavior, focus, tree atau grid semantics, dan test browser.

## Standard definition

**Canonical pattern**:

```text
feature requirement
        ↓
foundation capability audit
        ↓
@ojiepermana/angular component or Angular Aria pattern
        ↓
MyAdmin theme and feature styling
        ↓
keyboard, focus, screen reader, and Playwright proof
```

**Replaces**:

1. Komponen generik buatan feature ketika foundation sudah memiliki capability.
2. Custom overlay atau tree tanpa alasan gap dan tanpa semantic accessibility.
3. Import langsung design system kedua dari feature.

**Enforcement**:

1. Review capability audit sebelum custom component.
2. Boundary check menjaga foundation import tetap konsisten.
3. Angular build dan focused test memeriksa state, keyboard, focus, dan interaction.
4. Playwright menjadi bukti untuk behavior browser yang tidak terbukti dari Bun test.

**Rollout**:

Tiga slice pertama sudah ditetapkan dari temuan review implementasi 2026-08-29, dikerjakan sebelum audit inventory yang lebih luas:

1. Modal drop database dan schema pindah dari overlay buatan tangan ke Dialog foundation (focus trap, Escape, pengembalian focus), memakai `role="alertdialog"` untuk aksi destruktif.
2. Result grid mendapat jalur keyboard untuk edit sel (Enter atau F2) sehingga edit tidak lagi hanya lewat double click.
3. Result grid memakai roving tabindex (satu tab stop per grid) mengikuti pola yang sudah benar pada object explorer tree.

Setelah itu audit ulang component inventory, migrasikan komponen generik yang sudah dapat diganti, lalu kerjakan gap object explorer dan table designer dengan test accessibility per behavior.

**Exceptions**:

Custom component boleh bila capability foundation atau Angular Aria belum memenuhi kebutuhan. Exception harus menunjuk audit gap, owner, expected retirement atau review date, serta bukti WCAG AA.

## Rationale

Foundation yang sudah dipakai adalah keputusan project. Menambah design system kedua akan membagi token, focus behavior, dan maintenance. Capability gap tetap boleh ditangani, tetapi harus menjadi keputusan sadar dan dapat dihapus bila foundation bertambah.
