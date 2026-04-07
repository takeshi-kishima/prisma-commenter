import type { SchemaInfo } from "../parser/types.js";
import { executePostgres } from "./postgres.js";
import { executeMySQL } from "./mysql.js";

/** Options for the execute() function. */
export interface ExecuteOptions {
  /** PostgreSQL schema name (default: "public"). Ignored for MySQL. */
  schemaName?: string;
  /** If true, only return SQL without executing. */
  dryRun?: boolean;
  /** If true, print each SQL statement before executing. */
  verbose?: boolean;
}

/**
 * Execute COMMENT statements against the database described in the schema.
 *
 * Dispatches to the appropriate provider executor based on
 * schema.connection.provider.
 *
 * @param schema - Parsed schema information from parseSchema().
 * @param options - Execution options.
 * @returns The generated SQL statements.
 */
export async function execute(
  schema: SchemaInfo,
  options: ExecuteOptions = {},
): Promise<string[]> {
  if (schema.connection.provider === "postgresql") {
    return executePostgres(schema, {
      schemaName: options.schemaName,
      dryRun: options.dryRun,
      verbose: options.verbose,
    });
  }

  return executeMySQL(schema, {
    dryRun: options.dryRun,
    verbose: options.verbose,
  });
}
