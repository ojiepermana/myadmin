import { describe, expect, test } from 'bun:test';
import {
  ConnectionContext,
  type ConnectionHandle,
  type DatabaseProvider,
  type ExportRequest,
  type TlsMode,
} from '../../../packages/database-core/src';
import { MysqlProvider } from '../../../packages/database-mysql/src';
import { createPostgresqlProvider } from '../../../packages/database-postgresql/src';
import { TableOperationsService } from '../../../apps/server/src/table-operations/table-operations';
import type { AuditEvent } from '../../../packages/internal-domain/src';

interface RealTarget {
  readonly label: string;
  readonly provider: DatabaseProvider;
  readonly context: ConnectionContext;
  readonly ref: Extract<ExportRequest['source'], { kind: 'table' }>['ref'];
}

const targets: RealTarget[] = [];

if (Bun.env['MYADMIN_POSTGRES_INTEGRATION'] === '1') {
  targets.push({
    label: 'PostgreSQL',
    provider: createPostgresqlProvider(),
    context: new ConnectionContext(
      {
        engine: 'postgresql',
        host: Bun.env['MYADMIN_POSTGRES_HOST'] ?? '127.0.0.1',
        port: Number(Bun.env['MYADMIN_POSTGRES_PORT'] ?? 55433),
        user: Bun.env['MYADMIN_POSTGRES_USER'] ?? 'myadmin_test',
        database: Bun.env['MYADMIN_POSTGRES_DATABASE'] ?? 'myadmin_test',
        tls: { mode: 'disable' },
        timeoutMs: 5000,
      },
      Bun.env['MYADMIN_POSTGRES_PASSWORD'] ?? 'myadmin_test_password',
    ),
    ref: {
      database: Bun.env['MYADMIN_POSTGRES_DATABASE'] ?? 'myadmin_test',
      schema: 'public',
      name: '',
      type: 'table',
    },
  });
}

for (const [label, url] of [
  ['MySQL 8.0', Bun.env['MYSQL_8_0_URL']],
  ['MySQL latest', Bun.env['MYSQL_LATEST_URL']],
] as const) {
  if (!url) continue;
  const parsed = new URL(url);
  const mode = parsed.searchParams.get('sslmode') ?? parsed.searchParams.get('ssl') ?? 'disable';
  if (!isTlsMode(mode)) throw new Error(`Invalid TLS mode in ${label} fixture URL`);
  targets.push({
    label,
    provider: new MysqlProvider(),
    context: new ConnectionContext(
      {
        engine: 'mysql',
        host: parsed.hostname,
        port: Number(parsed.port || 3306),
        user: decodeURIComponent(parsed.username),
        database: parsed.pathname.slice(1) || undefined,
        tls: { mode },
        timeoutMs: 5000,
      },
      decodeURIComponent(parsed.password),
    ),
    ref: { database: parsed.pathname.slice(1) || 'fixture', schema: null, name: '', type: 'table' },
  });
}

if (targets.length === 0) {
  describe('real table operations', () => {
    test.skip('requires PostgreSQL or MySQL disposable fixtures', () => undefined);
  });
}

