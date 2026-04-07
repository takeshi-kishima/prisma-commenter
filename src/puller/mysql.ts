import mysql from "mysql2/promise";
import type { DbComments } from "./types.js";

/**
 * Fetch table and column comments from a MySQL database.
 *
 * @param url - MySQL connection URL.
 * @returns Comments found in the database.
 */
export async function pullMySQL(url: string): Promise<DbComments> {
  const connection = await mysql.createConnection(url);
  try {
    // Fetch table comments
    const [tableRows] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT TABLE_NAME, TABLE_COMMENT FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_COMMENT != ''`,
    );

    const tables = new Map<string, string>();
    for (const row of tableRows) {
      tables.set(row.TABLE_NAME as string, row.TABLE_COMMENT as string);
    }

    // Fetch column comments
    const [columnRows] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_COMMENT FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_COMMENT != ''`,
    );

    const columns = new Map<string, string>();
    for (const row of columnRows) {
      columns.set(
        `${row.TABLE_NAME}.${row.COLUMN_NAME}`,
        row.COLUMN_COMMENT as string,
      );
    }

    return { tables, columns };
  } finally {
    await connection.end();
  }
}
