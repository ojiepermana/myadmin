import { describe, expect, test } from 'bun:test';
import {
  DbError,
  type ConnectionHandle,
  type ProviderContext,
  type ViewDefinition,
} from '@myadmin/database-core';
import { MysqlViewPort } from '../src';

function handle(): ConnectionHandle {
  return { id: 'view-test', openedAt: new Date() };
}

function view(): ViewDefinition {
  return {
    ref: { database: 'analytics', schema: null, name: 'daily`summary', type: 'view' },
    definition: 'WITH rows AS (SELECT 1 AS id) SELECT id FROM rows;',
  };
}

describe('MySQL view port', () => {
  test('compiles database-qualified create DDL with quoted identifiers', async () => {
    const port = new MysqlViewPort({} as never, {} as never);
    await expect(port.previewCreate({} as ProviderContext, view())).resolves.toEqual({
      strategy: 'create',
      statements: [
        'CREATE VIEW `analytics`.`daily``summary` AS WITH rows AS (SELECT 1 AS id) SELECT id FROM rows;',
      ],
      dependents: [],
      warnings: [],
      requiresConfirmation: false,
    });
  });

  test('rejects definitions that contain a second statement', async () => {
    const port = new MysqlViewPort({} as never, {} as never);
    await expect(
      port.previewCreate({} as ProviderContext, {
        ...view(),
        definition: 'SELECT 1; DROP TABLE users;',
      }),
    ).rejects.toBeInstanceOf(DbError);
  });

  test('applies each compiled statement through the connection adapter', async () => {
    const statements: string[] = [];
    const port = new MysqlViewPort(
      {
        execute: async (_handle: ConnectionHandle, sql: string) => {
          statements.push(sql);
          return [];
        },
      } as never,
      {} as never,
    );
    await port.applyChangeSet(handle(), {
      strategy: 'drop',
      statements: ['DROP VIEW `analytics`.`daily``summary`;'],
      dependents: [],
      warnings: [],
      requiresConfirmation: true,
    });
    expect(statements).toEqual(['DROP VIEW `analytics`.`daily``summary`;']);
  });
});
