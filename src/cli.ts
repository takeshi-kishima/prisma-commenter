import { Command } from "commander";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseSchema } from "./parser/index.js";
import { execute } from "./executor/index.js";
import { pullComments } from "./puller/index.js";
import { applyComments } from "./puller/writer.js";
import { extractConnection } from "./parser/connection.js";
import { getSchema } from "@mrleebo/prisma-ast";

/**
 * Create and configure the CLI program with subcommands.
 * Separated from execution for testability.
 */
export function createProgram(): Command {
  const program = new Command();

  program
    .name("prisma-commenter")
    .description(
      "Sync Prisma schema /// doc comments to/from database COMMENT statements",
    )
    .version("0.1.0");

  // --- push subcommand ---
  program
    .command("push")
    .description("Push /// comments from schema.prisma to database")
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
    )
    .action(async (opts) => {
      await runPush(opts);
    });

  // --- pull subcommand ---
  program
    .command("pull")
    .description("Pull comments from database into schema.prisma")
    .option(
      "--schema <path>",
      "Path to schema.prisma",
      "./prisma/schema.prisma",
    )
    .option("--dry-run", "Preview changes without writing to file", false)
    .option("--verbose", "Print detailed information", false)
    .option(
      "--schema-name <name>",
      "PostgreSQL schema name",
      "public",
    )
    .action(async (opts) => {
      await runPull(opts);
    });

  return program;
}

interface PushOptions {
  schema: string;
  dryRun: boolean;
  verbose: boolean;
  schemaName: string;
}

interface PullOptions {
  schema: string;
  dryRun: boolean;
  verbose: boolean;
  schemaName: string;
}

/**
 * Execute the push command (schema -> DB).
 */
async function runPush(opts: PushOptions): Promise<void> {
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

/**
 * Execute the pull command (DB -> schema).
 */
async function runPull(opts: PullOptions): Promise<void> {
  const schemaPath = resolve(opts.schema);
  let source: string;
  try {
    source = readFileSync(schemaPath, "utf-8");
  } catch {
    console.error(`Error: Cannot read schema file: ${schemaPath}`);
    process.exitCode = 1;
    return;
  }

  // Parse connection info from schema
  let connectionInfo;
  try {
    const ast = getSchema(source);
    connectionInfo = extractConnection(ast);
  } catch (error) {
    console.error(
      `Error: Failed to parse schema: ${error instanceof Error ? error.message : error}`,
    );
    process.exitCode = 1;
    return;
  }

  try {
    if (opts.verbose) {
      console.log(`Connecting to ${connectionInfo.provider} database...`);
    }

    const comments = await pullComments(
      connectionInfo.provider,
      connectionInfo.url,
      { schemaName: opts.schemaName },
    );

    if (opts.verbose) {
      console.log(
        `Found ${comments.tables.size} table comment(s) and ${comments.columns.size} column comment(s).`,
      );
    }

    const updated = applyComments(source, comments);

    if (source === updated) {
      console.log("No changes to apply.");
      return;
    }

    if (opts.dryRun) {
      console.log("--- Preview of changes ---");
      console.log(updated);
      console.log("--- End of preview ---");
      console.log("(dry-run: file was not modified)");
    } else {
      writeFileSync(schemaPath, updated, "utf-8");
      console.log(`Updated ${schemaPath}`);
    }
  } catch (error) {
    console.error(
      `Error: ${error instanceof Error ? error.message : error}`,
    );
    process.exitCode = 1;
  }
}

/**
 * Run the CLI with the given argv.
 *
 * @param argv - Process arguments (e.g. process.argv).
 */
export async function run(argv: string[]): Promise<void> {
  const program = createProgram();
  await program.parseAsync(argv);
}
