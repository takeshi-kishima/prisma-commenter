import type { Provider } from "../parser/types.js";
import type { DbComments } from "./types.js";
import { pullPostgres } from "./postgres.js";
import { pullMySQL } from "./mysql.js";

export type { DbComments } from "./types.js";
export type { TableCommentMap, ColumnCommentMap } from "./types.js";

export interface PullOptions {
  /** PostgreSQL schema name (default: "public"). Ignored for MySQL. */
  schemaName?: string;
}

/**
 * Fetch comments from the database, dispatching to the appropriate provider.
 *
 * @param provider - Database provider.
 * @param url - Database connection URL.
 * @param options - Pull options.
 * @returns Comments found in the database.
 */
export async function pullComments(
  provider: Provider,
  url: string,
  options: PullOptions = {},
): Promise<DbComments> {
  if (provider === "postgresql") {
    return pullPostgres(url, options.schemaName ?? "public");
  }
  return pullMySQL(url);
}
