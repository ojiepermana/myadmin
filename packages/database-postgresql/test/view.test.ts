import { describe, expect, test } from 'bun:test';
import {
  DbError,
  type ConnectionHandle,
  type ProviderContext,
  type ViewDefinition,
} from '@myadmin/database-core';
import { PostgresqlViewPort } from '../src';

function handle(): ConnectionHandle {
  return { id: 'view-test', openedAt: new Date() };
}

function view(): ViewDefinition {
  return {
    ref: { database: 'app', schema: 'reporting', name: 'daily"sales', type: 'view' },
    definition: 'SELECT id, total FROM orders;',
  };
}

describe('PostgreSQL view port', () => {
  test('compiles schema-qualified create DDL with quoted identifiers', async () => {
    const port = new PostgresqlViewPort({} as never, {} as never);
    await expect(port.previewCreate({} as ProviderContext, view())).resolves.toEqual({
      strategy: 'create',
      statements: ['CREATE VIEW "reporting"."daily""sales" AS SELECT id, total FROM orders;'],
      dependents: [],
      warnings: [],
      requiresConfirmation: false,
    });
  });

  test('rejects multi-statement and non-SELECT definitions', async () => {
    const port = new PostgresqlViewPort({} as never, {} as never);
    await expect(
      port.previewCreate({} as ProviderContext, { ...view(), definition: 'DROP TABLE orders;' }),
    ).rejects.toBeInstanceOf(DbError);
    await expect(
      port.previewCreate({} as ProviderContext, { ...view(), definition: 'SELECT 1; SELECT 2;' }),
    ).rejects.toBeInstanceOf(DbError);
  });

  test('applies a compiled change set without rebuilding identifiers', async () => {
    const statements: string[] = [];
    const port = new PostgresqlViewPort(
      {
        execute: async (_handle: ConnectionHandle, sql: string) => {
          statements.push(sql);
          return [];
        },
      } as never,
      {} as never,
    );
    await port.applyChangeSet(handle(), {
      strategy: 'replace',
      statements: ['CREATE OR REPLACE VIEW "reporting"."daily""sales" AS SELECT 1;'],
      dependents: [],
      warnings: [],
      requiresConfirmation: false,
    });
    expect(statements).toEqual(['CREATE OR REPLACE VIEW "reporting"."daily""sales" AS SELECT 1;']);
  });
});
