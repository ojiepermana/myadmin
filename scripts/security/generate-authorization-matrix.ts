import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';

type RecordValue = Record<string, unknown>;

export interface AuthorizationMatrixRow {
  readonly operationId: string;
  readonly method: string;
  readonly path: string;
  readonly anonymous: number;
  readonly user: number;
  readonly admin: number;
}

const repositoryRoot = resolve(import.meta.dir, '../..');
const contractRoot = resolve(repositoryRoot, 'packages/api-contract/openapi/v1');
const contractPath = resolve(contractRoot, 'openapi.yaml');
const outputPath = resolve(
  repositoryRoot,
  'tests/security/authorization/authorization-matrix.generated.ts',
);
const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']);

function record(value: unknown, label: string): RecordValue {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as RecordValue;
}

function loadYaml(path: string): RecordValue {
  return record(parse(readFileSync(path, 'utf8')), path);
}

function operationFromPathItem(pathItem: RecordValue): RecordValue {
  const reference = pathItem['$ref'];
  if (typeof reference !== 'string' || !reference.startsWith('./')) return pathItem;
  return loadYaml(resolve(contractRoot, reference.slice(2)));
}

function successStatus(operation: RecordValue, label: string): number {
  const responses = record(operation['responses'], `${label}.responses`);
  const status = Object.keys(responses).find((candidate) => /^2\d\d$/.test(candidate));
  if (!status) throw new Error(`${label} has no successful response`);
  return Number(status);
}

function protectedOperation(operation: RecordValue): boolean {
  return !Array.isArray(operation['security']) || operation['security'].length > 0;
}

function adminOnly(operation: RecordValue): boolean {
  const roles = operation['x-myadmin-roles'];
  return Array.isArray(roles) && roles.includes('admin');
}

export function authorizationMatrix(): readonly AuthorizationMatrixRow[] {
  const root = loadYaml(contractPath);
  const paths = record(root['paths'], 'paths');
  const rows: AuthorizationMatrixRow[] = [];
  for (const [pathName, rawPathItem] of Object.entries(paths)) {
    const pathItem = operationFromPathItem(record(rawPathItem, `${pathName}`));
    for (const [method, rawOperation] of Object.entries(pathItem)) {
      if (!methods.has(method)) continue;
      const operation = record(rawOperation, `${pathName}.${method}`);
      const operationId = operation['operationId'];
      if (typeof operationId !== 'string' || operationId.length === 0) {
        throw new Error(`${pathName}.${method} must define operationId`);
      }
      const success = successStatus(operation, `${pathName}.${method}`);
      const secured = protectedOperation(operation);
      rows.push({
        operationId,
        method: method.toUpperCase(),
        path: pathName,
        anonymous: secured ? 401 : success,
        user: secured && adminOnly(operation) ? 403 : success,
        admin: success,
      });
    }
  }
  return rows.sort((left, right) => left.operationId.localeCompare(right.operationId));
}

export function authorizationMatrixSource(): string {
  const importLine =
    "import type { AuthorizationMatrixRow } from '../../../scripts/security/generate-authorization-matrix';";
  return `// Generated from packages/api-contract/openapi/v1/openapi.yaml. Do not edit.\n\n${importLine}\n\n// prettier-ignore\nexport const authorizationMatrix: readonly AuthorizationMatrixRow[] = ${JSON.stringify(authorizationMatrix(), null, 2)};\n`;
}

export function writeAuthorizationMatrix(): void {
  mkdirSync(resolve(repositoryRoot, 'tests/security/authorization'), { recursive: true });
  writeFileSync(outputPath, authorizationMatrixSource(), 'utf8');
}

if (import.meta.main) {
  const check = process.argv.includes('--check');
  const source = authorizationMatrixSource();
  if (check) {
    if (!existsSync(outputPath) || readFileSync(outputPath, 'utf8') !== source) {
      console.error('Authorization matrix is stale. Run bun run security:authorization-matrix.');
      process.exit(1);
    }
    console.log(`Authorization matrix check passed: ${authorizationMatrix().length} operations.`);
  } else {
    writeAuthorizationMatrix();
    console.log(`Authorization matrix written: ${outputPath}`);
  }
}
