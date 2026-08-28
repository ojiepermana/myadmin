import { AuditEvents, withAudit } from '@myadmin/audit';
import type { AuditWriter } from '@myadmin/audit';
import type {
  DbError,
  ObjectRef,
  PageRequest,
  ViewChangeSet,
  ViewDefinition,
} from '@myadmin/database-core';
import type {
  ConnectionActor,
  ConnectionManagerService,
  ConnectedProviderSession,
} from '../connections/connection-manager';

export interface ViewMutationInput {
  readonly connectionId: string;
  readonly ref: ObjectRef;
  readonly definitionSql?: string;
  readonly allowDropCreate?: boolean;
  readonly confirmName?: string;
}

export interface ViewMutationResult {
  readonly view: ViewDefinition;
  readonly changeSet: ViewChangeSet;
}

export interface ViewValidationResult {
  readonly valid: true;
}

export class ViewManagementError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ViewManagementError';
  }
}

function refText(ref: ObjectRef): string {
  return [ref.database, ref.schema, ref.name]
    .filter((value): value is string => Boolean(value))
    .join('.');
}

function validRef(ref: ObjectRef): ObjectRef {
  if (
    ref.type !== 'view' ||
    typeof ref.database !== 'string' ||
    ref.database.trim() === '' ||
    typeof ref.name !== 'string' ||
    ref.name.trim() === '' ||
    (ref.schema !== undefined &&
      ref.schema !== null &&
      (typeof ref.schema !== 'string' || ref.schema.trim() === ''))
  ) {
    throw new ViewManagementError('VIEW_VALIDATION_FAILED', 'The view reference is invalid.', 422);
  }
  return {
    database: ref.database.trim(),
    schema: ref.schema?.trim() || null,
    name: ref.name.trim(),
    type: 'view',
  };
}

function definition(definitionSql: string | undefined): string {
  if (typeof definitionSql !== 'string' || definitionSql.trim() === '') {
    throw new ViewManagementError(
      'VIEW_VALIDATION_FAILED',
      'A SELECT definition is required.',
      422,
      {
        fields: { definitionSql: ['required'] },
      },
    );
  }
  return definitionSql.trim();
}

function providerFor(session: ConnectedProviderSession) {
  if (session.provider.view === undefined) {
    throw new ViewManagementError(
      'VIEW_EDITOR_UNSUPPORTED',
      'View editing is unavailable for this provider.',
      501,
    );
  }
  return session.provider.view;
}

function ensureCapability(session: ConnectedProviderSession): Promise<void> {
  return session.provider.capability.describe(session.handle).then((capability) => {
    if (!capability.capabilities.viewEditor) {
      throw new ViewManagementError(
        'VIEW_EDITOR_UNSUPPORTED',
        capability.reasons?.viewEditor ?? 'View editing is unavailable for this connection.',
        501,
      );
    }
  });
}

function missingPreview(operation: string): never {
  throw new ViewManagementError(
    'VIEW_EDITOR_UNSUPPORTED',
    `The provider does not expose a ${operation} view change preview.`,
    501,
  );
}

function missingApply(): never {
  throw new ViewManagementError(
    'VIEW_EDITOR_UNSUPPORTED',
    'The provider does not expose view change application.',
    501,
  );
}

/** Application use case for provider driven view CRUD and audit ordering. */
export class ViewManagementService {
  private readonly auditWriter: AuditWriter | undefined;

  public constructor(
    private readonly connectionManager: Pick<ConnectionManagerService, 'withConnectedProvider'>,
    auditWriter?: AuditWriter,
  ) {
    this.auditWriter = auditWriter;
  }

  public async get(
    actor: ConnectionActor,
    connectionId: string,
    ref: ObjectRef,
  ): Promise<ViewDefinition> {
    const target = validRef(ref);
    return this.connectionManager.withConnectedProvider(actor, connectionId, async (session) => {
      await ensureCapability(session);
      return providerFor(session).getDefinition(session.handle, target);
    });
  }

