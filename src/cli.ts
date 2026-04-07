import { Command } from "commander";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseSchema } from "./parser/index.js";
import { execute } from "./executor/index.js";

/**
 * Create and configure the CLI command.
 * Separated from execution for testability.
 */
export function createProgram(): Command {
  const program = new Command();

  program
    .name("prisma-commenter")
    .description(
      "Sync Prisma schema /// doc comments to database COMMENT statements",
    )
    .version("0.1.0")
    .option(
      "--schema <path>",
      "Path to schema.prisma",
      "./prisma/schema.prisma",
    )
    .option("--dry-run", "Output SQL without executing", false)
    .option("--verbose", "Print each SQL statement during execution", false)
    .option(
      "--schema-name <name>",
      "PostgreSQL schema name",
      "public",
    );

  return program;
}

/**
 * Run the CLI with the given argv.
 *
 * @param argv - Process arguments (e.g. process.argv).
 */
export async function run(argv: string[]): Promise<void> {
  const program = createProgram();
  program.parse(argv);

  const opts = program.opts<{
    schema: string;
    dryRun: boolean;
    verbose: boolean;
    schemaName: string;
  }>();

  // Read and parse schema file
  const schemaPath = resolve(opts.schema);
  let source: string;
  try {
    source = readFileSync(schemaPath, "utf-8");
  } catch {
    console.error(`Error: Cannot read schema file: ${schemaPath}`);
    process.exitCode = 1;
    return;
  }

  let schema;
  try {
    schema = parseSchema(source);
  } catch (error) {
    console.error(
      `Error: Failed to parse schema: ${error instanceof Error ? error.message : error}`,
    );
    process.exitCode = 1;
    return;
  }

  // Execute or dry-run
  try {
    const statements = await execute(schema, {
      schemaName: opts.schemaName,
      dryRun: opts.dryRun,
      verbose: opts.verbose,
    });

    if (opts.dryRun) {
      for (const sql of statements) {
        console.log(sql);
      }
      console.log(`\n-- ${statements.length} statement(s) generated.`);
    } else {
      console.log(
        `Successfully applied ${statements.length} comment statement(s).`,
      );
    }
  } catch (error) {
    console.error(
      `Error: ${error instanceof Error ? error.message : error}`,
    );
    process.exitCode = 1;
  }
}
