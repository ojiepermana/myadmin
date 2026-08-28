export type DatabaseEngine = 'postgresql' | 'mysql';

export type DatabaseObjectType =
  'database' | 'schema' | 'table' | 'view' | 'routine' | 'sequence' | 'trigger' | 'other';

/** A provider independent identity for an object in a database hierarchy. */
export interface ObjectRef {
  database: string;
  schema?: string;
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
}

export type PrincipalType = 'user' | 'role' | 'account' | 'other';

export interface Principal {
  name: string;
  type: PrincipalType;
  canLogin?: boolean;
  disabled?: boolean;
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

export interface ViewDefinition {
  ref: ObjectRef;
  definition: string;
}

export type DataRow = Record<string, unknown>;

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
