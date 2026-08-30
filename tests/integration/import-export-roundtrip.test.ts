import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  ConnectionContext,
  type ConnectionHandle,
  type ExportRequest,
  type TlsMode,
} from '../../packages/database-core/src';
import { MysqlProvider } from '../../packages/database-mysql/src';
import { createPostgresqlProvider } from '../../packages/database-postgresql/src';

const postgresEnabled = Bun.env['MYADMIN_POSTGRES_INTEGRATION'] === '1';
const mysqlTargets = [
  ['MySQL 8.0', Bun.env['MYSQL_8_0_URL']],
  ['MySQL latest', Bun.env['MYSQL_LATEST_URL']],
] as const;

if (postgresEnabled) {
  describe('PostgreSQL import/export adapter roundtrip', () => {
    const provider = createPostgresqlProvider();
    const context = new ConnectionContext(
      {
        engine: 'postgresql',
        host: Bun.env['MYADMIN_POSTGRES_HOST'] ?? '127.0.0.1',
        port: Number(Bun.env['MYADMIN_POSTGRES_PORT'] ?? 55433),
        user: Bun.env['MYADMIN_POSTGRES_USER'] ?? 'myadmin_test',
        database: Bun.env['MYADMIN_POSTGRES_DATABASE'] ?? 'myadmin_test',
        tls: { mode: (Bun.env['MYADMIN_POSTGRES_TLS'] ?? 'disable') as TlsMode },
        timeoutMs: 5000,
      },
      Bun.env['MYADMIN_POSTGRES_PASSWORD'] ?? 'myadmin_test_password',
    );
    const names = roundtripNames('pg');
    let handle: ConnectionHandle;

    beforeAll(async () => {
      handle = await provider.connection.open(context);
      await provider.importExport!.executeStatement!(
        handle,
        `DROP TABLE IF EXISTS "${names.target}", "${names.source}"`,
      );
    });

    afterAll(async () => {
      await provider.importExport!.executeStatement!(
        handle,
        `DROP TABLE IF EXISTS "${names.target}", "${names.source}"`,
      );
      await provider.connection.close(handle);
    });

    test('[IT-0047-AC2, IT-0047-AC3, IT-0048-AC2, IT-0048-AC3, IT-0048-AC5] roundtrips exported rows and rolls back a batch on the real PostgreSQL adapter', async () => {
      await provider.importExport!.executeStatement!(
        handle,
        `CREATE TABLE "${names.source}" (id integer PRIMARY KEY, name text NOT NULL)`,
      );
      await provider.importExport!.executeStatement!(
        handle,
        `CREATE TABLE "${names.target}" (id integer PRIMARY KEY, name text NOT NULL)`,
      );
      await provider.importExport!.executeStatement!(
        handle,
        `INSERT INTO "${names.source}" (id, name) VALUES (1, 'Ada'), (2, 'Grace')`,
      );
      const source = tableRequest('myadmin_test', 'public', names.source);
      const stream = await provider.importExport!.stream(handle, source);
      const exported = await collect(stream.rows);
      const inserted = await provider.importExport!.insertBatch!(handle, {
        table: tableRef('myadmin_test', 'public', names.target),
        columns: ['id', 'name'],
        rows: exported.map((row) => [row['id'], row['name']]),
      });
      expect(inserted.affectedRows).toBe(2);
      await expect(
        provider.connection.withTransaction(handle, async () => {
          await provider.importExport!.insertBatch!(handle, {
            table: tableRef('myadmin_test', 'public', names.target),
            columns: ['id', 'name'],
            rows: [[99, 'rolled back']],
          });
          throw new Error('rollback fixture');
        }),
      ).rejects.toThrow('rollback fixture');
      const restored = await provider.importExport!.stream(
        handle,
        tableRequest('myadmin_test', 'public', names.target),
      );
      await expect(collect(restored.rows)).resolves.toEqual(exported);
    });
  });
} else {
  test.skip('PostgreSQL import/export roundtrip requires MYADMIN_POSTGRES_INTEGRATION=1', () =>
    undefined);
}

