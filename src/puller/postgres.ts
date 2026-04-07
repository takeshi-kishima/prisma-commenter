import pg from "pg";
import type { DbComments } from "./types.js";

/**
 * Fetch table and column comments from a PostgreSQL database.
 *
 * @param url - PostgreSQL connection URL.
 * @param schemaName - PostgreSQL schema name (default: "public").
 * @returns Comments found in the database.
 */
export async function pullPostgres(
  url: string,
  schemaName: string = "public",
): Promise<DbComments> {
  const client = new pg.Client(url);
  try {
    await client.connect();

    // Fetch table comments
    const tableResult = await client.query<{
      table_name: string;
      comment: string;
    }>(
      `SELECT c.relname AS table_name, obj_description(c.oid) AS comment
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND c.relkind IN ('r', 'v') AND obj_description(c.oid) IS NOT NULL`,
      [schemaName],
    );

    const tables = new Map<string, string>();
    for (const row of tableResult.rows) {
      tables.set(row.table_name, row.comment);
    }

    // Fetch column comments
    const columnResult = await client.query<{
      table_name: string;
      column_name: string;
      comment: string;
    }>(
      `SELECT c.relname AS table_name, a.attname AS column_name, col_description(c.oid, a.attnum) AS comment
       FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND a.attnum > 0 AND NOT a.attisdropped AND col_description(c.oid, a.attnum) IS NOT NULL`,
      [schemaName],
    );

    const columns = new Map<string, string>();
    for (const row of columnResult.rows) {
      columns.set(`${row.table_name}.${row.column_name}`, row.comment);
    }

    return { tables, columns };
  } finally {
    await client.end();
  }
}
