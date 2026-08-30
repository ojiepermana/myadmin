import { describe, expect, test } from 'bun:test';
import {
  assertResponseMatchesContract,
  contractOperations,
  loadContract,
  responsePayload,
  type ContractOperation,
} from './harness';

const contractPath = new URL('../../dist/openapi-v1.yaml', import.meta.url).pathname;
function operation(operations: ContractOperation[], operationId: string): ContractOperation {
  const found = operations.find((candidate) => candidate.operationId === operationId);
  if (!found) throw new Error(`Contract operation ${operationId} is missing`);
  return found;
}

describe('data browser contract', () => {
  test('[CT-0037-AC1] exposes a typed bounded page response', async () => {
    const document = await loadContract(contractPath);
    const read = operation(contractOperations(document), 'readData');
    expect(read.method).toBe('post');
    assertResponseMatchesContract(document, read, 200, {
      ref: { database: 'app', schema: 'public', name: 'users', type: 'table' },
      columns: ['id'],
      columnsMeta: [{ name: 'id', dataType: 'integer', nullable: false, primary: true }],
      rows: [{ id: { type: 'number', value: '1' } }],
      total: { value: 1, kind: 'exact' },
      page: { limit: 100, offset: 0, hasMore: false },
      rowIdentity: { columns: ['id'], kind: 'primary', editable: true },
    });
  });

  test('[CT-0038-AC1, CT-0038-AC2, CT-0038-AC3, CT-0038-AC4] exposes typed row mutation operations', async () => {
    const document = await loadContract(contractPath);
    const operations = contractOperations(document);
    const insert = operation(operations, 'insertDataRow');
    const update = operation(operations, 'updateDataRow');
    const remove = operation(operations, 'deleteDataRows');
    expect([insert.method, update.method, remove.method]).toEqual(['post', 'patch', 'post']);
    const mutation = { affectedRows: 1 };
    assertResponseMatchesContract(document, insert, 200, mutation);
    assertResponseMatchesContract(document, update, 200, mutation);
    assertResponseMatchesContract(document, remove, 200, mutation);
  });

  test('[CT-0038-AC6] exposes a safe typed-row conversion error response', async () => {
    const document = await loadContract(contractPath);
    const insert = operation(contractOperations(document), 'insertDataRow');
    assertResponseMatchesContract(document, insert, 422, {
      code: 'DATA_INVALID',
      message: 'Column id contains an invalid number.',
      correlationId: 'corr-0038-invalid-number',
      details: { column: 'id' },
    });
  });

  test('[CT-0044-AC2, CT-0044-AC3] exposes view CRUD, preview, validation, and drop contract operations', async () => {
    const document = await loadContract(contractPath);
    const operations = contractOperations(document);
    const list = operation(operations, 'listViews');
    const create = operation(operations, 'createView');
    const get = operation(operations, 'getView');
    const preview = operation(operations, 'previewViewDdl');
    const validate = operation(operations, 'validateViewDefinition');
    const dropPreview = operation(operations, 'previewViewDrop');
    const update = operation(operations, 'updateView');
    const drop = operation(operations, 'deleteView');
    expect(
      [list, create, get, preview, validate, dropPreview, update, drop].map((item) => item.method),
    ).toEqual(['get', 'post', 'get', 'post', 'post', 'post', 'put', 'delete']);

    const ref = { database: 'app', schema: 'public', name: 'daily_sales', type: 'view' } as const;
    const changeSet = {
      strategy: 'replace',
      statements: ['CREATE OR REPLACE VIEW "public"."daily_sales" AS SELECT 1;'],
      dependents: [],
      warnings: [],
      requiresConfirmation: false,
    };
    const mutation = { view: { ref, definition: 'SELECT 1' }, changeSet };
    assertResponseMatchesContract(document, list, 200, { items: [ref], cursor: null });
    assertResponseMatchesContract(document, get, 200, { ref, definition: 'SELECT 1' });
    assertResponseMatchesContract(document, preview, 200, changeSet);
    assertResponseMatchesContract(document, create, 201, {
      ...mutation,
      changeSet: { ...changeSet, strategy: 'create' },
    });
    assertResponseMatchesContract(document, update, 200, mutation);
    assertResponseMatchesContract(document, validate, 200, { valid: true });
    assertResponseMatchesContract(document, dropPreview, 200, {
      ...changeSet,
      strategy: 'drop',
      statements: ['DROP VIEW "public"."daily_sales";'],
      requiresConfirmation: true,
    });
    assertResponseMatchesContract(document, drop, 204, undefined);
  });

  test('[CT-0044-AC4, CT-0044-AC6] keeps unsupported and provider validation errors contract-safe', async () => {
    const document = await loadContract(contractPath);
    const operations = contractOperations(document);
    const preview = operation(operations, 'previewViewDdl');
    const validate = operation(operations, 'validateViewDefinition');
    const unsupported = {
      code: 'VIEW_EDITOR_UNSUPPORTED',
      message: 'View editing is unavailable for this provider.',
      correlationId: 'corr-unsupported',
      details: { category: 'unsupported' },
    };
    const invalid = {
      code: 'DB_ERROR',
      message: 'The view SELECT is invalid.',
      correlationId: 'corr-invalid',
      details: { category: 'syntax_error', position: 7 },
    };
    assertResponseMatchesContract(document, preview, 501, unsupported);
    assertResponseMatchesContract(document, validate, 422, invalid);
    expect(await responsePayload(new Response(null, { status: 204 }))).toBeUndefined();
  });
});
