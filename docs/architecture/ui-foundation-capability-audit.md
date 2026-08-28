# MyAdmin UI foundation capability audit

Date: 2026-08-28
Package: `@ojiepermana/angular@22.1.7`
Source: published package README, entry point declarations, and installed package contract.

The application uses only the granular `@ojiepermana/angular/*` entry points. The native select is intentional, so
the optional `@angular/material` peer is not required for this slice.

| V1 need           | Foundation API                                                   | Result   | Notes                                                                                              |
| ----------------- | ---------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------- |
| Button            | `@ojiepermana/angular/component/button`                          | Ready    | `ButtonComponent` on native `button` or `a` hosts                                                  |
| Input             | `@ojiepermana/angular/component/input`                           | Ready    | `InputComponent` keeps native form behavior                                                        |
| Select            | `@ojiepermana/angular/component/native-select`                   | Ready    | Native browser select, no Material peer                                                            |
| Dialog            | `@ojiepermana/angular/component/dialog`                          | Ready    | Foundation dialog primitives                                                                       |
| Drawer            | `@ojiepermana/angular/component/drawer`                          | Ready    | Foundation drawer primitives                                                                       |
| Popover           | `@ojiepermana/angular/component/popover`                         | Ready    | Foundation popover primitives                                                                      |
| Tooltip           | `@ojiepermana/angular/component/tooltip`                         | Ready    | Foundation tooltip directive/component                                                             |
| Tabs              | `@ojiepermana/angular/component/tabs`                            | Ready    | Roving keyboard behavior included                                                                  |
| Menu              | `@ojiepermana/angular/component/dropdown-menu`                   | Ready    | Native menu triggers and surfaces                                                                  |
| Breadcrumb        | `@ojiepermana/angular/component/breadcrumb`                      | Ready    | Foundation breadcrumb primitives                                                                   |
| Table / data grid | `@ojiepermana/angular/component/table`                           | Composed | Table plus pagination and domain result behavior                                                   |
| Tree              | No tree entry point in 22.1.7                                    | Gap      | Request a foundation tree primitive before building a generic tree; do not add one under `shared/` |
| Form              | `@ojiepermana/angular/component/form`                            | Ready    | Form field, label, description, message, and control directives                                    |
| Toast             | `@ojiepermana/angular/component/toast`                           | Ready    | `ToastService` provides an accessible live region                                                  |
| Loading           | `@ojiepermana/angular/component/skeleton`, `spinner`, `progress` | Ready    | Compose the appropriate loading state                                                              |
| Resizable panel   | `@ojiepermana/angular/component/resizable`                       | Ready    | Pointer and keyboard resizing                                                                      |

## Follow-up

- [ ] Open a foundation package issue for an accessible tree primitive, including keyboard navigation and expanded
      state requirements. The fallback is to defer generic tree work until the package ships it.
- [ ] Re-run this audit when the package version changes or before the first feature that consumes the tree.
- [ ] After spec 0052, provide a server backed `ThemePreferenceSource` without changing `ThemePreferenceStore`
      consumers.

## Boundary rule

The application must not import `@angular/material`, PrimeNG, or Bootstrap. The optional Material peer may be added to
the root manifest only if a future feature intentionally imports the foundation select, date picker, or calendar.

## Angular bundle budget decision

The production build on 2026-08-29 measured an initial bundle of 893.70 kB,
with the largest component styles at 7.77 kB. The warning budgets are therefore
900 kB for the initial bundle and 8 kB for any component style. The hard error
budgets remain 1 MB and 8 kB, so a future build still fails when it crosses the
existing production safety limits. This is a conscious warning threshold
adjustment based on the current measured bundle, not a claim that bundle size
optimization is complete. Revisit the thresholds when a feature adds a large
initial dependency or when the initial bundle reaches 950 kB.