  public async list(
    actor: ConnectionActor,
    connectionId: string,
    parent: ObjectRef,
    page?: PageRequest,
  ): Promise<{ readonly items: ObjectRef[]; readonly cursor: string | null }> {
    const target = {
      ...parent,
      type: parent.type === 'schema' ? 'schema' : 'database',
    } as ObjectRef;
    return this.connectionManager.withConnectedProvider(actor, connectionId, async (session) => {
      await ensureCapability(session);
      const result = await providerFor(session).list(session.handle, target, page);
      return { items: result.items, cursor: result.cursor ?? null };
    });
  }

  public async previewCreate(
    actor: ConnectionActor,
    input: ViewMutationInput,
  ): Promise<ViewChangeSet> {
    const view: ViewDefinition = {
      ref: validRef(input.ref),
      definition: definition(input.definitionSql),
    };
    return this.connectionManager.withConnectedProvider(
      actor,
      input.connectionId,
      async (session) => {
        await ensureCapability(session);
        const preview = providerFor(session).previewCreate;
        if (!preview) missingPreview('create');
        return preview.call(providerFor(session), session.handle, view);
      },
    );
  }

  public async previewAlter(
    actor: ConnectionActor,
    input: ViewMutationInput,
  ): Promise<ViewChangeSet> {
    const view: ViewDefinition = {
      ref: validRef(input.ref),
      definition: definition(input.definitionSql),
    };
    return this.connectionManager.withConnectedProvider(
      actor,
      input.connectionId,
      async (session) => {
        await ensureCapability(session);
        const preview = providerFor(session).previewAlter;
        if (!preview) missingPreview('alter');
        return preview.call(providerFor(session), session.handle, view);
      },
    );
  }

  public async previewDrop(
    actor: ConnectionActor,
    connectionId: string,
    ref: ObjectRef,
  ): Promise<ViewChangeSet> {
    const target = validRef(ref);
    return this.connectionManager.withConnectedProvider(actor, connectionId, async (session) => {
      await ensureCapability(session);
      const preview = providerFor(session).previewDrop;
      if (!preview) missingPreview('drop');
      return preview.call(providerFor(session), session.handle, target);
    });
  }

  public async validate(
    actor: ConnectionActor,
    input: Pick<ViewMutationInput, 'connectionId' | 'definitionSql'>,
  ): Promise<ViewValidationResult> {
    const sql = definition(input.definitionSql);
    return this.connectionManager.withConnectedProvider(
      actor,
      input.connectionId,
      async (session) => {
        await ensureCapability(session);
        if (!session.provider.query) {
          throw new ViewManagementError(
            'VIEW_EDITOR_UNSUPPORTED',
            'The provider does not expose SQL validation.',
            501,
          );
        }
        const statements = session.provider.query.splitStatements(sql);
        const statement = statements[0]?.sql.trim() ?? '';
        if (
          statements.length !== 1 ||
          !/^(?:select|with)\b/i.test(
            statement.replace(/^(?:--[^\n]*\n|\/\*[\s\S]*?\*\/\s*)+/i, ''),
          )
        ) {
          throw new ViewManagementError(
            'VIEW_VALIDATION_FAILED',
            'A view definition must contain one SELECT statement.',
            422,
          );
        }
        await session.provider.query.explain(session.handle, {
          sql,
        });
        return { valid: true };
      },
    );
  }

  public async create(
    actor: ConnectionActor,
    input: ViewMutationInput,
  ): Promise<ViewMutationResult> {
    const view: ViewDefinition = {
      ref: validRef(input.ref),
      definition: definition(input.definitionSql),
    };
    return this.mutate(
      actor,
      input.connectionId,
      AuditEvents.view.created.action,
      view.ref,
      async (session) => {
        await ensureCapability(session);
        const provider = providerFor(session);
        const preview = provider.previewCreate;
        if (!preview || !provider.applyChangeSet) missingApply();
        const change = await preview.call(provider, session.handle, view);
        await provider.applyChangeSet(session.handle, change);
        session.provider.metadata?.invalidateCache?.(session.handle);
        return {
          view: await provider.getDefinition(session.handle, view.ref).catch(() => view),
          changeSet: change,
        };
      },
    );
  }

