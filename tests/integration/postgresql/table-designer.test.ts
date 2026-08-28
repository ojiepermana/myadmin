import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  ConnectionContext,
  type ConnectionHandle,
  type TableChangeSet,
} from '../../../packages/database-core/src';
import { createPostgresqlProvider } from '../../../packages/database-postgresql/src';

const enabled = process.env['MYADMIN_POSTGRES_INTEGRATION'] === '1';
const port = Number(process.env['MYADMIN_POSTGRES_CURRENT_PORT'] ?? 55433);
const schema = 'myadmin_table_designer_0041';
const table = `accounts_${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`;

function context(): ConnectionContext {
  return new ConnectionContext(
    {
      engine: 'postgresql',
      host: process.env['MYADMIN_POSTGRES_HOST'] ?? '127.0.0.1',
      port,
      user: process.env['MYADMIN_POSTGRES_USER'] ?? 'myadmin_test',
      database: process.env['MYADMIN_POSTGRES_DATABASE'] ?? 'myadmin_test',
      tls: { mode: 'disable' },
      timeoutMs: 5000,
    },
    process.env['MYADMIN_POSTGRES_PASSWORD'] ?? 'myadmin_test_password',
  );
}

describe('PostgreSQL table designer integration', () => {
  if (!enabled) {
    test.skip('requires MYADMIN_POSTGRES_INTEGRATION=1 and the PostgreSQL fixture', () =>
      undefined);
    return;
  }

  const provider = createPostgresqlProvider();
  let handle: ConnectionHandle | undefined;
  const ref = {
    database: context().descriptor.database ?? 'myadmin_test',
    schema,
    name: table,
    type: 'table' as const,
  };

  beforeAll(async () => {
    handle = await provider.connection.open(context());
    await provider.connection.execute(handle, `DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await provider.connection.execute(handle, `CREATE SCHEMA "${schema}"`);
  });

  afterAll(async () => {
    if (!handle) return;
    await provider.connection.execute(handle, `DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await provider.connection.close(handle);
  });

  test('[IT-0041-AC3, IT-0041-AC4] previews and applies create, add, and destructive drop changes', async () => {
    const create: TableChangeSet = {
      operation: 'create',
      ref,
      columns: [
        { name: 'id', dataType: 'integer', nullable: false, identity: true, primaryKey: true },
        { name: 'name', dataType: 'varchar', length: 80, nullable: false },
      ],
    };
    const createPreview = await provider.tableDesigner.preview(context(), create);
    expect(createPreview.statements[0]?.sql).toContain('CREATE TABLE');
    await expect(provider.tableDesigner.apply(context(), create)).resolves.toMatchObject({
      committed: true,
    });

    const add: TableChangeSet = {
      operation: 'alter',
      ref,
      alterations: [{ kind: 'add', column: { name: 'notes', dataType: 'text', nullable: true } }],
    };
    await expect(provider.tableDesigner.apply(context(), add)).resolves.toMatchObject({
      committed: true,
    });

    const drop: TableChangeSet = {
      operation: 'alter',
      ref,
      alterations: [{ kind: 'drop', name: 'notes' }],
    };
    await expect(provider.tableDesigner.preview(context(), drop)).resolves.toMatchObject({
      destructive: true,
    });
    await expect(provider.tableDesigner.apply(context(), drop)).resolves.toMatchObject({
      committed: true,
    });
  });
});
