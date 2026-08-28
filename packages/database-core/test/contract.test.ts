import { describe, expect, test } from 'bun:test';
import {
  CAPABILITY_KEYS,
  ConnectionContext,
  DbError,
  DB_ERROR_CATEGORIES,
  ProviderRegistry,
} from '../src';
import { createFakeConnectionContext, FakeDatabaseProvider } from '../../testkit/src';
import { defineDatabaseProviderContractTests } from './contract-suite';

describe('database-core contracts', () => {
  const provider = new FakeDatabaseProvider();

  defineDatabaseProviderContractTests({
    provider,
    context: createFakeConnectionContext(),
    invalidContext: createFakeConnectionContext('wrong-secret'),
  });

  test('keeps the V1 capability vocabulary closed and V2 keys false', () => {
    expect(CAPABILITY_KEYS).toEqual([
      'schemas',
      'viewEditor',
      'explain',
      'cancelQuery',
      'backupRestore',
      'importExport',
      'principals',
      'grants',
      'tableComments',
      'generatedColumns',
      'identityColumns',
      'checkConstraints',
      'materializedViews',
      'vacuum',
      'rowLevelSecurity',
      'events',
      'binlog',
    ]);
  });

  test('does not serialize a connection secret', () => {
    const context = createFakeConnectionContext();
    expect(context.secret).toBe('fake-provider-secret');
    expect(Object.prototype.propertyIsEnumerable.call(context, 'secret')).toBe(false);
    expect(JSON.stringify(context)).not.toContain(context.secret ?? '');
  });

  test('normalizes errors without exposing causes or secrets', () => {
    const error = new DbError({
      category: 'syntax_error',
      message: 'syntax near password=super-secret',
      position: 12,
      sqlState: '42601',
      cause: new Error('super-secret'),
    });

    expect(DB_ERROR_CATEGORIES).toContain(error.category);
    expect(error.message).not.toContain('super-secret');
    expect(Object.keys(error)).not.toContain('cause');
    expect(JSON.stringify(error)).not.toContain('super-secret');
    expect(error.position).toBe(12);
    expect(error.sqlState).toBe('42601');
  });

  test('resolves registered providers and normalizes unknown engines', () => {
    const registry = new ProviderRegistry([provider]);
    expect(registry.get('postgresql')).toBe(provider);
    expect(() => registry.get('oracle')).toThrowError(DbError);
    try {
      registry.get('oracle');
    } catch (error) {
      expect((error as DbError).category).toBe('unsupported');
    }
  });

  test('connection context copies its descriptor', () => {
    const descriptor = {
      engine: 'postgresql' as const,
      host: 'localhost',
      port: 5432,
      user: 'fixture',
    };
    const context = new ConnectionContext(descriptor, 'secret');
    descriptor.host = 'changed';
    expect(context.descriptor.host).toBe('localhost');
  });
});
