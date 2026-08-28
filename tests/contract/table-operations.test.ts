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

describe('table operations contract', () => {
  test('CT-0043-AC1 through CT-0043-AC4 expose informed mutation shapes and errors', async () => {
    const document = await loadContract(contractPath);
    const operations = contractOperations(document);
    expect(operations.map((candidate) => candidate.operationId)).toEqual(
      expect.arrayContaining([
        'getTableDestructiveImpact',
        'renameTable',
        'truncateTable',
        'dropTable',
      ]),
    );
    const ref = { database: 'app', schema: 'public', name: 'accounts', type: 'table' };
    assertResponseMatchesContract(
      document,
      operation(operations, 'getTableDestructiveImpact'),
      200,
      {
        ref,
        estimatedRows: 42,
        restartIdentitySupported: true,
        views: [{ database: 'app', schema: 'public', name: 'account_summary', type: 'view' }],
        incomingForeignKeys: [
          {
            ref: { database: 'app', schema: 'billing', name: 'invoices', type: 'table' },
            constraintName: 'account_fk',
          },
        ],
      },
    );
    assertResponseMatchesContract(document, operation(operations, 'renameTable'), 409, {
      code: 'TABLE_CONFIRMATION_MISMATCH',
      message: 'Type the exact table name to confirm this operation.',
      correlationId: 'corr-0043',
    });
    assertResponseMatchesContract(document, operation(operations, 'truncateTable'), 204, undefined);
    assertResponseMatchesContract(document, operation(operations, 'dropTable'), 409, {
      code: 'DB_ERROR',
      message: 'Cannot drop table because a foreign key references it.',
      correlationId: 'corr-0043',
      details: { category: 'constraint_violation' },
    });
  });
});
