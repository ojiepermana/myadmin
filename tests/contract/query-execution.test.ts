import { describe, expect, test } from 'bun:test';
import { assertResponseMatchesContract, contractOperations, loadContract } from './harness';

const contractPath = new URL('../../dist/openapi-v1.yaml', import.meta.url).pathname;

describe('query execution contract', () => {
  test('CT-0033-AC4, CT-0033-AC6, and CT-0033-AC8 cover execution envelopes and typed cells', async () => {
    const document = await loadContract(contractPath);
    const operations = contractOperations(document);
    const acceptedOperation = operations.find((item) => item.operationId === 'startQueryExecution');
    const executionOperation = operations.find((item) => item.operationId === 'getQueryExecution');
    const cancelOperation = operations.find((item) => item.operationId === 'cancelQueryExecution');
    const explainOperation = operations.find((item) => item.operationId === 'explainQuery');
    if (!acceptedOperation || !executionOperation || !cancelOperation || !explainOperation) {
      throw new Error('Query operations are missing');
    }

    assertResponseMatchesContract(document, acceptedOperation, 202, {
      executionId: 'query-1',
    });
    assertResponseMatchesContract(document, executionOperation, 200, {
      executionId: 'query-1',
      tabSessionId: 'tab-1',
      connectionId: 'connection-1',
      database: 'app',
      sql: 'SELECT 1;',
      mode: 'full',
      state: 'completed',
      statements: [
        {
          sql: 'SELECT 1',
          startOffset: 0,
          endOffset: 8,
          state: 'done',
          result: {
            columns: ['value'],
            rows: [
              {
                value: { type: 'number', value: '1' },
                bigint: { type: 'number', value: '9007199254740993' },
                nullable: { type: 'null', value: null },
                empty: { type: 'string', value: '' },
                instant: { type: 'date', value: '2026-08-28T00:00:00.000Z' },
                binary: { type: 'bytes', value: 'AP8Q', encoding: 'base64' },
              },
            ],
            totalRows: 1,
            truncated: false,
          },
        },
      ],
      currentIndex: 0,
      transactionActive: false,
      createdAt: '2026-08-28T00:00:00.000Z',
    });
    expect(() =>
      assertResponseMatchesContract(document, executionOperation, 200, {
        executionId: 'query-1',
        state: 'completed',
      }),
    ).toThrow();

    assertResponseMatchesContract(document, cancelOperation, 200, {
      executionId: 'query-1',
      tabSessionId: 'tab-1',
      connectionId: 'connection-1',
      database: 'app',
      sql: 'SELECT 1;',
      mode: 'full',
      state: 'cancelled',
      statements: [],
      currentIndex: 0,
      transactionActive: false,
      createdAt: '2026-08-28T00:00:00.000Z',
    });
    assertResponseMatchesContract(document, explainOperation, 200, {
      planText: 'Seq Scan on users',
      engine: 'postgresql',
      durationMs: 3,
    });
  });
});
