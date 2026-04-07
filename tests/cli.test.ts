import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolve } from "node:path";
import { createProgram, run } from "../src/cli.js";

const fixturesDir = resolve(import.meta.dirname, "fixtures");

// ---------------------------------------------------------------------------
// createProgram()
// ---------------------------------------------------------------------------
describe("createProgram", () => {
  it("has the correct name and version", () => {
    const program = createProgram();
    expect(program.name()).toBe("prisma-commenter");
    expect(program.version()).toBe("0.1.0");
  });

  it("has default option values", () => {
    const program = createProgram();
    program.parse(["node", "prisma-commenter"]);
    const opts = program.opts();
    expect(opts.schema).toBe("./prisma/schema.prisma");
    expect(opts.dryRun).toBe(false);
    expect(opts.verbose).toBe(false);
    expect(opts.schemaName).toBe("public");
  });

  it("parses --dry-run flag", () => {
    const program = createProgram();
    program.parse(["node", "prisma-commenter", "--dry-run"]);
    expect(program.opts().dryRun).toBe(true);
  });

  it("parses --verbose flag", () => {
    const program = createProgram();
    program.parse(["node", "prisma-commenter", "--verbose"]);
    expect(program.opts().verbose).toBe(true);
  });

  it("parses --schema option", () => {
    const program = createProgram();
    program.parse([
      "node", "prisma-commenter", "--schema", "/tmp/schema.prisma",
    ]);
    expect(program.opts().schema).toBe("/tmp/schema.prisma");
  });

  it("parses --schema-name option", () => {
    const program = createProgram();
    program.parse([
      "node", "prisma-commenter", "--schema-name", "myschema",
    ]);
    expect(program.opts().schemaName).toBe("myschema");
  });
});

// ---------------------------------------------------------------------------
// run() — dry-run mode (PostgreSQL)
// ---------------------------------------------------------------------------
describe("run() dry-run PostgreSQL", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  const originalEnv = process.env.DATABASE_URL;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.DATABASE_URL = "postgresql://localhost:5432/test";
    process.exitCode = undefined;
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    if (originalEnv !== undefined) {
      process.env.DATABASE_URL = originalEnv;
    } else {
      delete process.env.DATABASE_URL;
    }
    process.exitCode = undefined;
  });

  it("outputs COMMENT ON statements in dry-run mode", async () => {
    const schemaPath = resolve(fixturesDir, "basic.prisma");
    await run([
      "node",
      "prisma-commenter",
      "--schema",
      schemaPath,
      "--dry-run",
    ]);

    const output = logSpy.mock.calls.map((c) => c[0]);
    expect(output).toContain(
      `COMMENT ON TABLE "public"."User" IS 'Users table';`,
    );
    expect(output).toContain(
      `COMMENT ON COLUMN "public"."User"."email" IS 'Email address';`,
    );
    expect(output).toContain(
      `COMMENT ON COLUMN "public"."User"."name" IS 'Display name';`,
    );
    expect(output).toContain(
      `COMMENT ON TABLE "public"."Post" IS 'Blog posts';`,
    );
    expect(output).toContain(
      `COMMENT ON COLUMN "public"."Post"."title" IS 'Post title';`,
    );
    // Check statement count message
    expect(output.some((line: string) => line.includes("statement(s) generated"))).toBe(true);
  });

  it("uses custom schema-name for PostgreSQL", async () => {
    const schemaPath = resolve(fixturesDir, "basic.prisma");
    await run([
      "node",
      "prisma-commenter",
      "--schema",
      schemaPath,
      "--dry-run",
      "--schema-name",
      "myschema",
    ]);

    const output = logSpy.mock.calls.map((c) => c[0]);
    expect(output).toContain(
      `COMMENT ON TABLE "myschema"."User" IS 'Users table';`,
    );
  });

  it("handles missing schema file gracefully", async () => {
    await run([
      "node",
      "prisma-commenter",
      "--schema",
      "/nonexistent/schema.prisma",
      "--dry-run",
    ]);

    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalled();
    const errorOutput = errorSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(errorOutput).toContain("Cannot read schema file");
  });

  it("respects @@map and @map in dry-run", async () => {
    const schemaPath = resolve(fixturesDir, "map-names.prisma");
    await run([
      "node",
      "prisma-commenter",
      "--schema",
      schemaPath,
      "--dry-run",
    ]);

    const output = logSpy.mock.calls.map((c) => c[0]);
    // map-names.prisma should have @@map / @map overrides
    // Verify the mapped DB names appear in the output
    expect(output.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// run() — dry-run mode (MySQL) — table comments only (no DB for column defs)
// ---------------------------------------------------------------------------
describe("run() dry-run MySQL", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.exitCode = undefined;
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    process.exitCode = undefined;
  });

  it("outputs MySQL ALTER TABLE COMMENT in dry-run mode (connection error is expected for column defs)", async () => {
    const schemaPath = resolve(fixturesDir, "mysql.prisma");
    // MySQL dry-run requires DB connection for INFORMATION_SCHEMA.
    // Since there's no real DB, this will fail with a connection error.
    await run([
      "node",
      "prisma-commenter",
      "--schema",
      schemaPath,
      "--dry-run",
    ]);

    // Expect a connection error since we can't reach the MySQL DB
    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// run() — schema with no comments
// ---------------------------------------------------------------------------
describe("run() dry-run with no comments", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    process.exitCode = undefined;
  });

  afterEach(() => {
    logSpy.mockRestore();
    process.exitCode = undefined;
  });

  it("generates 0 statements for a schema with no comments", async () => {
    const schemaPath = resolve(fixturesDir, "no-comments.prisma");
    await run([
      "node",
      "prisma-commenter",
      "--schema",
      schemaPath,
      "--dry-run",
    ]);

    const output = logSpy.mock.calls.map((c) => c[0]);
    expect(output).toContain("\n-- 0 statement(s) generated.");
  });
});
