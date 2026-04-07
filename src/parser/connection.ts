import type { Schema, Datasource, Assignment, Func } from "@mrleebo/prisma-ast";
import type { ConnectionInfo, Provider } from "./types.js";
import { unquote } from "../utils.js";

const SUPPORTED_PROVIDERS: ReadonlySet<string> = new Set([
  "postgresql",
  "postgres",
  "mysql",
]);

/**
 * Normalize provider string to our canonical Provider type.
 */
function normalizeProvider(raw: string): Provider {
  const lower = raw.toLowerCase();
  if (lower === "postgresql" || lower === "postgres") return "postgresql";
  if (lower === "mysql") return "mysql";
  throw new Error(
    `Unsupported provider "${raw}". Supported: postgresql, mysql.`
  );
}

/**
 * Resolve a prisma-ast Value to a plain string.
 * Handles both literal strings and `env("VAR")` function calls.
 */
function resolveValue(value: unknown): string {
  if (typeof value === "string") {
    return unquote(value);
  }

  // env("DATABASE_URL") -> { type: "function", name: "env", params: ['"DATABASE_URL"'] }
  if (
    typeof value === "object" &&
    value !== null &&
    (value as Func).type === "function" &&
    (value as Func).name === "env"
  ) {
    const func = value as Func;
    const params = func.params ?? [];
    if (params.length !== 1 || typeof params[0] !== "string") {
      throw new Error("env() must have exactly one string argument.");
    }
    const envVarName = unquote(params[0] as string);
    const envValue = process.env[envVarName];
    if (envValue === undefined || envValue === "") {
      throw new Error(
        `Environment variable "${envVarName}" is not set.`
      );
    }
    return envValue;
  }

  throw new Error(`Cannot resolve datasource value: ${JSON.stringify(value)}`);
}

/**
 * Extract connection info (provider + url) from a parsed prisma-ast schema.
 */
export function extractConnection(schema: Schema): ConnectionInfo {
  const datasource = schema.list.find(
    (block): block is Datasource => block.type === "datasource"
  );

  if (!datasource) {
    throw new Error("No datasource block found in schema.");
  }

  const assignments = datasource.assignments.filter(
    (a): a is Assignment => a.type === "assignment"
  );

  const providerAssignment = assignments.find((a) => a.key === "provider");
  const urlAssignment = assignments.find((a) => a.key === "url");

  if (!providerAssignment) {
    throw new Error("datasource block is missing 'provider'.");
  }
  if (!urlAssignment) {
    throw new Error("datasource block is missing 'url'.");
  }

  const providerRaw = resolveValue(providerAssignment.value);
  const provider = normalizeProvider(providerRaw);
  const url = resolveValue(urlAssignment.value);

  return { provider, url };
}
