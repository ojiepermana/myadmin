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

describe('table designer contract', () => {
  test('CT-0041-AC1, CT-0041-AC3, CT-0041-AC4, CT-0041-AC5, CT-0042-AC2, and CT-0042-AC3 expose provider-neutral type, constraint preview, and apply response shapes', async () => {
    const document = await loadContract(contractPath);
    const operations = contractOperations(document);
    expect(operations.map((candidate) => candidate.operationId)).toEqual(
      expect.arrayContaining(['getTableDesignerTypes', 'previewTableDdl', 'applyTableDdl']),
    );

    assertResponseMatchesContract(document, operation(operations, 'getTableDesignerTypes'), 200, {
      engine: 'postgresql',
      version: '16.4',
      types: [{ name: 'integer', label: 'Integer', parameters: [] }],
      rules: {
        onDelete: ['NO ACTION', 'RESTRICT', 'CASCADE', 'SET NULL', 'SET DEFAULT'],
        onUpdate: ['NO ACTION', 'RESTRICT', 'CASCADE', 'SET NULL', 'SET DEFAULT'],
        maxColumns: 32,
      },
      capability: {
        engine: 'postgresql',
        version: '16.4',
        capabilities: { generatedColumns: true, identityColumns: true },
      },
    });
    assertResponseMatchesContract(document, operation(operations, 'previewTableDdl'), 200, {
      operation: 'alter',
      statements: [
        {
          sql: 'DROP INDEX "idx_accounts_tenant"',
          destructiveIndexes: ['idx_accounts_tenant'],
        },
        {
          sql: 'CREATE INDEX "idx_accounts_tenant_email" ON "public"."accounts" ("tenant_id", "email")',
        },
      ],
      warnings: ['Changing an index is compiled as a drop followed by an add.'],
      destructive: true,
    });
    assertResponseMatchesContract(document, operation(operations, 'previewTableDdl'), 200, {
      operation: 'alter',
      statements: [
        {
          sql: 'ALTER TABLE "public"."orders" ADD CONSTRAINT "orders_account_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts" ("id") ON DELETE CASCADE ON UPDATE NO ACTION',
        },
      ],
      warnings: [],
      destructive: false,
    });
    assertResponseMatchesContract(document, operation(operations, 'applyTableDdl'), 409, {
      code: 'TABLE_CONFIRMATION_REQUIRED',
      message: 'Confirm the destructive change.',
      correlationId: 'corr-0041',
      details: { destructiveColumns: ['email'], table: 'public.accounts' },
    });
  });
});
