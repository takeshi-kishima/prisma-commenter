/** Database provider supported by prisma-commenter. */
export type Provider = "postgresql" | "mysql";

/** Connection information extracted from the datasource block. */
export interface ConnectionInfo {
  /** Database provider (postgresql or mysql). */
  provider: Provider;
  /** Resolved database URL. */
  url: string;
}

/** Information about a single database column (field). */
export interface FieldInfo {
  /** Prisma field name. */
  name: string;
  /** Database column name (from @map, or same as name). */
  dbName: string;
  /** Documentation comment (joined multi-line /// comments). */
  comment: string;
}

/** Information about a single database table (model or view). */
export interface ModelInfo {
  /** Prisma model/view name. */
  name: string;
  /** Database table name (from @@map, or same as name). */
  dbName: string;
  /** Documentation comment (joined multi-line /// comments), or null if none. */
  comment: string | null;
  /** Fields that have documentation comments. */
  fields: FieldInfo[];
}

/** Parsed schema information needed for SQL generation. */
export interface SchemaInfo {
  /** Connection information from the datasource block. */
  connection: ConnectionInfo;
  /** Models and views with documentation comments. */
  models: ModelInfo[];
}
