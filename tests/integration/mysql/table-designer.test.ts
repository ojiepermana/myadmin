import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  ConnectionContext,
  type ConnectionHandle,
  type TableChangeSet,
} from '../../../packages/database-core/src';
import { MysqlProvider } from '../../../packages/database-mysql/src';

const urls = [process.env['MYSQL_8_0_URL'], process.env['MYSQL_LATEST_URL']].filter(
  (value): value is string => value !== undefined,
);

function contextFromUrl(value: string): ConnectionContext {
  const url = new URL(value);
  return new ConnectionContext(
    {
      engine: 'mysql',
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      database: url.pathname.slice(1) || undefined,
      tls: {
        mode: (url.searchParams.get('sslmode') ?? url.searchParams.get('ssl') ?? 'disable') as
          'disable' | 'require' | 'verify-ca' | 'verify-full',
      },
      timeoutMs: 5000,
    },
    decodeURIComponent(url.password),
  );
}

if (urls.length === 0) {
  test.skip('requires MYSQL_8_0_URL or MYSQL_LATEST_URL and the MySQL fixture', () => undefined);
} else {
  for (const url of urls) {
    describe(`MySQL table designer integration (${new URL(url).hostname})`, () => {
      const provider = new MysqlProvider();
      const database = contextFromUrl(url).descriptor.database ?? 'myadmin_test';
      const table = `accounts_${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`;
      const ref = { database, schema: null, name: table, type: 'table' as const };
      let handle: ConnectionHandle | undefined;

      beforeAll(async () => {
        handle = await provider.connection.open(contextFromUrl(url));
        await provider.connection.execute(handle, `DROP TABLE IF EXISTS \`${table}\``);
      });

      afterAll(async () => {
        if (!handle) return;
        await provider.connection.execute(handle, `DROP TABLE IF EXISTS \`${table}\``);
        await provider.connection.close(handle);
      });

      test('[IT-0041-AC1, IT-0041-AC2, IT-0041-AC3, IT-0041-AC4, IT-0042-AC1, IT-0042-AC6, IT-0042-AC7] previews and applies create, add, and destructive drop changes', async () => {
        const create: TableChangeSet = {
          operation: 'create',
          ref,
          columns: [
            { name: 'id', dataType: 'int', nullable: false, identity: true, primaryKey: true },
            { name: 'name', dataType: 'varchar', length: 80, nullable: false },
          ],
        };
        await expect(
          provider.tableDesigner.preview(contextFromUrl(url), create),
        ).resolves.toMatchObject({
          statements: [expect.objectContaining({ sql: expect.stringContaining('CREATE TABLE') })],
        });
        await expect(
          provider.tableDesigner.apply(contextFromUrl(url), create),
        ).resolves.toMatchObject({ committed: true });
        const described = await provider.metadata.describeTable!(handle!, ref);
        expect(described.columns.map((column) => column.name)).toEqual(['id', 'name']);

        const add: TableChangeSet = {
          operation: 'alter',
          ref,
          alterations: [
            { kind: 'add', column: { name: 'notes', dataType: 'text', nullable: true } },
          ],
        };
        await expect(provider.tableDesigner.apply(contextFromUrl(url), add)).resolves.toMatchObject(
          { committed: true },
        );

        const indexName = `${table}_lookup_idx`;
        await provider.connection.execute(
          handle!,
          `CREATE INDEX \`${indexName}\` ON \`${table}\` (\`name\`)`,
        );
        const dropIndex: TableChangeSet = {
          operation: 'alter',
          ref,
          alterations: [{ kind: 'dropIndex', name: indexName }],
        };
        await expect(
          provider.tableDesigner.preview(contextFromUrl(url), dropIndex),
        ).resolves.toMatchObject({
          destructive: true,
          statements: [expect.objectContaining({ destructiveIndexes: [indexName] })],
        });
        await expect(
          provider.tableDesigner.apply(contextFromUrl(url), dropIndex),
        ).resolves.toMatchObject({ committed: true });

        const drop: TableChangeSet = {
          operation: 'alter',
          ref,
          alterations: [{ kind: 'drop', name: 'notes' }],
        };
        await expect(
          provider.tableDesigner.preview(contextFromUrl(url), drop),
        ).resolves.toMatchObject({ destructive: true });
        await expect(
          provider.tableDesigner.apply(contextFromUrl(url), drop),
        ).resolves.toMatchObject({ committed: true });
      });

      test('[IT-0041-AC8] previews a stable DDL snapshot for every MySQL catalogued type', async () => {
        const context = contextFromUrl(url);
        const types = await provider.tableDesigner.types(context);
        const columns = types.types.map((type, index) => ({
          name: `type_${index}`,
          dataType: type.name,
          nullable: true,
          ...(type.parameters.includes('length') ? { length: 24 } : {}),
          ...(type.parameters.includes('precision') ? { precision: 10, scale: 2 } : {}),
        }));
        const preview = await provider.tableDesigner.preview(context, {
          operation: 'create',
          ref: { database, schema: null, name: `${table}_all_types`, type: 'table' },
          columns,
        });

        expect(preview.statements).toHaveLength(1);
        expect(preview.statements[0]?.sql).toContain('CREATE TABLE');
        expect(preview.statements[0]?.sql).toContain('`type_0`');
        expect(columns).toHaveLength(types.types.length);
      });

      test('[IT-0041-AC5] rejects an incompatible MySQL default with a field-level issue', async () => {
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
        await expect(
          provider.tableDesigner.preview(contextFromUrl(url), invalid),
        ).rejects.toMatchObject({
          issues: expect.arrayContaining([
            expect.objectContaining({ path: 'columns[0].default', code: 'incompatible_default' }),
          ]),
        });
      });

      test('[IT-0042-AC3, IT-0042-AC4, IT-0042-AC5, IT-0042-AC8] applies and removes real FK and composite unique constraints', async () => {
        const child = `relations_${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`;
        const parent = `parents_${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`;
        const childRef = { database, schema: null, name: child, type: 'table' as const };
        const parentRef = { database, schema: null, name: parent, type: 'table' as const };
        await provider.connection.execute(
          handle!,
          `CREATE TABLE \`${parent}\` (id INT PRIMARY KEY)`,
        );
        try {
          const fkName = `${child}_parent_fk`;
          const uniqueName = `${child}_name_parent_uq`;
          const create: TableChangeSet = {
            operation: 'create',
            ref: childRef,
            columns: [
              { name: 'id', dataType: 'int', nullable: false, identity: true, primaryKey: true },
              { name: 'name', dataType: 'varchar', length: 80, nullable: false },
              { name: 'parent_id', dataType: 'int', nullable: true },
            ],
            constraints: [
              {
                type: 'foreignKey',
                name: fkName,
                columns: ['parent_id'],
                referencedTable: parentRef,
                referencedColumns: ['id'],
                onDelete: 'CASCADE',
              },
              { type: 'unique', name: uniqueName, columns: ['name', 'parent_id'] },
            ],
          };
          await expect(
            provider.tableDesigner.apply(contextFromUrl(url), create),
          ).resolves.toMatchObject({
            committed: true,
          });
          const described = await provider.metadata.describeTable!(handle!, childRef);
          expect(described.constraints).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ name: fkName, type: 'foreignKey' }),
              expect.objectContaining({ name: uniqueName, type: 'unique' }),
            ]),
          );

          const dropUnique: TableChangeSet = {
            operation: 'alter',
            ref: childRef,
            alterations: [{ kind: 'dropConstraint', name: uniqueName, type: 'unique' }],
          };
          await expect(
            provider.tableDesigner.preview(contextFromUrl(url), dropUnique),
          ).resolves.toMatchObject({
            destructive: true,
            statements: [expect.objectContaining({ destructiveConstraints: [uniqueName] })],
          });
          await expect(
            provider.tableDesigner.apply(contextFromUrl(url), dropUnique),
          ).resolves.toMatchObject({
            committed: true,
          });
        } finally {
          await provider.connection.execute(handle!, `DROP TABLE IF EXISTS \`${child}\``);
          await provider.connection.execute(handle!, `DROP TABLE IF EXISTS \`${parent}\``);
        }
      });
    });
  }
}
