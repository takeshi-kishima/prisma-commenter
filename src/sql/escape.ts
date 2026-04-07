import type { Provider } from "../parser/types.js";

/**
 * Escape a SQL identifier based on the database dialect.
 *
 * - PostgreSQL: wraps in double quotes, doubles any internal double quotes.
 * - MySQL: wraps in backticks, doubles any internal backticks.
 */
export function escapeIdentifier(value: string, provider: Provider): string {
  if (provider === "postgresql") {
    return `"${value.replace(/"/g, '""')}"`;
  }
  // mysql
  return `\`${value.replace(/`/g, "``")}\``;
}

/**
 * Escape a SQL string literal based on the database dialect.
 *
 * - PostgreSQL: wraps in single quotes, doubles internal single quotes.
 * - MySQL: wraps in single quotes, escapes backslashes and single quotes.
 */
export function escapeString(value: string, provider: Provider): string {
  if (provider === "postgresql") {
    return `'${value.replace(/'/g, "''")}'`;
  }
  // mysql: escape backslashes first, then single quotes
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}
