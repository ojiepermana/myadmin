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

  test('[IT-0041-AC1, IT-0041-AC2, IT-0041-AC3, IT-0041-AC4, IT-0042-AC1, IT-0042-AC6, IT-0042-AC7] previews and applies create, add, and destructive drop changes', async () => {
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
    const described = await provider.metadata.describeTable!(handle!, ref);
    expect(described.columns.map((column) => column.name)).toEqual(['id', 'name']);

    const add: TableChangeSet = {
      operation: 'alter',
      ref,
      alterations: [{ kind: 'add', column: { name: 'notes', dataType: 'text', nullable: true } }],
    };
    await expect(provider.tableDesigner.apply(context(), add)).resolves.toMatchObject({
      committed: true,
    });

    const indexName = `${table}_lookup_idx`;
    await provider.connection.execute(
      handle!,
      `CREATE INDEX "${indexName}" ON "${schema}"."${table}" ("name")`,
    );
    const dropIndex: TableChangeSet = {
      operation: 'alter',
      ref,
      alterations: [{ kind: 'dropIndex', name: indexName }],
    };
    await expect(provider.tableDesigner.preview(context(), dropIndex)).resolves.toMatchObject({
      destructive: true,
      statements: [expect.objectContaining({ destructiveIndexes: [indexName] })],
    });
    await expect(provider.tableDesigner.apply(context(), dropIndex)).resolves.toMatchObject({
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

  test('[IT-0041-AC8] previews a stable DDL snapshot for every PostgreSQL catalogued type', async () => {
    const types = await provider.tableDesigner.types(context());
    const columns = types.types.map((type, index) => ({
      name: `type_${index}`,
      dataType: type.name,
      nullable: true,
      ...(type.parameters.includes('length') ? { length: 24 } : {}),
      ...(type.parameters.includes('precision') ? { precision: 10, scale: 2 } : {}),
    }));
    const preview = await provider.tableDesigner.preview(context(), {
      operation: 'create',
      ref: { database: ref.database, schema, name: `${table}_all_types`, type: 'table' },
      columns,
    });

    expect(preview.statements).toHaveLength(1);
    expect(preview.statements[0]?.sql).toContain('CREATE TABLE');
    expect(preview.statements[0]?.sql).toContain('"type_0"');
    expect(columns).toHaveLength(types.types.length);
  });

  test('[IT-0041-AC5] rejects an incompatible PostgreSQL default with a field-level issue', async () => {
    const invalid: TableChangeSet = {
      operation: 'create',
      ref: { ...ref, name: `${table}_invalid` },
      columns: [
        {
          name: 'enabled',
          dataType: 'boolean',
          nullable: true,
          default: { kind: 'literal', value: 'maybe' },
        },
      ],
    };
    await expect(provider.tableDesigner.preview(context(), invalid)).rejects.toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({ path: 'columns[0].default', code: 'incompatible_default' }),
      ]),
    });
  });

  test('[IT-0042-AC3, IT-0042-AC4, IT-0042-AC5, IT-0042-AC8] applies and removes real FK and composite unique constraints', async () => {
    const parent = `parents_${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`;
    const parentRef = { database: ref.database, schema, name: parent, type: 'table' as const };
    await provider.connection.execute(
      handle!,
      `CREATE TABLE "${schema}"."${parent}" (id integer PRIMARY KEY)`,
    );
    try {
      const addColumn: TableChangeSet = {
        operation: 'alter',
        ref,
        alterations: [
          { kind: 'add', column: { name: 'parent_id', dataType: 'integer', nullable: true } },
        ],
      };
      await expect(provider.tableDesigner.apply(context(), addColumn)).resolves.toMatchObject({
        committed: true,
      });
      const fkName = `${table}_parent_fk`;
      const uniqueName = `${table}_name_parent_uq`;
      const constraints: TableChangeSet = {
        operation: 'alter',
        ref,
        alterations: [
          {
            kind: 'addConstraint',
            constraint: {
              type: 'foreignKey',
              name: fkName,
              columns: ['parent_id'],
              referencedTable: parentRef,
              referencedColumns: ['id'],
              onDelete: 'CASCADE',
            },
          },
          {
            kind: 'addConstraint',
            constraint: { type: 'unique', name: uniqueName, columns: ['name', 'parent_id'] },
          },
        ],
      };
      await expect(provider.tableDesigner.apply(context(), constraints)).resolves.toMatchObject({
        committed: true,
      });
      const described = await provider.metadata.describeTable!(handle!, ref);
      expect(described.constraints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: fkName, type: 'foreignKey' }),
          expect.objectContaining({ name: uniqueName, type: 'unique' }),
        ]),
      );

      const dropUnique: TableChangeSet = {
        operation: 'alter',
        ref,
        alterations: [{ kind: 'dropConstraint', name: uniqueName, type: 'unique' }],
      };
      await expect(provider.tableDesigner.preview(context(), dropUnique)).resolves.toMatchObject({
        destructive: true,
        statements: [expect.objectContaining({ destructiveConstraints: [uniqueName] })],
      });
      await expect(provider.tableDesigner.apply(context(), dropUnique)).resolves.toMatchObject({
        committed: true,
      });
    } finally {
      await provider.connection.execute(
        handle!,
        `DROP TABLE IF EXISTS "${schema}"."${parent}" CASCADE`,
      );
    }
  });
});
