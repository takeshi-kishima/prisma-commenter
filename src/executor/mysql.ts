import mysql from "mysql2/promise";
import type { SchemaInfo } from "../parser/types.js";
import { generateMySQLSQL } from "../sql/mysql.js";
import type { ColumnDefinition, ColumnDefinitionMap } from "../sql/mysql.js";

export interface MySQLExecutorOptions {
  /** If true, only return SQL without executing. */
  dryRun?: boolean;
  /** If true, print each SQL statement before executing. */
  verbose?: boolean;
}

/**
 * Query INFORMATION_SCHEMA.COLUMNS and build a ColumnDefinitionMap
 * for all tables/columns referenced in the schema.
 */
async function fetchColumnDefinitions(
  connection: mysql.Connection,
  schema: SchemaInfo,
): Promise<ColumnDefinitionMap> {
  const columnDefs: ColumnDefinitionMap = new Map();

  // Collect all table names we need definitions for
  const tableNames = schema.models.map((m) => m.dbName);
  if (tableNames.length === 0) {
    return columnDefs;
  }

  // Get the database name from the connection
  const [dbRows] = await connection.query("SELECT DATABASE() AS db");
  const dbName = (dbRows as Array<{ db: string }>)[0].db;

  const placeholders = tableNames.map(() => "?").join(", ");
  const query = `
    SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (${placeholders})
  `;

  const [rows] = await connection.query(query, [dbName, ...tableNames]);

  for (const row of rows as Array<{
    TABLE_NAME: string;
    COLUMN_NAME: string;
    COLUMN_TYPE: string;
    IS_NULLABLE: string;
    COLUMN_DEFAULT: string | null;
    EXTRA: string;
  }>) {
    const key = `${row.TABLE_NAME}.${row.COLUMN_NAME}`;
    // Filter out DEFAULT_GENERATED from EXTRA — it's informational only
    // and causes syntax errors if included in MODIFY COLUMN.
    // Keep meaningful extras like "auto_increment" and "on update CURRENT_TIMESTAMP".
    const extra = (row.EXTRA || "")
      .replace(/DEFAULT_GENERATED\s*/gi, "")
      .trim() || null;

    const def: ColumnDefinition = {
      columnType: row.COLUMN_TYPE,
      isNullable: row.IS_NULLABLE === "YES",
      defaultValue: row.COLUMN_DEFAULT !== null ? formatDefault(row.COLUMN_DEFAULT, row.COLUMN_TYPE) : null,
      extra,
    };
    columnDefs.set(key, def);
  }

  return columnDefs;
}

/**
 * Format a default value for use in a MODIFY COLUMN statement.
 * String defaults need quoting; numeric/expression defaults do not.
 */
function formatDefault(value: string, columnType: string): string {
  // If it looks like an expression (e.g. CURRENT_TIMESTAMP, CURRENT_TIMESTAMP(3)), use as-is
  if (/^[A-Z_()0-9]+$/i.test(value)) {
    return value;
  }

  // Numeric types: use value as-is
  if (/^(tiny|small|medium|big)?int|decimal|float|double|numeric/i.test(columnType)) {
    return value;
  }

  // String/other types: quote the value
  return `'${value.replace(/'/g, "\\'")}'`;
}

/**
 * Execute MySQL ALTER TABLE COMMENT / MODIFY COLUMN COMMENT statements.
 * MySQL DDL is not transactional, so statements are executed individually.
 *
 * Note: Even in dry-run mode, a DB connection is required to fetch
 * column definitions from INFORMATION_SCHEMA.
 *
 * @param schema - Parsed schema information.
 * @param options - Execution options.
 * @returns The generated SQL statements.
 */
export async function executeMySQL(
  schema: SchemaInfo,
  options: MySQLExecutorOptions = {},
): Promise<string[]> {
  // In dry-run mode, try to connect for full output (including column comments),
  // but fall back to table-only comments if connection fails.
  if (options.dryRun) {
    let columnDefs: ColumnDefinitionMap = new Map();
    try {
      const connection = await mysql.createConnection(schema.connection.url);
      try {
        columnDefs = await fetchColumnDefinitions(connection, schema);
      } finally {
        await connection.end();
      }
    } catch {
      console.warn("Warning: Could not connect to database. Column comments will be skipped in dry-run output.");
    }
    return generateMySQLSQL(schema.models, columnDefs);
  }

  const connection = await mysql.createConnection(schema.connection.url);

  try {
    const columnDefs = await fetchColumnDefinitions(connection, schema);
    const statements = generateMySQLSQL(schema.models, columnDefs);

    for (const sql of statements) {
      if (options.verbose) {
        console.log(sql);
      }
      await connection.query(sql);
    }

    return statements;
  } finally {
    await connection.end();
  }
}
