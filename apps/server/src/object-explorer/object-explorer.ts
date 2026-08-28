import {
  DbError,
  type DatabaseObjectType,
  type DatabaseDefinition,
  type MetadataObjectType,
  type MetadataPort,
  type ObjectRef,
  type PageRequest,
  type TableDescription,
} from '@myadmin/database-core';
import {
  type ConnectedProviderSession,
  type ConnectionActor,
  type ConnectionManagerService,
} from '../connections/connection-manager';

export interface ExplorerPage<T> {
  readonly items: readonly T[];
  readonly cursor: string | null;
}

export interface ExplorerSchemaChild {
  readonly kind: 'schema';
  readonly database: string;
  readonly schema: string;
  readonly name: string;
  readonly hasChildren: true;
  readonly isSystem: boolean;
}

export interface ExplorerObjectGroupChild {
  readonly kind: 'object-group';
  readonly database: string;
  readonly schema: string | null;
  readonly objectType: MetadataObjectType;
  readonly name: string;
  readonly hasChildren: true;
}

export interface ExplorerObjectChild {
  readonly kind: 'object';
  readonly ref: ObjectRef;
  readonly hasChildren: boolean;
}

export type ExplorerDatabaseChild = ExplorerSchemaChild | ExplorerObjectGroupChild;

export interface ExplorerObjectDescription {
  readonly ref: ObjectRef;
  readonly columns: TableDescription['columns'];
  readonly estimatedRows?: number;
  readonly comment?: string;
}

export interface ExplorerPageInput extends PageRequest {
  readonly refresh?: boolean;
}

const FALLBACK_OBJECT_TYPES: readonly MetadataObjectType[] = [
  'table',
  'view',
  'routine',
  'sequence',
  'trigger',
];

function page<T>(value: readonly T[] | { items: readonly T[]; cursor?: string }): ExplorerPage<T> {
  if (Array.isArray(value)) return { items: value as readonly T[], cursor: null };
  const pageValue = value as { items: readonly T[]; cursor?: string };
  return { items: pageValue.items, cursor: pageValue.cursor ?? null };
}

function objectTypes(metadata: MetadataPort): readonly MetadataObjectType[] {
  return metadata.objectTypes?.length ? metadata.objectTypes : FALLBACK_OBJECT_TYPES;
}

function metadataFor(session: ConnectedProviderSession): MetadataPort {
  if (!session.provider.metadata) {
    throw new DbError({
      category: 'unsupported',
      message: 'This connection does not expose metadata browsing.',
    });
  }
  return session.provider.metadata;
}

function schemaRef(database: string, schema: string): ObjectRef {
  return { database, schema, name: schema, type: 'schema' };
}

function objectGroupNodes(
  database: string,
  schema: string | null,
  metadata: MetadataPort,
): ExplorerObjectGroupChild[] {
  return objectTypes(metadata).map((objectType) => ({
    kind: 'object-group',
    database,
    schema,
    objectType,
    name: objectType,
    hasChildren: true,
  }));
}

/** Provider-neutral explorer orchestration. Authorization and session checks stay in the manager. */
export class ObjectExplorerService {
  public constructor(
    private readonly connectionManager: Pick<ConnectionManagerService, 'withConnectedProvider'>,
  ) {}

  public listDatabases(
    actor: ConnectionActor,
    connectionId: string,
    input: ExplorerPageInput = {},
  ): Promise<ExplorerPage<DatabaseDefinition>> {
    return this.withMetadata(actor, connectionId, input, (metadata, session) =>
      metadata.listDatabases(session.handle, input).then((result) => page(result)),
    );
  }

  public async listDatabaseChildren(
    actor: ConnectionActor,
    connectionId: string,
    database: string,
    input: ExplorerPageInput = {},
  ): Promise<ExplorerPage<ExplorerDatabaseChild>> {
    return this.connectionManager.withConnectedProvider(actor, connectionId, async (session) => {
      const metadata = metadataFor(session);
      this.invalidate(metadata, session, input);
      const capability = await session.provider.capability.describe(session.handle);
      if (capability.capabilities.schemas) {
        const schemas = await metadata.listSchemas(session.handle, database, input);
        return page(
          schemas.items.map((schema) => ({
            kind: 'schema' as const,
            database,
            schema: schema.name,
            name: schema.name,
            hasChildren: true as const,
            isSystem: schema.isSystem === true,
          })),
        );
      }
      return page(objectGroupNodes(database, null, metadata));
    });
  }

