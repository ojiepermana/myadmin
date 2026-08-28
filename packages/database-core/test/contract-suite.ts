import { expect, test } from 'bun:test';
import { DbError, type ConnectionContext, type DatabaseProvider } from '../src';

export interface DatabaseProviderContractFixture {
  provider: DatabaseProvider;
  context: ConnectionContext;
  invalidContext: ConnectionContext;
}

/** Reusable checks that provider packages can run with real engine adapters. */
export function defineDatabaseProviderContractTests(
  fixture: DatabaseProviderContractFixture,
): void {
  test('describe is consistent with a successful operation', async () => {
    const handle = await fixture.provider.connection.open(fixture.context);
    const description = await fixture.provider.capability.describe(handle);
    const info = await fixture.provider.connection.serverInfo(handle);

    expect(description.engine).toBe(fixture.provider.engine);
    expect(description.version).toBe(info.version);
    expect(description.capabilities).toMatchObject({
      schemas: expect.any(Boolean),
      viewEditor: expect.any(Boolean),
      explain: expect.any(Boolean),
      cancelQuery: expect.any(Boolean),
    });

    await fixture.provider.connection.close(handle);
  });

  test('invalid credentials cross the boundary as a normalized error', async () => {
    try {
      await fixture.provider.connection.open(fixture.invalidContext);
      throw new Error('expected provider authentication to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(DbError);
      expect((error as DbError).category).toBe('auth_failed');
      expect(JSON.stringify(error)).not.toContain(fixture.invalidContext.secret ?? '');
    }
  });
}