for (const target of targets) {
  describe(`${target.label} real table operations`, () => {
    test('[IT-0043-AC1, IT-0043-AC2, IT-0043-AC3, IT-0043-AC4, IT-0043-AC5, IT-0043-AC6] applies audited operations on a real table', async () => {
      const handle = await target.provider.connection.open(target.context);
      const name = `integration_0043_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
      const renamed = `${name}_renamed`;
      const ref = { ...target.ref, name };
      const renamedRef = { ...target.ref, name: renamed };
      const quote = target.provider.engine === 'mysql' ? '`' : '"';
      const q = (value: string) => `${quote}${value.replaceAll(quote, quote + quote)}${quote}`;
      const qualified =
        target.provider.engine === 'mysql'
          ? `${q(ref.database)}.${q(name)}`
          : `${q(ref.schema ?? 'public')}.${q(name)}`;
      const renamedQualified =
        target.provider.engine === 'mysql'
          ? `${q(ref.database)}.${q(renamed)}`
          : `${q(ref.schema ?? 'public')}.${q(renamed)}`;
      const port = target.provider.importExport;
      const metadata = target.provider.metadata;
      const tableOperations = target.provider.tableOperations;
      if (!port?.executeStatement || !metadata?.describeTable || !tableOperations) {
        throw new Error(`${target.label} lacks table mutation primitives`);
      }
      const auditEvents: AuditEvent[] = [];
      const service = new TableOperationsService({
        store: {
          audit: {
            append: (event: AuditEvent) => {
              auditEvents.push(event);
            },
            query: () => ({ items: auditEvents, total: auditEvents.length, page: 1, pageSize: 50 }),
          },
        } as never,
        connectionManager: {
          withConnectedProvider: async (_actor, _connectionId, operation) =>
            operation({
              connection: {
                id: `real-${target.label}`,
                label: target.label,
                engine: target.provider.engine,
              } as never,
              provider: target.provider,
              handle,
            }),
        },
      });
      const actor = { id: 'real-table-operations-user', username: 'admin', role: 'admin' as const };

      try {
        await port.executeStatement(handle, `DROP TABLE IF EXISTS ${qualified}`);
        await port.executeStatement(
          handle,
          `CREATE TABLE ${qualified} (id integer PRIMARY KEY, name ${target.provider.engine === 'mysql' ? 'varchar(80)' : 'text'} NOT NULL)`,
        );
        await port.executeStatement(
          handle,
          `INSERT INTO ${qualified} (id, name) VALUES (1, 'Ada'), (2, 'Grace')`,
        );
        const description = await metadata.describeTable(handle, ref);
        expect(description.ref.name).toBe(name);
        const impact = await service.impact(actor, 'real-connection', ref);
        expect(impact.ref.name).toBe(name);
        expect(impact.restartIdentitySupported).toBe(target.provider.engine === 'postgresql');
        await service.truncate(actor, 'real-connection', ref, {
          restartIdentity: false,
          confirmName: name,
        });
        expect(await rowCount(target.provider, handle, ref)).toBe(0);

        const result = await service.rename(actor, 'real-connection', ref, {
          newName: renamed,
          confirmName: name,
        });
        expect(result.name).toBe(renamed);
        await service.drop(actor, 'real-connection', renamedRef, renamed);
        expect(await tableExists(target.provider, handle, renamedRef)).toBe(false);
        expect(auditEvents.map((event) => event.action)).toEqual([
          'table.truncated',
          'table.renamed',
          'table.dropped',
        ]);
        expect(auditEvents[0]).toMatchObject({
          result: 'success',
          details: { estimatedRows: impact.estimatedRows ?? null, restartIdentity: false },
        });
      } finally {
        await port
          .executeStatement(handle, `DROP TABLE IF EXISTS ${renamedQualified}`)
          .catch(() => undefined);
        await port
          .executeStatement(handle, `DROP TABLE IF EXISTS ${qualified}`)
          .catch(() => undefined);
        await target.provider.connection.close(handle);
      }
    });
  });
}

async function tableExists(
  provider: DatabaseProvider,
  handle: ConnectionHandle,
  ref: Extract<ExportRequest['source'], { kind: 'table' }>['ref'],
): Promise<boolean> {
  const query = provider.query;
  if (!query?.execute) throw new Error(`${provider.engine} lacks query primitives`);
  const result = await query.execute(handle, {
    sql:
      provider.engine === 'mysql'
        ? 'SELECT COUNT(*) AS table_count FROM information_schema.tables WHERE table_schema = ? AND table_name = ?'
        : 'SELECT COUNT(*) AS table_count FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace WHERE n.nspname = ? AND c.relname = ?',
    parameters:
      provider.engine === 'mysql' ? [ref.database, ref.name] : [ref.schema ?? 'public', ref.name],
  });
  const value = result.rows[0]?.['table_count'];
  return Number(value ?? 0) > 0;
}

async function rowCount(
  provider: DatabaseProvider,
  handle: ConnectionHandle,
  ref: Extract<ExportRequest['source'], { kind: 'table' }>['ref'],
): Promise<number> {
  const quote = provider.engine === 'mysql' ? '`' : '"';
  const identifier = (value: string) => `${quote}${value.replaceAll(quote, quote + quote)}${quote}`;
  const table =
    provider.engine === 'mysql'
      ? `${identifier(ref.database)}.${identifier(ref.name)}`
      : `${identifier(ref.schema ?? 'public')}.${identifier(ref.name)}`;
  const query = provider.query;
  if (!query?.execute) throw new Error(`${provider.engine} lacks query primitives`);
  const result = await query.execute(handle, {
    sql: `SELECT COUNT(*) AS row_count FROM ${table}`,
  });
  const value = result.rows[0]?.['row_count'];
  return typeof value === 'number' ? value : Number(value ?? 0);
}

function isTlsMode(value: string): value is TlsMode {
  return ['disable', 'require', 'verify-ca', 'verify-full'].includes(value);
}