  public async listSchemaObjects(
    actor: ConnectionActor,
    connectionId: string,
    schema: string,
    input: ExplorerPageInput & {
      readonly database?: string;
      readonly type?: MetadataObjectType;
    } = {},
  ): Promise<ExplorerPage<ExplorerObjectGroupChild | ExplorerObjectChild>> {
    return this.connectionManager.withConnectedProvider(actor, connectionId, async (session) => {
      const metadata = metadataFor(session);
      this.invalidate(metadata, session, input);
      const database = input.database ?? session.connection.initialDatabase ?? '';
      const capability = await session.provider.capability.describe(session.handle);
      if (!capability.capabilities.schemas) {
        throw new DbError({
          category: 'unsupported',
          message: 'This provider does not expose schema nodes.',
        });
      }
      if (!input.type) return page(objectGroupNodes(database, schema, metadata));
      const parent = schemaRef(database, schema);
      const objects = await metadata.listObjects(session.handle, parent, {
        cursor: input.cursor,
        limit: input.limit,
        types: [input.type],
      });
      return page(
        objects.items.map((ref) => ({
          kind: 'object' as const,
          ref,
          hasChildren: ref.type === 'table',
        })),
      );
    });
  }

  public async listObjectGroup(
    actor: ConnectionActor,
    connectionId: string,
    database: string,
    objectType: MetadataObjectType,
    input: ExplorerPageInput & { readonly schema?: string | null } = {},
  ): Promise<ExplorerPage<ExplorerObjectChild>> {
    return this.withMetadata(actor, connectionId, input, async (metadata, session) => {
      const capability = await session.provider.capability.describe(session.handle);
      const parent: ObjectRef = {
        database,
        schema: input.schema ?? null,
        name: input.schema ?? database,
        type: input.schema ? 'schema' : 'database',
      };
      if (capability.capabilities.schemas && !input.schema) {
        throw new DbError({
          category: 'unsupported',
          message: 'Schema-capable providers require a schema object.',
        });
      }
      const objects = await metadata.listObjects(session.handle, parent, {
        cursor: input.cursor,
        limit: input.limit,
        types: [objectType],
      });
      return page(
        objects.items.map((ref) => ({
          kind: 'object' as const,
          ref,
          hasChildren: ref.type === 'table',
        })),
      );
    });
  }

  public async describeObject(
    actor: ConnectionActor,
    connectionId: string,
    ref: ObjectRef,
    refresh = false,
  ): Promise<ExplorerObjectDescription> {
    return this.connectionManager.withConnectedProvider(actor, connectionId, async (session) => {
      const metadata = metadataFor(session);
      this.invalidate(metadata, session, { refresh });
      if (ref.type !== 'table') {
        throw new DbError({
          category: 'unsupported',
          message: 'Only table descriptions are available in the explorer.',
        });
      }
      const description: Pick<TableDescription, 'ref' | 'columns' | 'estimatedRows' | 'comment'> =
        metadata.describeTable
          ? await metadata.describeTable(session.handle, ref)
          : {
              ref,
              columns: (await metadata.listColumns(session.handle, ref)).items,
            };
      return {
        ref: description.ref,
        columns: description.columns,
        ...(description.estimatedRows === undefined
          ? {}
          : { estimatedRows: description.estimatedRows }),
        ...(description.comment === undefined ? {} : { comment: description.comment }),
      };
    });
  }

  private withMetadata<T>(
    actor: ConnectionActor,
    connectionId: string,
    input: ExplorerPageInput,
    operation: (metadata: MetadataPort, session: ConnectedProviderSession) => Promise<T>,
  ): Promise<T> {
    return this.connectionManager.withConnectedProvider(actor, connectionId, async (session) => {
      const metadata = metadataFor(session);
      this.invalidate(metadata, session, input);
      return operation(metadata, session);
    });
  }

  private invalidate(
    metadata: MetadataPort,
    session: ConnectedProviderSession,
    input: ExplorerPageInput,
  ): void {
    if (input.refresh) metadata.invalidateCache?.(session.handle);
  }
}

export function parseObjectRef(value: string | null): ObjectRef | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const ref = parsed as Record<string, unknown>;
    if (
      typeof ref['database'] !== 'string' ||
      typeof ref['name'] !== 'string' ||
      !isDatabaseObjectType(ref['type']) ||
      (ref['schema'] !== undefined && ref['schema'] !== null && typeof ref['schema'] !== 'string')
    )
      return null;
    return {
      database: ref['database'],
      schema: (ref['schema'] as string | null | undefined) ?? null,
      name: ref['name'],
      type: ref['type'],
    };
  } catch {
    return null;
  }
}

function isDatabaseObjectType(value: unknown): value is DatabaseObjectType {
  return (
    value === 'database' ||
    value === 'schema' ||
    value === 'table' ||
    value === 'view' ||
    value === 'routine' ||
    value === 'sequence' ||
    value === 'trigger' ||
    value === 'other'
  );
}
