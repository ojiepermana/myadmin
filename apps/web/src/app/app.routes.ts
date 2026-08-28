import type { Routes } from '@angular/router';
import { environment } from '../environments/environment';

export const routes: Routes = environment.devDemo
  ? [
      { path: '', pathMatch: 'full', redirectTo: '__dev/ui-foundation' },
      {
        path: '__dev/ui-foundation',
        loadComponent: () =>
          import('./features/ui-foundation-demo/ui-foundation-demo').then(
            ({ UiFoundationDemo }) => UiFoundationDemo,
          ),
      },
    ]
  : [];
