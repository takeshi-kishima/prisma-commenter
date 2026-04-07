import pg from "pg";
import type { SchemaInfo } from "../parser/types.js";
import { generatePostgresSQL } from "../sql/postgres.js";

export interface PostgresExecutorOptions {
  /** PostgreSQL schema name (default: "public"). */
  schemaName?: string;
  /** If true, only return SQL without executing. */
  dryRun?: boolean;
  /** If true, print each SQL statement before executing. */
  verbose?: boolean;
}

/**
 * Execute PostgreSQL COMMENT ON statements inside a transaction.
 *
 * @param schema - Parsed schema information.
 * @param options - Execution options.
 * @returns The generated SQL statements.
 */
export async function executePostgres(
  schema: SchemaInfo,
  options: PostgresExecutorOptions = {},
): Promise<string[]> {
  const schemaName = options.schemaName ?? "public";
  const statements = generatePostgresSQL(schema.models, schemaName);

  if (options.dryRun) {
    return statements;
  }

  const client = new pg.Client(schema.connection.url);
  try {
    await client.connect();
    await client.query("BEGIN");

    for (const sql of statements) {
      if (options.verbose) {
        console.log(sql);
      }
      await client.query(sql);
    }

    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Ignore rollback errors
    }
    throw error;
  } finally {
    await client.end();
  }

  return statements;
}
