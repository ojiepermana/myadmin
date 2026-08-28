import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  ConnectionContext,
  type ConnectionHandle,
  type ObjectRef,
  type TlsMode,
} from '../../../packages/database-core/src';
import { defineMetadataContractTests } from '../../../packages/database-core/test/metadata-contract-suite';
import { MysqlProvider, quoteMysqlIdentifier } from '../../../packages/database-mysql/src';

const targets = [
  ['8.0', Bun.env['MYSQL_8_0_URL']],
  ['latest', Bun.env['MYSQL_LATEST_URL']],
] as const;

const configuredTargets = targets.filter(([, url]) => url) as Array<readonly [string, string]>;

interface MetadataFixture {
  readonly handle: ConnectionHandle;
  readonly names: FixtureNames;
}

interface FixtureNames {
  readonly prefix: string;
  readonly referenceTable: string;
  readonly table: string;
  readonly view: string;
  readonly function: string;
  readonly procedure: string;
  readonly trigger: string;
  readonly index: string;
  readonly unique: string;
  readonly foreignKey: string;
  readonly check: string;
  readonly performancePrefix: string;
}

if (configuredTargets.length > 0) {
  for (const [label, url] of configuredTargets) {
    describe(`MySQL ${label} metadata`, () => {
      const provider = new MysqlProvider();
      const context = contextFromUrl(url);
      const names = fixtureNames(label);
      const database = objectRef('fixture', 'fixture', 'database');
      const table = objectRef('fixture', names.table, 'table');
      let fixture: MetadataFixture | undefined;

      beforeAll(async () => {
        const handle = await provider.connection.open(context);
        await cleanupStaleFixtures(provider, handle);
        fixture = { handle, names };
        await createFixture(provider, handle, names);
      });

      afterAll(async () => {
        if (!fixture) return;
        await dropFixture(provider, fixture.handle, fixture.names);
        await provider.connection.close(fixture.handle);
      });

      defineMetadataContractTests({
        metadata: provider.metadata,
        context,
        database,
        table,
      });

      test('IT-0025-AC1 lists databases and keeps size loading lazy', async () => {
        const handle = requiredHandle(fixture);
        const page = await provider.metadata.listDatabases(handle, { limit: 500 });
        const databaseDefinition = page.items.find((item) => item.name === 'fixture');

        expect(databaseDefinition).toMatchObject({
          name: 'fixture',
          charset: expect.any(String),
          collation: expect.any(String),
        });
        expect(page.items.some((item) => SYSTEM_DATABASES.has(item.name))).toBe(false);
        expect(await provider.metadata.getDatabaseSize(handle, 'fixture')).toBeGreaterThan(0);
        await expect(provider.metadata.listSchemas(handle, 'fixture')).resolves.toEqual({
          items: [],
        });
      });

      test('IT-0025-AC2 lists every MySQL object kind with bounded pages', async () => {
        const handle = requiredHandle(fixture);
        const page = await provider.metadata.listObjects(
          handle,
          'fixture',
          ['table', 'view', 'routine', 'trigger'],
          { limit: 500 },
        );
        const namesByType = new Set(page.items.map((item) => `${item.type}:${item.name}`));

        expect([...namesByType]).toEqual(
          expect.arrayContaining([
            `table:${names.referenceTable}`,
            `table:${names.table}`,
            `view:${names.view}`,
            `routine:${names.function}`,
            `routine:${names.procedure}`,
            `trigger:${names.trigger}`,
          ]),
        );
        expect(page.items.every((item) => item.schema === null)).toBe(true);

        const capped = await provider.metadata.listObjects(handle, 'fixture', ['table'], {
          limit: 9999,
        });
        expect(capped.items.length).toBeLessThanOrEqual(500);
      });

      test('IT-0025-AC3, CT-0025-AC3 describes columns, keys, constraints, and table properties', async () => {
        const handle = requiredHandle(fixture);
        const description = await provider.metadata.describeTable(handle, table);
        const generated = description.columns.find((column) => column.name === 'full_name');
        const identity = description.columns.find((column) => column.name === 'id');
        const foreignKey = description.constraints.find(
          (constraint) => constraint.type === 'foreignKey',
        );
        const compositeIndex = description.indexes.find((index) => index.name === names.index);

        expect(description).toMatchObject({
          ref: table,
          engine: 'InnoDB',
          collation: expect.any(String),
          comment: expect.stringContaining('metadata fixture'),
          estimatedRows: expect.any(Number),
          sizeBytes: expect.any(Number),
        });
        expect(identity).toMatchObject({
          dataType: expect.stringContaining('bigint'),
          nullable: false,
          isIdentity: true,
          comment: expect.stringContaining('identity'),
        });
        expect(generated).toMatchObject({
          isGenerated: true,
          generatedExpression: expect.any(String),
        });
        expect(compositeIndex).toMatchObject({
          columns: ['reference_id', 'state'],
          unique: false,
          primary: false,
          method: expect.any(String),
        });
        expect(description.constraints).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ name: 'PRIMARY', type: 'primaryKey' }),
            expect.objectContaining({
              name: names.unique,
              type: 'unique',
              columns: ['first_name', 'last_name'],
            }),
            expect.objectContaining({
              name: names.check,
              type: 'check',
              expression: expect.stringContaining('state'),
            }),
          ]),
        );
        expect(foreignKey).toMatchObject({
          name: names.foreignKey,
          columns: ['reference_id'],
          referencedTable: {
            database: 'fixture',
            schema: null,
            name: names.referenceTable,
            type: 'table',
          },
          referencedColumns: ['id'],
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        });
      });

      test('IT-0025-AC4 returns view, routine, and trigger metadata', async () => {
        const handle = requiredHandle(fixture);
        const view = await provider.metadata.getViewDefinition(
          handle,
          objectRef('fixture', names.view, 'view'),
        );
        const routines = await provider.metadata.listRoutines(handle, 'fixture', { limit: 500 });
        const triggers = await provider.metadata.listTriggers(handle, 'fixture', { limit: 500 });

        expect(view.definition.toLowerCase()).toContain('select');
        expect(routines.items).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              ref: objectRef('fixture', names.function, 'routine'),
              routineType: 'function',
            }),
            expect.objectContaining({
              ref: objectRef('fixture', names.procedure, 'routine'),
              routineType: 'procedure',
            }),
          ]),
        );
        expect(triggers.items).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              ref: objectRef('fixture', names.trigger, 'trigger'),
              table,
              timing: 'AFTER',
              event: 'INSERT',
            }),
          ]),
        );
      });

      test('IT-0025-AC5 searches information_schema with server side pagination', async () => {
        const handle = requiredHandle(fixture);
        const first = await provider.metadata.searchObjects(
          handle,
          'fixture',
          names.prefix,
          ['table', 'view', 'routine', 'trigger'],
          { limit: 1 },
        );

        expect(first.items).toHaveLength(1);
        expect(first.cursor).toBeDefined();
        const [firstObject] = first.items;
        expect(firstObject?.schema).toBe(null);
        await expect(
          provider.metadata.searchObjects(handle, 'fixture', '%', ['table'], { limit: 10 }),
        ).resolves.toMatchObject({ items: [] });
      });

      test('IT-0025-AC7 validates the common metadata shape on a real MySQL provider', async () => {
        const handle = requiredHandle(fixture);
        const objects = await provider.metadata.listObjects(handle, database, ['table'], {
          limit: 50,
        });
        const tableObject = objects.items.find((item) => item.name === names.table);
        expect(tableObject).toEqual(table);
        expect(tableObject).toMatchObject({
          database: 'fixture',
          schema: null,
          name: names.table,
          type: 'table',
        });

        const description = await provider.metadata.describeTable(handle, table);
        expect(description.ref).toEqual(table);
        expect(description.columns).toBeInstanceOf(Array);
        expect(description.indexes).toBeInstanceOf(Array);
        expect(description.constraints).toBeInstanceOf(Array);
      });

      test(
        'PERF-0025-AC8 keeps a 2000 table catalog page bounded',
        async () => {
          const handle = requiredHandle(fixture);
          const performanceTables = Array.from(
            { length: 2000 },
            (_, index) => `${names.performancePrefix}_${String(index).padStart(4, '0')}`,
          );
          try {
            for (const name of performanceTables) {
              await execute(
                provider,
                handle,
                `CREATE TABLE ${quoteMysqlIdentifier(name)} (id INT NOT NULL PRIMARY KEY) ENGINE=InnoDB`,
              );
            }

            const startedAt = performance.now();
            const page = await provider.metadata.listObjects(handle, 'fixture', ['table'], {
              limit: 50,
            });
            const elapsedMs = performance.now() - startedAt;

            expect(page.items).toHaveLength(50);
            expect(page.cursor).toBeDefined();
            expect(elapsedMs).toBeLessThan(5000);
          } finally {
            await dropTables(provider, handle, performanceTables);
          }
        },
        { timeout: 90_000 },
      );
    });
  }
} else {
  test.skip('MySQL metadata integration requires MYSQL_8_0_URL or MYSQL_LATEST_URL', () =>
    undefined);
}

