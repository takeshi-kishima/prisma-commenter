import type { ModelInfo } from "../parser/types.js";
import { escapeIdentifier, escapeString } from "./escape.js";

const PROVIDER = "postgresql" as const;

/**
 * Generate PostgreSQL COMMENT ON statements for the given models.
 *
 * @param models - Models extracted from the Prisma schema.
 * @param schemaName - PostgreSQL schema name (default: "public").
 * @returns An array of SQL statements.
 */
export function generatePostgresSQL(
  models: ModelInfo[],
  schemaName: string = "public",
): string[] {
  const statements: string[] = [];
  const schema = escapeIdentifier(schemaName, PROVIDER);

  for (const model of models) {
    const table = escapeIdentifier(model.dbName, PROVIDER);

    if (model.comment !== null) {
      statements.push(
        `COMMENT ON TABLE ${schema}.${table} IS ${escapeString(model.comment, PROVIDER)};`,
      );
    }

    for (const field of model.fields) {
      const column = escapeIdentifier(field.dbName, PROVIDER);
      statements.push(
        `COMMENT ON COLUMN ${schema}.${table}.${column} IS ${escapeString(field.comment, PROVIDER)};`,
      );
    }
  }

  return statements;
}
