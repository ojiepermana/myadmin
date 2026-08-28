import { describe, expect, it } from 'bun:test';
import { explorerRequestPath } from '../src/facades/explorer-client';

describe('ExplorerClient path serialization', () => {
  it('keeps pagination cursors opaque and encodes JSON refs as query values', () => {
    const ref = { database: 'app', schema: 'public', name: 'users', type: 'table' as const };
    expect(
      explorerRequestPath(
        'connection/one',
        '/objects/describe',
        { refresh: true },
        { ref: JSON.stringify(ref) },
      ),
    ).toBe(
      `/connections/connection%2Fone/objects/describe?refresh=true&ref=${encodeURIComponent(JSON.stringify(ref))}`,
    );
  });
});
