import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

interface SmokeOptions {
  readonly binary: string;
  readonly dataDirectory?: string;
  readonly databaseUrl?: string;
  readonly requireDatabase: boolean;
  readonly port?: number;
}

interface SmokeDatabase {
  readonly engine: 'postgresql' | 'mysql';
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly username: string;
  readonly password: string;
  readonly sslMode: 'disable' | 'require';
}

function optionValue(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  return args.find((argument) => argument.startsWith(`${name}=`))?.slice(name.length + 1);
}

function parseOptions(args: readonly string[]): SmokeOptions {
  const binary = optionValue(args, '--binary');
  if (!binary) throw new Error('Usage: smoke-binary.ts --binary PATH [--database-url URL]');
  const portValue = optionValue(args, '--port');
  const port = portValue === undefined ? undefined : Number(portValue);
  if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) {
    throw new Error('--port must be a valid TCP port');
  }
  return {
    binary: resolve(binary),
    dataDirectory: optionValue(args, '--data-dir'),
    databaseUrl: optionValue(args, '--database-url') ?? process.env['MYADMIN_SMOKE_DATABASE_URL'],
    requireDatabase: args.includes('--require-database'),
    ...(port === undefined ? {} : { port }),
  };
}

function assertRunnableOnThisHost(binary: string): void {
  const target = binary
    .replaceAll('\\', '/')
    .match(/(?:^|\/)(linux-x64|linux-arm64|macos-x64|macos-arm64|windows-x64)(?:\/|$)/)?.[1];
  if (!target) return;
  const hostTarget =
    process.platform === 'darwin'
      ? `macos-${process.arch === 'arm64' ? 'arm64' : 'x64'}`
      : process.platform === 'linux'
        ? `linux-${process.arch === 'arm64' ? 'arm64' : 'x64'}`
        : process.platform === 'win32'
          ? 'windows-x64'
          : undefined;
  if (hostTarget && target !== hostTarget) {
    throw new Error(
      `Smoke target ${target} cannot run on this host (${hostTarget}); use its matching CI runner`,
    );
  }
}

function parseDatabaseUrl(value: string): SmokeDatabase {
  const url = new URL(value);
  const engine =
    url.protocol === 'postgres:' || url.protocol === 'postgresql:'
      ? 'postgresql'
      : url.protocol === 'mysql:'
        ? 'mysql'
        : undefined;
  if (!engine || !url.hostname || !url.username || !url.password || !url.pathname.slice(1)) {
    throw new Error('Smoke database URL must include postgres or mysql credentials and a database');
  }
  const sslMode = url.searchParams.get('sslmode') === 'require' ? 'require' : 'disable';
  return {
    engine,
    host: url.hostname,
    port: Number(url.port) || (engine === 'postgresql' ? 5432 : 3306),
    database: decodeURIComponent(url.pathname.slice(1)),
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    sslMode,
  };
}

async function waitForHealth(baseUrl: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.status === 200) return response;
      lastError = new Error(`health returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await Bun.sleep(100);
  }
  throw new Error(
    `Binary did not become healthy: ${lastError instanceof Error ? lastError.message : 'unknown error'}`,
  );
}

function sessionCookie(response: Response): string {
  const cookie = response.headers.get('set-cookie')?.split(';', 1)[0];
  if (!cookie) throw new Error('Login did not return a session cookie');
  return cookie;
}

async function jsonResponse(response: Response, label: string): Promise<Record<string, unknown>> {
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`);
  const body: unknown = await response.json();
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new Error(`${label} returned an invalid JSON body`);
  }
  return body as Record<string, unknown>;
}