  public async alter(
    actor: ConnectionActor,
    input: ViewMutationInput,
  ): Promise<ViewMutationResult> {
    const view: ViewDefinition = {
      ref: validRef(input.ref),
      definition: definition(input.definitionSql),
    };
    return this.mutate(
      actor,
      input.connectionId,
      AuditEvents.view.replaced.action,
      view.ref,
      async (session) => {
        await ensureCapability(session);
        const provider = providerFor(session);
        const preview = provider.previewAlter;
        if (!preview || !provider.applyChangeSet) missingApply();
        const change = await preview.call(provider, session.handle, view);
        if (change.strategy === 'drop_create') {
          if (input.allowDropCreate !== true || input.confirmName !== view.ref.name) {
            throw new ViewManagementError(
              'VIEW_DROP_CREATE_CONFIRMATION_REQUIRED',
              'This update requires explicit drop and create confirmation.',
              409,
              { changeSet: change, confirmName: view.ref.name },
            );
          }
        }
        await provider.applyChangeSet(session.handle, change);
        session.provider.metadata?.invalidateCache?.(session.handle);
        return {
          view: await provider.getDefinition(session.handle, view.ref).catch(() => view),
          changeSet: change,
        };
      },
    );
  }

  public async drop(
    actor: ConnectionActor,
    connectionId: string,
    ref: ObjectRef,
    confirmName: string,
  ): Promise<ViewChangeSet> {
    const target = validRef(ref);
    if (confirmName !== target.name) {
      throw new ViewManagementError(
        'VIEW_CONFIRMATION_REQUIRED',
        'Type the exact view name to confirm this drop.',
        409,
        {
          confirmName: target.name,
        },
      );
    }
    return this.mutate(
      actor,
      connectionId,
      AuditEvents.view.dropped.action,
      target,
      async (session) => {
        await ensureCapability(session);
        const provider = providerFor(session);
        const preview = provider.previewDrop;
        if (!preview || !provider.applyChangeSet) missingApply();
        const change = await preview.call(provider, session.handle, target);
        await provider.applyChangeSet(session.handle, change);
        session.provider.metadata?.invalidateCache?.(session.handle);
        return change;
      },
    );
  }

  private async mutate<T>(
    actor: ConnectionActor,
    connectionId: string,
    action:
      | typeof AuditEvents.view.created.action
      | typeof AuditEvents.view.replaced.action
      | typeof AuditEvents.view.dropped.action,
    ref: ObjectRef,
    operation: (session: ConnectedProviderSession) => Promise<T>,
  ): Promise<T> {
    if (!this.auditWriter)
      throw new ViewManagementError('AUDIT_UNAVAILABLE', 'Audit data is unavailable.', 500);
    return this.connectionManager.withConnectedProvider(actor, connectionId, (session) =>
      withAudit(
        this.auditWriter!,
        {
          action,
          actorUserId: actor.id,
          targetType: 'view',
          targetRef: refText(ref),
          connectionId,
          details: {
            strategy:
              action === AuditEvents.view.created.action
                ? 'create'
                : action === AuditEvents.view.dropped.action
                  ? 'drop'
                  : 'replace',
          },
        },
        () => operation(session),
      ),
    );
  }
}

export function dbErrorDetails(error: DbError): Record<string, unknown> {
  return {
    category: error.category,
    ...(error.position === undefined ? {} : { position: error.position }),
    ...(error.sqlState === undefined ? {} : { sqlState: error.sqlState }),
  };
}
