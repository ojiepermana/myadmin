import { describe, expect, test } from 'bun:test';
import { generateContractTypes } from '../../scripts/codegen/generate-contract-types';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertResponseMatchesContract,
  contractOperations,
  loadContract,
  type ContractOperation,
} from './harness';

const contractPath = new URL('../../dist/openapi-v1.yaml', import.meta.url).pathname;

function findOperation(operations: ContractOperation[], operationId: string): ContractOperation {
  const found = operations.find((candidate) => candidate.operationId === operationId);
  if (!found) throw new Error(`Contract operation ${operationId} is missing`);
  return found;
}

describe('CT-0046 privilege contract', () => {
  test('CT-0045-AC1, CT-0045-AC2, CT-0045-AC3, CT-0045-AC4, and CT-0045-AC5 expose principal lifecycle responses', async () => {
    const document = await loadContract(contractPath);
    const operations = contractOperations(document);
    const principal = {
      name: 'alice',
      type: 'user',
      attributes: [{ key: 'canLogin', value: true }],
      memberOf: [],
    };
    assertResponseMatchesContract(
      document,
      findOperation(operations, 'createSecurityPrincipal'),
      201,
      principal,
    );
    assertResponseMatchesContract(
      document,
      findOperation(operations, 'updateSecurityPrincipal'),
      200,
      principal,
    );
    assertResponseMatchesContract(
      document,
      findOperation(operations, 'resetSecurityPrincipalPassword'),
      204,
      undefined,
    );
    assertResponseMatchesContract(
      document,
      findOperation(operations, 'dropSecurityPrincipal'),
      204,
      undefined,
    );
  });

  test('CT-0045-AC6, CT-0046-AC1, CT-0046-AC2, CT-0046-AC3, and CT-0046-AC6 expose the complete privilege surface', async () => {
    generateContractTypes(join(await mkdtemp(join(tmpdir(), 'myadmin-contract-')), 'openapi.ts'));
    const document = await loadContract(contractPath);
    const operations = contractOperations(document);
    expect(operations.map((item) => item.operationId)).toEqual(
      expect.arrayContaining([
        'listSecurityPrincipalGrants',
        'getSecurityPrivilegeCatalog',
        'previewSecurityGrants',
        'applySecurityGrants',
      ]),
    );

    assertResponseMatchesContract(
      document,
      findOperation(operations, 'listSecurityPrincipalGrants'),
      200,
      {
        items: [
          {
            principal: 'analyst',
            scope: 'table',
            ref: { database: 'app', schema: 'public', name: 'orders', type: 'table' },
            privilege: 'SELECT',
            grantable: false,
          },
        ],
        total: 1,
      },
    );
    assertResponseMatchesContract(
      document,
      findOperation(operations, 'getSecurityPrivilegeCatalog'),
      200,
      {
        engine: 'postgresql',
        levels: [{ scope: 'database', privileges: [{ name: 'CONNECT', label: 'Connect' }] }],
      },
    );
    const components = document['components'] as { schemas?: Record<string, unknown> } | undefined;
    const changeSetSchema = JSON.stringify(components?.schemas?.['GrantChangeSet'] ?? {});
    expect(changeSetSchema).not.toContain('grantOption');
    expect(changeSetSchema).not.toContain('column');
  });

  test('CT-0046-AC4 keeps preview and apply responses per statement', async () => {
    generateContractTypes(join(await mkdtemp(join(tmpdir(), 'myadmin-contract-')), 'openapi.ts'));
    const document = await loadContract(contractPath);
    const operations = contractOperations(document);
    const statement = {
      action: 'grant',
      principal: 'analyst',
      scope: 'database',
      ref: { database: 'app', name: 'app', type: 'database' },
      privilege: 'CONNECT',
      statement: 'GRANT CONNECT ON DATABASE "app" TO "analyst"',
    };
    assertResponseMatchesContract(
      document,
      findOperation(operations, 'previewSecurityGrants'),
      200,
      {
        statements: [statement],
      },
    );
    assertResponseMatchesContract(document, findOperation(operations, 'applySecurityGrants'), 200, {
      statements: [{ ...statement, status: 'applied' }],
    });
  });
});
