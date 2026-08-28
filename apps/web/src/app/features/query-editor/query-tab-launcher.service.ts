import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { WorkspaceStore } from '../../core/state/workspace.store';

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
    this.workspace.openTab({
      id,
      type: 'query-editor',
      title: input.title?.trim() || 'SQL editor',
      context: {
        route: '/query-editor',
        draftSql: input.sql,
        ...(input.connectionId ? { connectionId: input.connectionId } : {}),
        ...(input.database ? { database: input.database } : {}),
        ...(input.schema ? { schema: input.schema } : {}),
        ...(input.connectionMissing ? { connectionMissing: true } : {}),
        ...(input.savedQueryName ? { savedQueryName: input.savedQueryName } : {}),
      },
    });
    void this.router.navigate(['/query-editor'], { queryParams: { tab: id } });
  }
}
