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
  test('CT-0028-AC5 matches the typed job response and owner error contracts', async () => {
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
      executor: () => ({ rows: 1 }),
    });
    await jobManager.whenIdle();

    const list = await request('/jobs?page=1&page-size=20', { headers: { cookie } });
    assertResponseMatchesContract(
      document,
      operation(operations, 'listJobs'),
      list.status,
      await responsePayload(list),
    );
    const detail = await request(`/jobs/${jobId}`, { headers: { cookie } });
    assertResponseMatchesContract(
      document,
      operation(operations, 'getJob'),
      detail.status,
      await responsePayload(detail),
    );

    const hidden = await request('/jobs/not-owned', { headers: { cookie } });
    expect(hidden.status).toBe(404);
    assertResponseMatchesContract(
      document,
      operation(operations, 'getJob'),
      hidden.status,
      await responsePayload(hidden),
    );
    const invalidPage = await request('/jobs?page-size=101', { headers: { cookie } });
    expect(invalidPage.status).toBe(422);
    assertResponseMatchesContract(
      document,
      operation(operations, 'listJobs'),
      invalidPage.status,
      await responsePayload(invalidPage),
    );
  });
});
