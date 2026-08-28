import { createApp } from '../../apps/server/src/app';
import type { ImportService } from '../../packages/import/src';
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

describe('import API contract', () => {
  test('CT-0048-AC1..AC4 exposes authenticated upload, preview, SQL, and CSV operations', async () => {
    const document = await loadContract(contractPath);
    const operations = contractOperations(document);
    for (const operationId of [
      'uploadImport',
      'previewImport',
      'createImportSql',
      'createImportCsv',
    ])
      expect(operation(operations, operationId)).toBeDefined();

    let uploadedBytes = 0;
    const fakeService = {
      upload: async (_actor: unknown, input: { stream: AsyncIterable<Uint8Array> }) => {
        for await (const chunk of input.stream) uploadedBytes += chunk.byteLength;
        return {
          uploadId: 'contract-import-1',
          fileName: 'seed.csv',
          format: 'csv',
          sizeBytes: uploadedBytes,
          createdAt: '2026-01-01T00:00:00.000Z',
          expiresAt: '2026-01-01T01:00:00.000Z',
        };
      },
      preview: async () => ({
        uploadId: 'contract-import-1',
        format: 'csv',
        columns: ['id', 'name'],
        rows: [['1', 'Ada']],
        truncated: false,
      }),
      createSql: async () => ({ jobId: 'contract-import-sql-1' }),
      createCsv: async () => ({ jobId: 'contract-import-csv-1' }),
    } as unknown as ImportService;
    const app = createApp({ importService: fakeService });
    const request = (path: string, init?: RequestInit) =>
      app.handle(new Request(`http://localhost${path}`, init));

    await request('/setup/admin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'contract-import', password: 'synthetic-password' }),
    });
    const login = await request('/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'contract-import', password: 'synthetic-password' }),
    });
    const cookie = login.headers.get('set-cookie')?.split(';')[0];
    if (!cookie) throw new Error('Import contract login did not set a session cookie');
    const headers = { cookie, 'x-myadmin-csrf': '1' };

    const form = new FormData();
    form.set('file', new File(['id,name\n1,Ada\n'], 'seed.csv', { type: 'text/csv' }));
    const upload = await request('/import/upload', { method: 'POST', headers, body: form });
    expect(upload.status).toBe(201);
    assertResponseMatchesContract(
      document,
      operation(operations, 'uploadImport'),
      upload.status,
      await responsePayload(upload),
    );
    expect(uploadedBytes).toBeGreaterThan(0);

    const preview = await request('/import/preview?uploadId=contract-import-1&format=csv', {
      headers: { cookie },
    });
    expect(preview.status).toBe(200);
    assertResponseMatchesContract(
      document,
      operation(operations, 'previewImport'),
      preview.status,
      await responsePayload(preview),
    );

    const sql = await request('/import/sql', {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        connectionId: 'connection-1',
        database: 'app',
        uploadId: 'contract-import-1',
        transactionMode: 'single',
      }),
    });
    expect(sql.status).toBe(202);
    assertResponseMatchesContract(
      document,
      operation(operations, 'createImportSql'),
      sql.status,
      await responsePayload(sql),
    );

    const csv = await request('/import/csv', {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        connectionId: 'connection-1',
        ref: { database: 'app', schema: 'public', name: 'people', type: 'table' },
        uploadId: 'contract-import-1',
        options: { delimiter: ',', header: true, batchSize: 2 },
      }),
    });
    expect(csv.status).toBe(202);
    assertResponseMatchesContract(
      document,
      operation(operations, 'createImportCsv'),
      csv.status,
      await responsePayload(csv),
    );
  });
});
