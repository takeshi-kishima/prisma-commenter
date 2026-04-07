import type { SchemaInfo } from "../parser/types.js";
import { generatePostgresSQL } from "./postgres.js";
import { generateMySQLSQL, type ColumnDefinitionMap } from "./mysql.js";

export type { ColumnDefinition, ColumnDefinitionMap } from "./mysql.js";
export { escapeIdentifier, escapeString } from "./escape.js";
export { generatePostgresSQL } from "./postgres.js";
export { generateMySQLSQL } from "./mysql.js";

/** Options for SQL generation. */
export interface GenerateSQLOptions {
  /** PostgreSQL schema name (default: "public"). Ignored for MySQL. */
  schemaName?: string;
  /**
   * Column definitions from INFORMATION_SCHEMA (MySQL only).
   * Required to generate column-level comments for MySQL.
   */
  columnDefs?: ColumnDefinitionMap;
}

/**
 * Generate SQL COMMENT statements from parsed schema information.
 *
 * @param schema - Parsed schema information from parseSchema().
 * @param options - Generation options.
 * @returns An array of SQL statements.
 */
export function generateSQL(
  schema: SchemaInfo,
  options: GenerateSQLOptions = {},
): string[] {
  if (schema.connection.provider === "postgresql") {
    return generatePostgresSQL(schema.models, options.schemaName ?? "public");
  }

  return generateMySQLSQL(schema.models, options.columnDefs);
}
