import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { WorkspaceStore } from '../../core/state/workspace.store';
import { queryTabDescriptor } from './query-tab-descriptor';

export interface QueryTabLaunchInput {
  readonly sql: string;
  readonly connectionId?: string | null;
  readonly database?: string | null;
  readonly schema?: string | null;
  readonly title?: string;
  readonly connectionMissing?: boolean;
  readonly savedQueryName?: string;
}

/** Opens query-library items in isolated tabs with their execution context intact. */
@Injectable({ providedIn: 'root' })
export class QueryTabLauncher {
  private readonly router = inject(Router);
  private readonly workspace = inject(WorkspaceStore);

  open(input: QueryTabLaunchInput): void {
    const id = `query-editor-${crypto.randomUUID()}`;
    this.workspace.openTab(queryTabDescriptor(id, input));
    void this.router.navigate(['/query-editor'], { queryParams: { tab: id } });
  }
}
