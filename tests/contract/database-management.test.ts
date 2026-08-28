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

const apiError = {
  code: 'DATABASE_CONFIRMATION_MISMATCH',
  message: 'Type the exact name.',
  correlationId: 'corr-0039',
};

describe('database management contract', () => {
  test('CT-0039-AC2 through CT-0039-AC4 expose provider options and safe mutation shapes', async () => {
    const document = await loadContract(contractPath);
    const operations = contractOperations(document);
    expect(operations.map((candidate) => candidate.operationId)).toEqual(
      expect.arrayContaining([
        'createDatabase',
        'getDatabaseCreateOptions',
        'getDatabaseProperties',
        'dropDatabase',
      ]),
    );

    assertResponseMatchesContract(document, operation(operations, 'createDatabase'), 201, {
      name: 'created',
    });
    assertResponseMatchesContract(
      document,
      operation(operations, 'getDatabaseCreateOptions'),
      200,
      {
        engine: 'mysql',
        charsets: ['utf8mb4'],
        collations: ['utf8mb4_bin'],
      },
    );
    assertResponseMatchesContract(document, operation(operations, 'getDatabaseProperties'), 200, {
      name: 'created',
      sizeBytes: 10,
      objectCount: 2,
    });
    assertResponseMatchesContract(document, operation(operations, 'dropDatabase'), 409, apiError);
  });
});
