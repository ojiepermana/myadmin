export type DatabaseEngine = 'postgresql' | 'mysql';

export type DatabaseObjectType =
  'database' | 'schema' | 'table' | 'view' | 'routine' | 'sequence' | 'trigger' | 'other';

/** A provider independent identity for an object in a database hierarchy. */
export interface ObjectRef {
  database: string;
  schema?: string | null;
  name: string;
  type: DatabaseObjectType;
}

export interface Page<T> {
  items: T[];
  cursor?: string;
  total?: number;
}

export interface PageRequest {
  cursor?: string;
  limit?: number;
}

export type MetadataObjectType = Exclude<DatabaseObjectType, 'database' | 'schema' | 'other'>;

export interface MetadataObjectPageRequest extends PageRequest {
  types?: readonly MetadataObjectType[];
}

export interface ColumnDefinition {
  name: string;
  dataType: string;
  nullable: boolean;
  position?: number;
  defaultExpression?: string;
  comment?: string;
  isIdentity?: boolean;
  isGenerated?: boolean;
  generatedExpression?: string;
}

export interface IndexDefinition {
  name: string;
  columns: string[];
  unique: boolean;
  primary: boolean;
  method?: string;
  predicate?: string;
}

export type ConstraintType =
  'primaryKey' | 'foreignKey' | 'unique' | 'check' | 'notNull' | 'exclusion' | 'other';

export interface ConstraintDefinition {
  name: string;
  type: ConstraintType;
  columns?: string[];
  expression?: string;
  referencedTable?: ObjectRef;
  referencedColumns?: string[];
  onUpdate?: string;
  onDelete?: string;
}

export type PrincipalType = 'user' | 'role' | 'account' | 'other';

export type PrincipalAttributeValue = string | number | boolean | null;

export interface PrincipalAttribute {
  key: string;
  value: PrincipalAttributeValue;
}

/** Engine neutral database identity. Secrets and authentication material are never included. */
export interface Principal {
  name: string;
  type: PrincipalType;
  attributes: PrincipalAttribute[];
  memberOf: string[];
  /** MySQL keeps the account user and host separate even though name is user@host. */
  user?: string;
  host?: string;
}

export interface Grant {
  principal: string;
  object: ObjectRef;
  privileges: string[];
  grantable?: boolean;
}

export interface DatabaseDefinition {
  name: string;
  owner?: string;
  sizeBytes?: number;
  encoding?: string;
  charset?: string;
  collation?: string;
  objectCount?: number;
}

/** Provider validated inputs for creating a database. */
export interface DatabaseCreateInput {
  name: string;
  owner?: string;
  encoding?: string;
  template?: string;
  charset?: string;
  collation?: string;
}

/** Engine supplied values shown by the database creation form. */
export interface DatabaseCreateOptions {
  engine?: DatabaseEngine;
  encodings?: string[];
  charsets?: string[];
  collations?: string[];
  templates?: string[];
  owners?: string[];
}

export interface SchemaDefinition {
  name: string;
  database: string;
  owner?: string;
  isSystem?: boolean;
}

export interface TableDefinition {
  ref: ObjectRef;
  columns?: ColumnDefinition[];
  comment?: string;
}

export interface TableDescription extends TableDefinition {
  columns: ColumnDefinition[];
  indexes: IndexDefinition[];
  constraints: ConstraintDefinition[];
  estimatedRows?: number;
  sizeBytes?: number;
}

export interface ViewDefinition {
  ref: ObjectRef;
  definition: string;
}

export type DataRow = Record<string, unknown>;

/** A JSON safe cell that keeps values such as bigint and bytes lossless. */
export type QueryCell =
  | { type: 'null'; value: null }
  | { type: 'string'; value: string }
  | { type: 'number'; value: string }
  | { type: 'boolean'; value: boolean }
  | { type: 'date'; value: string }
  | { type: 'bytes'; value: string; encoding: 'base64' }
  | { type: 'json'; value: string };

export type SerializedDataRow = Record<string, QueryCell>;

export interface DataPageRequest extends PageRequest {
  table: ObjectRef;
  columns?: string[];
  filter?: Record<string, unknown>;
  sort?: Array<{ column: string; direction: 'asc' | 'desc' }>;
}

export interface MutationResult {
  affectedRows: number;
  returning?: DataRow[];
}

export interface QueryResult {
  columns: string[];
  rows: DataRow[];
  affectedRows?: number;
  durationMs?: number;
}

export interface SerializedQueryResult {
  columns: string[];
  rows: SerializedDataRow[];
  affectedRows?: number;
  durationMs?: number;
  totalRows: number;
  truncated: boolean;
}

export interface QueryRequest {
  sql: string;
  parameters?: unknown[];
}

export interface ExplainResult {
  plan: unknown;
}

export interface JobHandle {
  id: string;
}