async function runDoctor(
  binary: string,
  dataDirectory: string,
  environment: Record<string, string>,
): Promise<void> {
  const child = Bun.spawn([binary, 'doctor', '--data-dir', dataDirectory, '--json'], {
    env: { ...process.env, ...environment },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const exitCode = await child.exited;
  if (exitCode !== 0) throw new Error(`doctor returned exit code ${exitCode}`);
}

// SMOKE-0054-AC4: exercise the real binary health, embedded SPA, setup, login,
// database-connect, SIGTERM, and doctor acceptance path when configured.
export async function runBinarySmoke(options: SmokeOptions): Promise<void> {
  assertRunnableOnThisHost(options.binary);
  const temporaryRoot = await mkdtemp(`${tmpdir()}/myadmin-smoke-`);
  const dataDirectory = options.dataDirectory ?? `${temporaryRoot}/data`;
  const portReservation = Bun.serve({ port: options.port ?? 0, fetch: () => new Response() });
  const port = portReservation.port;
  portReservation.stop();
  const environment = {
    MYADMIN_MASTER_KEY: Buffer.alloc(32, 7).toString('base64'),
    MYADMIN_DATA_DIR: dataDirectory,
  };
  const child = Bun.spawn(
    [
      options.binary,
      'serve',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--data-dir',
      dataDirectory,
    ],
    { env: { ...process.env, ...environment }, stdout: 'pipe', stderr: 'pipe' },
  );
  let cleanupError: unknown;
  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    const health = await waitForHealth(baseUrl);
    await jsonResponse(health, 'health');
    const spa = await fetch(`${baseUrl}/`);
    const spaText = await spa.text();
    if (!spa.ok || !spaText.toLowerCase().includes('<!doctype html')) {
      throw new Error('GET / did not return the embedded SPA');
    }
    const setup = await jsonResponse(await fetch(`${baseUrl}/api/v1/setup/status`), 'setup status');
    if (setup['initialized'] !== false)
      throw new Error('Smoke data directory was already initialized');
    await jsonResponse(
      await fetch(`${baseUrl}/api/v1/setup/admin`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'smoke-admin', password: 'Smoke-password-123!' }),
      }),
      'setup admin',
    );
    const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'smoke-admin', password: 'Smoke-password-123!' }),
    });
    const login = await jsonResponse(loginResponse, 'login');
    const cookie = sessionCookie(loginResponse);
    if (!login['user']) throw new Error('Login did not return a user');
    await jsonResponse(
      await fetch(`${baseUrl}/api/v1/auth/me`, { headers: { cookie } }),
      'auth me',
    );
    if (options.databaseUrl) {
      const database = parseDatabaseUrl(options.databaseUrl);
      const connection = await jsonResponse(
        await fetch(`${baseUrl}/api/v1/connections`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            cookie,
            'x-myadmin-csrf': '1',
          },
          body: JSON.stringify({
            label: 'Smoke database',
            engine: database.engine,
            host: database.host,
            port: database.port,
            database: database.database,
            username: database.username,
            sslMode: database.sslMode,
            connectTimeoutMs: 3_000,
            groupId: null,
            tag: null,
            color: null,
            secret: database.password,
            saveSecret: false,
          }),
        }),
        'create connection',
      );
      const connectionId = connection['id'];
      if (typeof connectionId !== 'string') throw new Error('Create connection returned no id');
      await jsonResponse(
        await fetch(`${baseUrl}/api/v1/connections/${connectionId}/connect`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie, 'x-myadmin-csrf': '1' },
          body: JSON.stringify({ secret: database.password }),
        }),
        'connect database',
      );
    } else if (options.requireDatabase) {
      throw new Error(
        'Database smoke is required but --database-url or MYADMIN_SMOKE_DATABASE_URL is absent',
      );
    } else {
      console.log('SMOKE database connection: unavailable, no disposable database URL supplied');
    }
  } finally {
    try {
      child.kill('SIGTERM');
      const exitCode = await child.exited;
      if (exitCode !== 0) {
        cleanupError = new Error(`serve did not shut down cleanly, exit code ${exitCode}`);
      } else {
        await runDoctor(options.binary, dataDirectory, environment);
      }
    } catch (error) {
      cleanupError = error;
    } finally {
      if (!options.dataDirectory) await rm(temporaryRoot, { recursive: true, force: true });
    }
  }
  if (cleanupError) throw cleanupError;
  console.log(
    'SMOKE binary: passed health, embedded SPA, setup, login, auth, shutdown, and doctor checks',
  );
}

if (import.meta.main) {
  await runBinarySmoke(parseOptions(process.argv.slice(2)));
}
