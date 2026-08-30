import { describe, expect, test } from 'bun:test';
import { assertResponseMatchesContract, contractOperations, loadContract } from './harness';

const contractPath = new URL('../../dist/openapi-v1.yaml', import.meta.url).pathname;

function operation(operations: ReturnType<typeof contractOperations>, operationId: string) {
  const found = operations.find((candidate) => candidate.operationId === operationId);
  if (!found) throw new Error(`Contract operation ${operationId} is missing`);
  return found;
}

describe('backup artifact API contract', () => {
  test('CT-0049-AC1, CT-0049-AC2, CT-0049-AC7, and CT-0050-AC6 validate capability, queue, and unsupported shapes', async () => {
    const document = await loadContract(contractPath);
    const operations = contractOperations(document);
    const capability = operation(operations, 'getBackupCapability');
    const create = operation(operations, 'createBackup');
    const capabilityBody = {
      supported: false,
      backupTool: {
        command: 'pg_dump',
        available: false,
        reason: 'The native backup tool is unavailable.',
      },
      restoreTool: { command: 'pg_restore', available: false },
      restoreSqlTool: { command: 'psql', available: true, version: '18.1' },
      restoreSupported: true,
      reason: 'The native backup tool is unavailable.',
    };

    assertResponseMatchesContract(document, capability, 200, capabilityBody);
    assertResponseMatchesContract(document, create, 202, { jobId: 'backup-job-1' });
    assertResponseMatchesContract(document, create, 501, {
      code: 'BACKUP_UNSUPPORTED',
      message: 'The native backup tool is unavailable.',
      correlationId: 'backup-contract-1',
    });
    const paths = document['paths'] as Record<string, unknown>;
    const backupPath = paths['/backup'] as Record<string, unknown>;
    const createDefinition = backupPath['post'] as Record<string, unknown>;
    const requestBody = createDefinition['requestBody'] as Record<string, unknown>;
    const content = requestBody['content'] as Record<string, unknown>;
    const jsonContent = content['application/json'] as Record<string, unknown>;
    const requestSchema = jsonContent['schema'];
    expect(requestSchema).toMatchObject({
      $ref: '#/components/schemas/BackupCreateRequest',
    });
  });

  test('CT-0049-AC5 validates owner-scoped listing and exact-confirmation deletion shapes', async () => {
    const document = await loadContract(contractPath);
    const operations = contractOperations(document);
    const artifact = {
      id: 'orders-20260830000000.sql',
      fileName: 'orders-20260830000000.sql',
      connectionId: 'connection-1',
      connectionLabel: 'Fixture PostgreSQL',
      database: 'app',
      scope: 'both',
      compress: false,
      sizeBytes: 35,
      createdAt: '2026-08-30T00:00:00.000Z',
      toolVersion: 'pg_dump fixture',
    };

    assertResponseMatchesContract(document, operation(operations, 'listBackups'), 200, {
      items: [artifact],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    assertResponseMatchesContract(document, operation(operations, 'deleteBackup'), 204, undefined);
    expect(() =>
      assertResponseMatchesContract(document, operation(operations, 'listBackups'), 200, {
        items: [{ ...artifact, scope: 'invalid' }],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
    ).toThrow();
  });
});
