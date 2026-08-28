import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const root = process.cwd();

async function text(path: string): Promise<string> {
  return readFile(join(root, path), 'utf8');
}

describe('distribution release invariants', () => {
  test('IT-0055-AC1 publishes checksums, changelog notes, and release assets', async () => {
    const workflow = await text('.github/workflows/release.yml');
    expect(workflow).toContain('contents: write');
    expect(workflow).toContain('release:changelog');
    expect(workflow).toContain('gh release create');
    expect(workflow).toContain('dist/checksums.txt');
    expect(workflow).toContain('(cd dist/release && sha256sum *) > dist/checksums.txt');
    expect(workflow).toContain('fetch-depth: 0');
  });

  test('SEC-0055-AC2 and SEC-0055-AC3 gate signing on secrets and record unsigned status', async () => {
    const workflow = await text('.github/workflows/release.yml');
    expect(workflow).toContain('apple-actions/import-codesign-certs@v3');
    expect(workflow).toContain('xcrun notarytool submit');
    expect(workflow).toContain('signtool.exe');
    expect(workflow).toContain('Record signing status');
    expect(workflow).toContain('artifact is unsigned');
    expect(workflow).toContain('MACOS_DEVELOPER_ID_CERTIFICATE_P12_BASE64');
    expect(workflow).toContain('WINDOWS_SIGNING_CERTIFICATE_BASE64');
  });

  test('IT-0055-AC4 builds non root multi architecture runtime and tools images', async () => {
    const dockerfile = await text('distribution/docker/Dockerfile');
    const workflow = await text('.github/workflows/release.yml');
    expect(dockerfile).toContain('COPY dist/docker/${TARGETARCH}/myadmin');
    expect(dockerfile).toContain('USER 65532:65532');
    expect(dockerfile).toContain('VOLUME ["/data"]');
    expect(dockerfile).toContain(
      'ENTRYPOINT ["/usr/local/bin/myadmin", "serve", "--host", "0.0.0.0", "--data-dir", "/data"]',
    );
    expect(dockerfile).toContain('default-mysql-client postgresql-client');
    expect(workflow).toContain('platforms: linux/amd64,linux/arm64');
    expect(workflow).toContain('target: tools');
  });

  test('SEC-0055-AC5 keeps service templates restricted to local operation', async () => {
    const systemd = await text('distribution/service/myadmin.service');
    const launchd = await text('distribution/service/com.myadmin.server.plist');
    const serviceDocs = await text('distribution/service/README.md');
    expect(systemd).toContain('User=myadmin');
    expect(systemd).toContain('NoNewPrivileges=true');
    expect(systemd).toContain('ProtectSystem=strict');
    expect(systemd).toContain('ProtectHome=true');
    expect(systemd).toContain('UMask=0077');
    expect(launchd).toContain('<string>127.0.0.1</string>');
    expect(launchd).toContain('<key>Umask</key>');
    expect(serviceDocs).toContain('dedicated service account');
    expect(serviceDocs).toContain('launchctl bootstrap');
  });

  test('SMOKE-0055-AC6 documents configuration, data, recovery, upgrades, and limits', async () => {
    const operations = await Promise.all([
      text('docs/operations/configuration.md'),
      text('docs/operations/data-directory.md'),
      text('docs/operations/backup-recovery.md'),
      text('docs/operations/installation.md'),
      text('docs/operations/upgrade.md'),
      text('docs/operations/troubleshooting.md'),
    ]);
    const combined = operations.join('\n');
    for (const required of [
      'MYADMIN_MASTER_KEY',
      'config/master.key',
      'myadmin.db-wal',
      'pg_dump',
      'mysqldump',
      'migrate --status',
      'myadmin doctor',
      'V2',
    ]) {
      expect(combined).toContain(required);
    }
  });

  test('MANUAL-0055-AC7 exposes a secure quick start and reporting policy', async () => {
    const readme = await text('README.md');
    const security = await text('SECURITY.md');
    expect(readme).toContain('checksums.txt');
    expect(readme).toContain('myadmin serve');
    expect(readme).toContain('docs/operations/README.md');
    expect(security).toContain('security@ojiepermana.com');
    expect(security).toContain('private GitHub Security Advisory');
    expect(security).toContain('Never send key material');
  });
});
