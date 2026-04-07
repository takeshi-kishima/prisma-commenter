import type { ModelInfo } from "../parser/types.js";
import { escapeIdentifier, escapeString } from "./escape.js";

const PROVIDER = "mysql" as const;

/**
 * Column definition information retrieved from INFORMATION_SCHEMA.COLUMNS.
 * This is needed because MySQL's ALTER TABLE MODIFY COLUMN requires the
 * full column definition to be repeated.
 */
export interface ColumnDefinition {
  /** The full column type string, e.g. "varchar(255)", "int", "bigint unsigned". */
  columnType: string;
  /** Whether the column allows NULL. */
  isNullable: boolean;
  /** The default value expression (already formatted for SQL), or null. */
  defaultValue: string | null;
  /** Extra attributes like "auto_increment" or "on update CURRENT_TIMESTAMP". */
  extra: string | null;
}

/**
 * A map from "tableName.columnName" to its definition.
 * Keys use the database names (after @@map / @map resolution).
 */
export type ColumnDefinitionMap = Map<string, ColumnDefinition>;

/**
 * Generate MySQL ALTER TABLE COMMENT / MODIFY COLUMN COMMENT statements.
 *
 * @param models - Models extracted from the Prisma schema.
 * @param columnDefs - Column definitions retrieved from INFORMATION_SCHEMA.
 *   Required for column comments. If a column's definition is missing, that
 *   column comment is skipped (the executor is responsible for populating this).
 * @returns An array of SQL statements.
 */
export function generateMySQLSQL(
  models: ModelInfo[],
  columnDefs: ColumnDefinitionMap = new Map(),
): string[] {
  const statements: string[] = [];

  for (const model of models) {
    const table = escapeIdentifier(model.dbName, PROVIDER);

    if (model.comment !== null) {
      statements.push(
        `ALTER TABLE ${table} COMMENT = ${escapeString(model.comment, PROVIDER)};`,
      );
    }

    for (const field of model.fields) {
      const key = `${model.dbName}.${field.dbName}`;
      const def = columnDefs.get(key);
      if (!def) {
        // Cannot generate column comment without definition info — skip.
        continue;
      }

      const column = escapeIdentifier(field.dbName, PROVIDER);
      const parts: string[] = [
        `ALTER TABLE ${table} MODIFY COLUMN ${column}`,
        def.columnType,
      ];

      if (def.isNullable) {
        parts.push("NULL");
      } else {
        parts.push("NOT NULL");
      }

      if (def.defaultValue !== null) {
        parts.push(`DEFAULT ${def.defaultValue}`);
      }

      if (def.extra) {
        parts.push(def.extra);
      }

      parts.push(`COMMENT ${escapeString(field.comment, PROVIDER)}`);

      statements.push(parts.join(" ") + ";");
    }
  }

  return statements;
}
