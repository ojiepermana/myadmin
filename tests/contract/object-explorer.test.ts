import { describe, expect, test } from 'bun:test';
import {
  assertResponseMatchesContract,
  contractOperations,
  loadContract,
  type ContractOperation,
} from './harness';

const contractPath = new URL('../../dist/openapi-v1.yaml', import.meta.url).pathname;

function operation(operations: ContractOperation[], operationId: string): ContractOperation {
  const found = operations.find((candidate) => candidate.operationId === operationId);
  if (!found) throw new Error(`Contract operation ${operationId} is missing`);
  return found;
}

const apiError = { code: 'NOT_CONNECTED', message: 'Connect first.', correlationId: 'corr-0031' };

describe('object explorer contract', () => {
  test('CT-0031-AC1 exposes generic metadata operations and provider-neutral response shapes', async () => {
    const document = await loadContract(contractPath);
    const operations = contractOperations(document);
    expect(operations.map((candidate) => candidate.operationId)).toEqual(
      expect.arrayContaining([
        'listExplorerDatabases',
        'listExplorerDatabaseChildren',
        'listExplorerSchemaObjects',
        'describeExplorerObject',
        'searchExplorerObjects',
      ]),
    );

    assertResponseMatchesContract(document, operation(operations, 'listExplorerDatabases'), 200, {
      items: [{ name: 'app' }],
      cursor: null,
    });
    assertResponseMatchesContract(
      document,
      operation(operations, 'listExplorerDatabaseChildren'),
      200,
      {
        items: [
          {
            kind: 'schema',
            database: 'app',
            schema: 'public',
            name: 'public',
            hasChildren: true,
            isSystem: false,
          },
          {
            kind: 'object-group',
            database: 'app',
            schema: null,
            objectType: 'table',
            name: 'table',
            hasChildren: true,
          },
        ],
        cursor: null,
      },
    );
    assertResponseMatchesContract(document, operation(operations, 'describeExplorerObject'), 200, {
      ref: { database: 'app', schema: 'public', name: 'users', type: 'table' },
      columns: [{ name: 'id', dataType: 'integer', nullable: false }],
      estimatedRows: 10,
    });
    assertResponseMatchesContract(
      document,
      operation(operations, 'listExplorerDatabases'),
      409,
      apiError,
    );
    assertResponseMatchesContract(document, operation(operations, 'searchExplorerObjects'), 200, {
      items: [
        { database: 'app', schema: 'public', name: 'users', type: 'table' },
        { database: 'app', schema: null, name: 'app', type: 'database' },
      ],
      cursor: null,
      total: 2,
    });
  });
});
