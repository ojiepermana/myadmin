import { describe, expect, test } from 'bun:test';
import { scanText } from './scan-secrets';

describe('secret scanner', () => {
  test('SEC-0053-AC2 accepts synthetic fixtures without credential-shaped tokens', () => {
    expect(scanText('password=synthetic-password apiToken=synthetic-token')).toEqual([]);
  });

  test('SEC-0053-AC2 detects private keys and provider token shapes', () => {
    const privateKey = ['-----BEGIN ', 'PRIVATE KEY-----'].join('');
    expect(scanText(`${privateKey}\nAKIA1234567890ABCDEF`)).toEqual([
      { file: '<text>', line: 1, kind: 'private key' },
      { file: '<text>', line: 2, kind: 'AWS access key' },
    ]);
  });
});
