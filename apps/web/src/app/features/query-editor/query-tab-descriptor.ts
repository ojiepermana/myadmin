import type { TabDescriptor } from '../../core/state/workspace.store';

export interface QueryTabDescriptorInput {
  readonly sql: string;
  readonly connectionId?: string | null;
  readonly database?: string | null;
  readonly schema?: string | null;
  readonly title?: string;
  readonly connectionMissing?: boolean;
  readonly savedQueryName?: string;
}

export function queryTabDescriptor(id: string, input: QueryTabDescriptorInput): TabDescriptor {
  return {
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
  };
}
