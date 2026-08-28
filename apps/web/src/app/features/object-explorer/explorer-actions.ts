import type { ConnectionStatus, ExplorerObjectRef, ExplorerObjectType } from '@myadmin/sdk-angular';

export type ExplorerNodeKind =
  | 'group'
  | 'connection'
  | 'database'
  | 'schema'
  | 'object-group'
  | 'object'
  | 'column'
  | 'load-more';

export interface ExplorerNode {
  readonly id: string;
  readonly parentId: string | null;
  readonly connectionId: string | null;
  readonly kind: ExplorerNodeKind;
  readonly label: string;
  readonly detail?: string;
  readonly database?: string;
  readonly schema?: string | null;
  readonly objectType?: ExplorerObjectType;
  readonly ref?: ExplorerObjectRef;
  readonly hasChildren: boolean;
  readonly depth: number;
  readonly expanded: boolean;
  readonly loaded: boolean;
  readonly loading: boolean;
  readonly error: string | null;
  readonly cursor: string | null;
  readonly childIds: readonly string[];
}

export type ExplorerFeatureId =
  'connections' | 'database' | 'data-browser' | 'table-designer' | 'view-editor' | 'query-editor';

export interface ExplorerAction {
  readonly id:
    | 'connect'
    | 'disconnect'
    | 'edit-connection'
    | 'test-connection'
    | 'browse-database'
    | 'drop-database'
    | 'browse-data'
    | 'design-table'
    | 'open-definition'
    | 'refresh';
  readonly label: string;
  readonly disabled: boolean;
  readonly reason?: string;
}

const DEFAULT_INSTALLED_FEATURES: readonly ExplorerFeatureId[] = ['connections', 'database'];

function connected(status: ConnectionStatus | null): boolean {
  return status?.status === 'connected';
}

function connectionRequired(
  status: ConnectionStatus | null,
): Pick<ExplorerAction, 'disabled' | 'reason'> {
  return connected(status)
    ? { disabled: false }
    : { disabled: true, reason: 'Connect this connection to browse metadata.' };
}

/** Context action policy. Feature availability is supplied separately from provider capabilities. */
export class ExplorerActionRegistry {
  private readonly installed: ReadonlySet<ExplorerFeatureId>;

  public constructor(installedFeatures: readonly ExplorerFeatureId[] = DEFAULT_INSTALLED_FEATURES) {
    this.installed = new Set(installedFeatures);
  }

  public actionsFor(
    node: ExplorerNode,
    status: ConnectionStatus | null,
  ): readonly ExplorerAction[] {
    const actions: ExplorerAction[] = [];
    const add = (
      id: ExplorerAction['id'],
      label: string,
      feature: ExplorerFeatureId | null = null,
      state: Pick<ExplorerAction, 'disabled' | 'reason'> = { disabled: false },
    ): void => {
      if (feature !== null && !this.installed.has(feature)) return;
      actions.push({ id, label, ...state });
    };

    if (node.kind === 'connection') {
      add(
        connected(status) ? 'disconnect' : 'connect',
        connected(status) ? 'Disconnect' : 'Connect',
      );
      add('edit-connection', 'Edit connection', 'connections');
      add('test-connection', 'Test connection', 'connections');
      add('refresh', 'Refresh node', null, connectionRequired(status));
      return actions;
    }

    const state = connectionRequired(status);
    if (node.kind === 'database') {
      add('browse-database', 'Browse database', 'database', state);
      add('drop-database', 'Drop database', 'database', state);
    }
    if (node.kind === 'object' && node.ref?.type === 'table')
      add('browse-data', 'Browse data', 'data-browser', state);
    if (node.kind === 'object' && node.ref?.type === 'table')
      add('design-table', 'Design table', 'table-designer', state);
    if (node.kind === 'object' && node.ref?.type === 'view') {
      const capability = status?.capability;
      const supported = capability?.capabilities['viewEditor'] === true;
      add(
        'open-definition',
        'Open definition',
        'view-editor',
        supported
          ? state
          : {
              disabled: true,
              reason:
                capability?.reasons?.['viewEditor'] ??
                'This provider does not support view editing.',
            },
      );
    }
    if (node.kind === 'object' && (node.ref?.type === 'routine' || node.ref?.type === 'trigger'))
      add('open-definition', 'Open definition', 'query-editor', state);
    add('refresh', 'Refresh node', null, state);
    return actions;
  }
}
