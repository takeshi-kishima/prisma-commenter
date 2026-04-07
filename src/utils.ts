/**
 * Strip surrounding double-quotes from a prisma-ast string value.
 * prisma-ast returns string literals as `"value"` (with quotes included).
 */
export function unquote(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  return value;
}
