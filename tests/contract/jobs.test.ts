import { createApp } from '../../apps/server/src/app';
import { JobManager } from '../../packages/jobs/src';
import { afterEach, describe, expect, test } from 'bun:test';
import {
  assertResponseMatchesContract,
  contractOperations,
  loadContract,
  responsePayload,
  type ContractOperation,
} from './harness';

const contractPath = new URL('../../dist/openapi-v1.yaml', import.meta.url).pathname;
const managers: JobManager[] = [];

function operation(operations: ContractOperation[], operationId: string): ContractOperation {
  const found = operations.find((candidate) => candidate.operationId === operationId);
  if (!found) throw new Error(`Contract operation ${operationId} is missing`);
  return found;
}

afterEach(() => {
  for (const manager of managers.splice(0)) manager.dispose();
});

describe('jobs API contract', () => {
  test('CT-0028-AC5 and CT-0048-AC6 match the typed job response and import summary contract', async () => {
    const document = await loadContract(contractPath);
    const operations = contractOperations(document);
    const jobManager = new JobManager({
      cleanupIntervalMs: 86_400_000,
      createId: () => 'contract-job-1',
    });
    managers.push(jobManager);
    const app = createApp({ jobManager });
    const request = (path: string, init?: RequestInit) =>
      app.handle(new Request(`http://localhost${path}`, init));

    await request('/setup/admin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'contract-jobs', password: 'synthetic-password' }),
    });
    const login = await request('/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'contract-jobs', password: 'synthetic-password' }),
    });
    const cookie = login.headers.get('set-cookie')?.split(';')[0];
    if (!cookie) throw new Error('Login did not set a session cookie');
    const setup = await request('/auth/me', { headers: { cookie } });
    const ownerUserId = ((await setup.json()) as { id: string }).id;
    const jobId = jobManager.submit({
      type: 'synthetic.contract',
      ownerUserId,
      executor: () => ({
        format: 'sql',
        statementsSucceeded: 3,
        statementsFailed: 0,
        rowsSucceeded: 12,
        rowsFailed: 0,
        failedRows: [],
        bytesProcessed: 256,
        durationMs: 42,
        partial: false,
        cancelled: false,
        destructive: false,
      }),
    });
    await jobManager.whenIdle();

    const list = await request('/jobs?page=1&pageSize=20', { headers: { cookie } });
    assertResponseMatchesContract(
      document,
      operation(operations, 'listJobs'),
      list.status,
      await responsePayload(list),
    );
    const detail = await request(`/jobs/${jobId}`, { headers: { cookie } });
    const detailPayload = await responsePayload(detail);
    assertResponseMatchesContract(
      document,
      operation(operations, 'getJob'),
      detail.status,
      detailPayload,
    );
    expect(detailPayload).toMatchObject({
      result: {
        format: 'sql',
        statementsSucceeded: 3,
        statementsFailed: 0,
        rowsSucceeded: 12,
        rowsFailed: 0,
        durationMs: 42,
        partial: false,
        cancelled: false,
        destructive: false,
      },
    });
    expect(JSON.stringify(detailPayload)).not.toContain('INSERT');

    const hidden = await request('/jobs/not-owned', { headers: { cookie } });
    expect(hidden.status).toBe(404);
    assertResponseMatchesContract(
      document,
      operation(operations, 'getJob'),
      hidden.status,
      await responsePayload(hidden),
    );
    const invalidPage = await request('/jobs?pageSize=101', { headers: { cookie } });
    expect(invalidPage.status).toBe(422);
    assertResponseMatchesContract(
      document,
      operation(operations, 'listJobs'),
      invalidPage.status,
      await responsePayload(invalidPage),
    );
  });
});