const SYSTEM_DATABASES = new Set(['sys', 'mysql', 'information_schema', 'performance_schema']);
const METADATA_FIXTURE_PREFIX = 'myadmin_metadata_';

function contextFromUrl(value: string): ConnectionContext {
  const url = new URL(value);
  const mode = url.searchParams.get('sslmode') ?? url.searchParams.get('ssl') ?? 'require';
  if (!isTlsMode(mode)) throw new Error('MYSQL metadata URL has an invalid ssl mode');

  return new ConnectionContext(
    {
      engine: 'mysql',
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      database: url.pathname.slice(1) || undefined,
      tls: { mode },
      timeoutMs: 10_000,
    },
    decodeURIComponent(url.password),
  );
}

function isTlsMode(value: string): value is TlsMode {
  return ['disable', 'require', 'verify-ca', 'verify-full'].includes(value);
}

function fixtureNames(label: string): FixtureNames {
  const suffix = `${label.replaceAll('.', '_')}_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const prefix = `myadmin_metadata_${suffix}`;
  return {
    prefix,
    referenceTable: `${prefix}_reference`,
    table: `${prefix}_accounts`,
    view: `${prefix}_view`,
    function: `${prefix}_function`,
    procedure: `${prefix}_procedure`,
    trigger: `${prefix}_trigger`,
    index: `${prefix}_reference_state_idx`,
    unique: `${prefix}_name_unique`,
    foreignKey: `${prefix}_reference_fk`,
    check: `${prefix}_state_check`,
    performancePrefix: `${prefix}_perf`,
  };
}

function objectRef(database: string, name: string, type: ObjectRef['type']): ObjectRef {
  return { database, schema: null, name, type };
}

function requiredHandle(fixture: MetadataFixture | undefined): ConnectionHandle {
  if (!fixture) throw new Error('MySQL metadata fixture was not initialized');
  return fixture.handle;
}

async function createFixture(
  provider: MysqlProvider,
  handle: ConnectionHandle,
  names: FixtureNames,
): Promise<void> {
  const reference = quoteMysqlIdentifier(names.referenceTable);
  const table = quoteMysqlIdentifier(names.table);
  await execute(
    provider,
    handle,
    `CREATE TABLE ${reference} (
      id BIGINT NOT NULL PRIMARY KEY
    ) ENGINE=InnoDB`,
  );
  await execute(
    provider,
    handle,
    `CREATE TABLE ${table} (
      id BIGINT NOT NULL AUTO_INCREMENT COMMENT 'identity column',
      reference_id BIGINT NULL,
      first_name VARCHAR(64) NOT NULL,
      last_name VARCHAR(64) NOT NULL,
      full_name VARCHAR(131) GENERATED ALWAYS AS (CONCAT(first_name, ' ', last_name)) STORED,
      state VARCHAR(20) NOT NULL DEFAULT 'active',
      PRIMARY KEY (id),
      CONSTRAINT ${quoteMysqlIdentifier(names.unique)} UNIQUE (first_name, last_name),
      KEY ${quoteMysqlIdentifier(names.index)} (reference_id, state),
      CONSTRAINT ${quoteMysqlIdentifier(names.foreignKey)}
        FOREIGN KEY (reference_id) REFERENCES ${reference} (id)
        ON UPDATE CASCADE ON DELETE SET NULL,
      CONSTRAINT ${quoteMysqlIdentifier(names.check)} CHECK (state <> '')
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
      COMMENT='metadata fixture table'`,
  );
  await execute(
    provider,
    handle,
    `CREATE VIEW ${quoteMysqlIdentifier(names.view)} AS
      SELECT id, first_name, last_name FROM ${table}`,
  );
  await execute(
    provider,
    handle,
    `CREATE FUNCTION ${quoteMysqlIdentifier(names.function)}(input_id BIGINT)
      RETURNS BIGINT DETERMINISTIC RETURN input_id`,
  );
  await execute(
    provider,
    handle,
    `CREATE PROCEDURE ${quoteMysqlIdentifier(names.procedure)}(IN input_id BIGINT)
      SELECT input_id AS id`,
  );
  await execute(
    provider,
    handle,
    `CREATE TRIGGER ${quoteMysqlIdentifier(names.trigger)} AFTER INSERT ON ${table}
      FOR EACH ROW SET @myadmin_metadata_last_id = NEW.id`,
  );
}

interface FixtureObjectRow {
  readonly [key: string]: unknown;
  readonly name?: unknown;
  readonly type?: unknown;
}

async function cleanupStaleFixtures(
  provider: MysqlProvider,
  handle: ConnectionHandle,
): Promise<void> {
  const tables = await provider.connection.execute<FixtureObjectRow>(
    handle,
    `SELECT TABLE_NAME AS name, TABLE_TYPE AS type
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ?`,
    ['fixture'],
  );
  const routines = await provider.connection.execute<FixtureObjectRow>(
    handle,
    `SELECT ROUTINE_NAME AS name, ROUTINE_TYPE AS type
       FROM information_schema.ROUTINES
      WHERE ROUTINE_SCHEMA = ?`,
    ['fixture'],
  );
  const triggers = await provider.connection.execute<FixtureObjectRow>(
    handle,
    `SELECT TRIGGER_NAME AS name
       FROM information_schema.TRIGGERS
      WHERE TRIGGER_SCHEMA = ?`,
    ['fixture'],
  );
  const isFixtureName = (value: unknown): value is string =>
    typeof value === 'string' && value.startsWith(METADATA_FIXTURE_PREFIX);

  for (const row of triggers) {
    if (!isFixtureName(row.name)) continue;
    await execute(provider, handle, `DROP TRIGGER IF EXISTS ${quoteMysqlIdentifier(row.name)}`);
  }
  for (const row of tables) {
    if (!isFixtureName(row.name) || row.type !== 'VIEW') continue;
    await execute(provider, handle, `DROP VIEW IF EXISTS ${quoteMysqlIdentifier(row.name)}`);
  }
  for (const row of routines) {
    if (!isFixtureName(row.name) || (row.type !== 'FUNCTION' && row.type !== 'PROCEDURE')) {
      continue;
    }
    await execute(provider, handle, `DROP ${row.type} IF EXISTS ${quoteMysqlIdentifier(row.name)}`);
  }
  await dropTables(
    provider,
    handle,
    tables
      .filter((row) => isFixtureName(row.name) && row.type === 'BASE TABLE')
      .map((row) => row.name as string),
  );
}

async function dropFixture(
  provider: MysqlProvider,
  handle: ConnectionHandle,
  names: FixtureNames,
): Promise<void> {
  await execute(provider, handle, `DROP TRIGGER IF EXISTS ${quoteMysqlIdentifier(names.trigger)}`);
  await execute(provider, handle, `DROP VIEW IF EXISTS ${quoteMysqlIdentifier(names.view)}`);
  await execute(
    provider,
    handle,
    `DROP PROCEDURE IF EXISTS ${quoteMysqlIdentifier(names.procedure)}`,
  );
  await execute(
    provider,
    handle,
    `DROP FUNCTION IF EXISTS ${quoteMysqlIdentifier(names.function)}`,
  );
  await dropTables(provider, handle, [names.table, names.referenceTable]);
}

async function dropTables(
  provider: MysqlProvider,
  handle: ConnectionHandle,
  names: readonly string[],
): Promise<void> {
  if (names.length === 0) return;
  for (let index = 0; index < names.length; index += 100) {
    const chunk = names
      .slice(index, index + 100)
      .map(quoteMysqlIdentifier)
      .join(', ');
    await execute(provider, handle, `DROP TABLE IF EXISTS ${chunk}`);
  }
}

async function execute(
  provider: MysqlProvider,
  handle: ConnectionHandle,
  statement: string,
  parameters?: readonly unknown[],
): Promise<void> {
  await provider.connection.execute(handle, statement, parameters);
}