for (const [label, url] of mysqlTargets) {
  if (!url) continue;
  describe(`${label} import/export adapter roundtrip`, () => {
    const provider = new MysqlProvider();
    const context = contextFromUrl(url);
    const names = roundtripNames(label === 'MySQL 8.0' ? 'my80' : 'mylatest');
    let handle: ConnectionHandle;

    beforeAll(async () => {
      handle = await provider.connection.open(context);
      await provider.importExport!.executeStatement!(
        handle,
        `DROP TABLE IF EXISTS \`${names.target}\`, \`${names.source}\``,
      );
    });

    afterAll(async () => {
      await provider.importExport!.executeStatement!(
        handle,
        `DROP TABLE IF EXISTS \`${names.target}\`, \`${names.source}\``,
      );
      await provider.connection.close(handle);
    });

    test('[IT-0047-AC2, IT-0047-AC3, IT-0048-AC2, IT-0048-AC3, IT-0048-AC5] roundtrips exported rows and rolls back a batch on the real MySQL adapter', async () => {
      await provider.importExport!.executeStatement!(
        handle,
        `CREATE TABLE \`${names.source}\` (id integer PRIMARY KEY, name varchar(80) NOT NULL)`,
      );
      await provider.importExport!.executeStatement!(
        handle,
        `CREATE TABLE \`${names.target}\` (id integer PRIMARY KEY, name varchar(80) NOT NULL)`,
      );
      await provider.importExport!.executeStatement!(
        handle,
        `INSERT INTO \`${names.source}\` (id, name) VALUES (1, 'Ada'), (2, 'Grace')`,
      );
      const source = tableRequest('fixture', undefined, names.source);
      const stream = await provider.importExport!.stream(handle, source);
      const exported = await collect(stream.rows);
      const target = tableRequest('fixture', undefined, names.target);
      const inserted = await provider.importExport!.insertBatch!(handle, {
        table: tableRef('fixture', undefined, names.target),
        columns: ['id', 'name'],
        rows: exported.map((row) => [row['id'], row['name']]),
      });
      expect(inserted.affectedRows).toBe(2);
      await expect(
        provider.connection.withTransaction(handle, async () => {
          await provider.importExport!.insertBatch!(handle, {
            table: tableRef('fixture', undefined, names.target),
            columns: ['id', 'name'],
            rows: [[99, 'rolled back']],
          });
          throw new Error('rollback fixture');
        }),
      ).rejects.toThrow('rollback fixture');
      const restored = await provider.importExport!.stream(handle, target);
      await expect(collect(restored.rows)).resolves.toEqual(exported);
    });
  });
}

if (mysqlTargets.every(([, url]) => !url)) {
  test.skip('MySQL import/export roundtrip requires at least one fixture URL', () => undefined);
}

function tableRequest(database: string, schema: string | undefined, name: string): ExportRequest {
  return {
    source: {
      kind: 'table',
      ref: { database, ...(schema ? { schema } : {}), name, type: 'table' },
    },
    format: 'json',
  };
}

function tableRef(database: string, schema: string | undefined, name: string) {
  return { database, ...(schema ? { schema } : {}), name, type: 'table' as const };
}

function roundtripNames(prefix: string): { source: string; target: string } {
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 16);
  return { source: `ie_${prefix}_source_${suffix}`, target: `ie_${prefix}_target_${suffix}` };
}

async function collect(
  rows: AsyncIterable<Record<string, unknown>>,
): Promise<Array<Record<string, unknown>>> {
  const result: Array<Record<string, unknown>> = [];
  for await (const row of rows) result.push(row);
  return result;
}

function contextFromUrl(value: string): ConnectionContext {
  const url = new URL(value);
  const mode = url.searchParams.get('sslmode') ?? url.searchParams.get('ssl') ?? 'disable';
  if (!isTlsMode(mode)) throw new Error('MySQL test URL has an invalid ssl mode');
  return new ConnectionContext(
    {
      engine: 'mysql',
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      database: url.pathname.slice(1) || undefined,
      tls: { mode },
      timeoutMs: 5000,
    },
    decodeURIComponent(url.password),
  );
}

function isTlsMode(value: string): value is TlsMode {
  return ['disable', 'require', 'verify-ca', 'verify-full'].includes(value);
}
