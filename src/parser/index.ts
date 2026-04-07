import { getSchema } from "@mrleebo/prisma-ast";
import { extractConnection } from "./connection.js";
import { extractModels } from "./adapter.js";
import type { SchemaInfo } from "./types.js";

export type { SchemaInfo, ModelInfo, FieldInfo, ConnectionInfo, Provider } from "./types.js";

/**
 * Parse a Prisma schema string and extract all information needed for
 * SQL comment generation.
 *
 * @param source - The contents of a schema.prisma file.
 * @returns Parsed schema information including connection details and models.
 * @throws If the schema cannot be parsed, or datasource is missing/invalid.
 */
export function parseSchema(source: string): SchemaInfo {
  const ast = getSchema(source);
  const connection = extractConnection(ast);
  const models = extractModels(ast);

  return { connection, models };
}
