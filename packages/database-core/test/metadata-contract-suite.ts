import { expect, test } from 'bun:test';
import type { ConnectionContext, MetadataPort, ObjectRef } from '../src';

export interface MetadataContractFixture {
  readonly metadata: MetadataPort;
  readonly context: ConnectionContext;
  readonly database: ObjectRef;
  readonly table: ObjectRef;
}

function expectObjectRefShape(ref: ObjectRef): void {
  expect(Object.keys(ref).sort()).toEqual(['database', 'name', 'schema', 'type']);
  expect(ref.database).toEqual(expect.any(String));
  expect(ref.name).toEqual(expect.any(String));
  expect(ref.schema === null || typeof ref.schema === 'string').toBe(true);
  expect(ref.type).toEqual(expect.any(String));
}

/** Reusable metadata checks for provider implementations and real fixtures. */
export function defineMetadataContractTests(fixture: MetadataContractFixture): void {
  test('[CT-0025-AC7] metadata pages use the engine neutral object shape', async () => {
    const objects = await fixture.metadata.listObjects(fixture.context, fixture.database, {
      limit: 50,
    });
    expect(objects.items.length).toBeGreaterThan(0);
    for (const ref of objects.items) expectObjectRefShape(ref);

    const columns = await fixture.metadata.listColumns(fixture.context, fixture.table, {
      limit: 50,
    });
    const indexes = await fixture.metadata.listIndexes(fixture.context, fixture.table, {
      limit: 50,
    });
    const constraints = await fixture.metadata.listConstraints(fixture.context, fixture.table, {
      limit: 50,
    });

    expect(Array.isArray(columns.items)).toBe(true);
    expect(Array.isArray(indexes.items)).toBe(true);
    expect(Array.isArray(constraints.items)).toBe(true);
    expect(indexes.items.every((index) => typeof index.name === 'string')).toBe(true);
    expect(constraints.items.every((constraint) => typeof constraint.name === 'string')).toBe(true);
  });

  test('[CT-0025-AC7] metadata pages honor the common cursor contract', async () => {
    const page = await fixture.metadata.listObjects(fixture.context, fixture.database, {
      limit: 1,
    });
    expect(page.items).toHaveLength(1);
    if (page.cursor !== undefined) {
      const next = await fixture.metadata.listObjects(fixture.context, fixture.database, {
        limit: 1,
        cursor: page.cursor,
      });
      expect(next.items).toBeInstanceOf(Array);
    }
  });
}
