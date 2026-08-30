import { describe, expect, test } from 'bun:test';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { isDatabaseEngine as engineFromCore } from '@myadmin/database-core';
import { isDatabaseEngine as engineFromDomain } from '@myadmin/internal-domain';
import { isDatabaseEngine as engineFromKernel } from '@myadmin/kernel';
import { detectNativeTool } from '@myadmin/native-tools';
import {
  postgresqlBackupFormat,
  validatePostgresqlArtifactHeader,
} from '@myadmin/database-postgresql';
import { mysqlBackupFormat, validateMysqlArtifactHeader } from '@myadmin/database-mysql';

const repositoryRoot = resolve(import.meta.dir, '../..');

interface CruiseModule {
  readonly source: string;
  readonly dependencies: readonly { readonly resolved: string }[];
}

interface CruiseResult {
  readonly modules: readonly CruiseModule[];
  readonly summary: { readonly error: number; readonly warn: number };
}

let cachedCruise: Promise<CruiseResult> | undefined;

/** Cruise the real module graph once and share it across the assertions below. */
function cruise(): Promise<CruiseResult> {
  cachedCruise ??= new Promise<CruiseResult>((resolveResult, rejectResult) => {
    const child = spawn(
      'bun',
      [
        'x',
        'dependency-cruiser',
        '--config',
        resolve(repositoryRoot, 'tooling/dependency-cruiser.cjs'),
        '--output-type',
        'json',
        '--progress',
        'none',
        'apps',
        'packages',
      ],
      { cwd: repositoryRoot, stdio: ['ignore', 'pipe', 'ignore'] },
    );
    let stdout = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.once('error', rejectResult);
    child.once('close', () => {
      try {
        resolveResult(JSON.parse(stdout) as CruiseResult);
      } catch (error) {
        rejectResult(error instanceof Error ? error : new Error(String(error)));
      }
    });
  });
  return cachedCruise;
}

describe('IT-0056-AC4 database-core stays free of runtime I/O and provider names', () => {
  test('the native tool probe runs from its own module and reports a missing tool safely', async () => {
    const status = await detectNativeTool('myadmin-tool-that-does-not-exist');
    expect(status.available).toBe(false);
    expect(status.command).toBe('myadmin-tool-that-does-not-exist');
    expect(status.reason).toContain('was not found on PATH');
  });

  test('the native tool probe reports a real executable it can run', async () => {
    const status = await detectNativeTool('bun');
    expect(status.available).toBe(true);
    expect(status.path).toBeTruthy();
    expect(status.version).toBeTruthy();
  });

  test('database-core imports no filesystem or subprocess module', async () => {
    const { modules } = await cruise();
    const offenders = modules
      .filter((module) => module.source.startsWith('packages/database-core/'))
      .flatMap((module) =>
        module.dependencies
          .filter((dependency) => /^node:(fs|child_process)/.test(dependency.resolved))
          .map((dependency) => `${module.source} -> ${dependency.resolved}`),
      );
    expect(offenders).toEqual([]);
  });

  test('each provider declares its own artifact format and header rule', () => {
    expect(postgresqlBackupFormat).not.toBe(mysqlBackupFormat);
    expect(validatePostgresqlArtifactHeader('-- PostgreSQL database dump')).toBe(true);
    expect(validatePostgresqlArtifactHeader('binary garbage')).toBe(false);
    expect(validateMysqlArtifactHeader('/*!40101 SET NAMES utf8 */;')).toBe(true);
    expect(validateMysqlArtifactHeader('binary garbage')).toBe(false);
  });

  test('every module reads the same canonical DatabaseEngine definition', () => {
    expect(engineFromCore).toBe(engineFromKernel);
    expect(engineFromDomain).toBe(engineFromKernel);
    expect(engineFromKernel('postgresql')).toBe(true);
    expect(engineFromKernel('mysql')).toBe(true);
    expect(engineFromKernel('sqlite')).toBe(false);
  });
});

describe('IT-0056-AC10 module boundaries hold across the real graph', () => {
  test('the boundary rules report no violation on the current tree', async () => {
    const { summary } = await cruise();
    expect(summary.error).toBe(0);
  });

  test('the server application no longer reaches into the CLI application', async () => {
    const { modules } = await cruise();
    const crossAppEdges = modules
      .filter((module) => module.source.startsWith('apps/server/'))
      .flatMap((module) =>
        module.dependencies
          .filter((dependency) => dependency.resolved.startsWith('apps/cli/'))
          .map((dependency) => `${module.source} -> ${dependency.resolved}`),
      );
    expect(crossAppEdges).toEqual([]);
  });

  test('no package reaches into an application', async () => {
    const { modules } = await cruise();
    const inwardBreaks = modules
      .filter((module) => module.source.startsWith('packages/'))
      .flatMap((module) =>
        module.dependencies
          .filter((dependency) => dependency.resolved.startsWith('apps/'))
          .map((dependency) => `${module.source} -> ${dependency.resolved}`),
      );
    expect(inwardBreaks).toEqual([]);
  });

  test('cross package imports go through the module entry point', async () => {
    const { modules } = await cruise();
    const deepImports = modules.flatMap((module) => {
      const owner = /^packages\/([^/]+)\//.exec(module.source)?.[1];
      return module.dependencies
        .filter((dependency) => {
          const target = /^packages\/([^/]+)\/src\/(.+)$/.exec(dependency.resolved);
          if (!target) return false;
          return target[1] !== owner && target[2] !== 'index.ts';
        })
        .map((dependency) => `${module.source} -> ${dependency.resolved}`);
    });
    expect(deepImports).toEqual([]);
  });
});
