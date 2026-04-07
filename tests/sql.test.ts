import { describe, it, expect } from "vitest";
import { escapeIdentifier, escapeString } from "../src/sql/escape.js";
import { generatePostgresSQL } from "../src/sql/postgres.js";
import { generateMySQLSQL, type ColumnDefinitionMap } from "../src/sql/mysql.js";
import { generateSQL } from "../src/sql/index.js";
import type { ModelInfo, SchemaInfo } from "../src/parser/types.js";

// ---------------------------------------------------------------------------
// escape.ts
// ---------------------------------------------------------------------------
describe("escapeIdentifier", () => {
  it("wraps PostgreSQL identifiers in double quotes", () => {
    expect(escapeIdentifier("users", "postgresql")).toBe('"users"');
  });

  it("doubles internal double quotes for PostgreSQL", () => {
    expect(escapeIdentifier('my"table', "postgresql")).toBe('"my""table"');
  });

  it("wraps MySQL identifiers in backticks", () => {
    expect(escapeIdentifier("users", "mysql")).toBe("`users`");
  });

  it("doubles internal backticks for MySQL", () => {
    expect(escapeIdentifier("my`table", "mysql")).toBe("`my``table`");
  });
});

describe("escapeString", () => {
  it("wraps PostgreSQL strings in single quotes", () => {
    expect(escapeString("hello", "postgresql")).toBe("'hello'");
  });

  it("doubles internal single quotes for PostgreSQL", () => {
    expect(escapeString("it's a test", "postgresql")).toBe("'it''s a test'");
  });

  it("wraps MySQL strings in single quotes", () => {
    expect(escapeString("hello", "mysql")).toBe("'hello'");
  });

  it("escapes single quotes with backslash for MySQL", () => {
    expect(escapeString("it's a test", "mysql")).toBe("'it\\'s a test'");
  });

  it("escapes backslashes for MySQL", () => {
    expect(escapeString("path\\to\\file", "mysql")).toBe(
      "'path\\\\to\\\\file'",
    );
  });

  it("escapes both backslash and single quote for MySQL", () => {
    expect(escapeString("it's a \\path", "mysql")).toBe(
      "'it\\'s a \\\\path'",
    );
  });

  it("does not escape backslashes for PostgreSQL", () => {
    expect(escapeString("path\\to", "postgresql")).toBe("'path\\to'");
  });
});

// ---------------------------------------------------------------------------
// Helper fixtures
// ---------------------------------------------------------------------------
const sampleModels: ModelInfo[] = [
  {
    name: "User",
    dbName: "users",
    comment: "利用者",
    fields: [
      { name: "name", dbName: "name", comment: "氏名" },
      { name: "email", dbName: "email_address", comment: "メールアドレス" },
    ],
  },
  {
    name: "Post",
    dbName: "posts",
    comment: null, // no table comment
    fields: [{ name: "title", dbName: "title", comment: "タイトル" }],
  },
];

// ---------------------------------------------------------------------------
// postgres.ts
// ---------------------------------------------------------------------------
describe("generatePostgresSQL", () => {
  it("generates COMMENT ON TABLE and COMMENT ON COLUMN", () => {
    const stmts = generatePostgresSQL(sampleModels);
    expect(stmts).toEqual([
      `COMMENT ON TABLE "public"."users" IS '利用者';`,
      `COMMENT ON COLUMN "public"."users"."name" IS '氏名';`,
      `COMMENT ON COLUMN "public"."users"."email_address" IS 'メールアドレス';`,
      `COMMENT ON COLUMN "public"."posts"."title" IS 'タイトル';`,
    ]);
  });

  it("uses a custom schema name", () => {
    const stmts = generatePostgresSQL(
      [{ name: "Foo", dbName: "foo", comment: "Foo table", fields: [] }],
      "myschema",
    );
    expect(stmts).toEqual([
      `COMMENT ON TABLE "myschema"."foo" IS 'Foo table';`,
    ]);
  });

  it("skips table comment when null", () => {
    const stmts = generatePostgresSQL([
      {
        name: "Post",
        dbName: "posts",
        comment: null,
        fields: [{ name: "title", dbName: "title", comment: "タイトル" }],
      },
    ]);
    expect(stmts).toEqual([
      `COMMENT ON COLUMN "public"."posts"."title" IS 'タイトル';`,
    ]);
  });

  it("escapes single quotes in comments", () => {
    const stmts = generatePostgresSQL([
      {
        name: "T",
        dbName: "t",
        comment: "it's a table",
        fields: [],
      },
    ]);
    expect(stmts).toEqual([
      `COMMENT ON TABLE "public"."t" IS 'it''s a table';`,
    ]);
  });

  it("returns empty array for empty models", () => {
    expect(generatePostgresSQL([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// mysql.ts
// ---------------------------------------------------------------------------
describe("generateMySQLSQL", () => {
  const columnDefs: ColumnDefinitionMap = new Map([
    [
      "users.name",
      {
        columnType: "varchar(255)",
        isNullable: false,
        defaultValue: null,
        extra: null,
      },
    ],
    [
      "users.email_address",
      {
        columnType: "varchar(191)",
        isNullable: true,
        defaultValue: null,
        extra: null,
      },
    ],
    [
      "posts.title",
      {
        columnType: "varchar(255)",
        isNullable: false,
        defaultValue: "'untitled'",
        extra: null,
      },
    ],
  ]);

  it("generates ALTER TABLE COMMENT and MODIFY COLUMN COMMENT", () => {
    const stmts = generateMySQLSQL(sampleModels, columnDefs);
    expect(stmts).toEqual([
      "ALTER TABLE `users` COMMENT = '利用者';",
      "ALTER TABLE `users` MODIFY COLUMN `name` varchar(255) NOT NULL COMMENT '氏名';",
      "ALTER TABLE `users` MODIFY COLUMN `email_address` varchar(191) NULL COMMENT 'メールアドレス';",
      "ALTER TABLE `posts` MODIFY COLUMN `title` varchar(255) NOT NULL DEFAULT 'untitled' COMMENT 'タイトル';",
    ]);
  });

  it("skips column comments when columnDefs is not provided", () => {
    const stmts = generateMySQLSQL(sampleModels);
    // Only table comments should be generated
    expect(stmts).toEqual(["ALTER TABLE `users` COMMENT = '利用者';"]);
  });

  it("skips column comments for missing definitions", () => {
    const partial: ColumnDefinitionMap = new Map([
      [
        "users.name",
        {
          columnType: "varchar(255)",
          isNullable: false,
          defaultValue: null,
          extra: null,
        },
      ],
    ]);
    const stmts = generateMySQLSQL(sampleModels, partial);
    expect(stmts).toEqual([
      "ALTER TABLE `users` COMMENT = '利用者';",
      "ALTER TABLE `users` MODIFY COLUMN `name` varchar(255) NOT NULL COMMENT '氏名';",
    ]);
  });

  it("includes extra attributes like auto_increment", () => {
    const defs: ColumnDefinitionMap = new Map([
      [
        "t.id",
        {
          columnType: "bigint",
          isNullable: false,
          defaultValue: null,
          extra: "auto_increment",
        },
      ],
    ]);
    const stmts = generateMySQLSQL(
      [
        {
          name: "T",
          dbName: "t",
          comment: null,
          fields: [{ name: "id", dbName: "id", comment: "ID" }],
        },
      ],
      defs,
    );
    expect(stmts).toEqual([
      "ALTER TABLE `t` MODIFY COLUMN `id` bigint NOT NULL auto_increment COMMENT 'ID';",
    ]);
  });

  it("escapes single quotes and backslashes in MySQL comments", () => {
    const defs: ColumnDefinitionMap = new Map([
      [
        "t.c",
        {
          columnType: "text",
          isNullable: true,
          defaultValue: null,
          extra: null,
        },
      ],
    ]);
    const stmts = generateMySQLSQL(
      [
        {
          name: "T",
          dbName: "t",
          comment: "it's a \\test",
          fields: [
            { name: "c", dbName: "c", comment: "col's \\value" },
          ],
        },
      ],
      defs,
    );
    expect(stmts).toEqual([
      "ALTER TABLE `t` COMMENT = 'it\\'s a \\\\test';",
      "ALTER TABLE `t` MODIFY COLUMN `c` text NULL COMMENT 'col\\'s \\\\value';",
    ]);
  });

  it("returns empty array for empty models", () => {
    expect(generateMySQLSQL([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// index.ts — generateSQL()
// ---------------------------------------------------------------------------
describe("generateSQL", () => {
  it("delegates to PostgreSQL generator", () => {
    const schema: SchemaInfo = {
      connection: { provider: "postgresql", url: "postgresql://localhost/test" },
      models: [
        {
          name: "User",
          dbName: "users",
          comment: "利用者",
          fields: [],
        },
      ],
    };
    const stmts = generateSQL(schema, { schemaName: "app" });
    expect(stmts).toEqual([
      `COMMENT ON TABLE "app"."users" IS '利用者';`,
    ]);
  });

  it("delegates to MySQL generator", () => {
    const schema: SchemaInfo = {
      connection: { provider: "mysql", url: "mysql://localhost/test" },
      models: [
        {
          name: "User",
          dbName: "users",
          comment: "利用者",
          fields: [],
        },
      ],
    };
    const stmts = generateSQL(schema);
    expect(stmts).toEqual(["ALTER TABLE `users` COMMENT = '利用者';"]);
  });

  it("passes columnDefs to MySQL generator", () => {
    const columnDefs: ColumnDefinitionMap = new Map([
      [
        "users.name",
        {
          columnType: "varchar(100)",
          isNullable: false,
          defaultValue: null,
          extra: null,
        },
      ],
    ]);
    const schema: SchemaInfo = {
      connection: { provider: "mysql", url: "mysql://localhost/test" },
      models: [
        {
          name: "User",
          dbName: "users",
          comment: null,
          fields: [{ name: "name", dbName: "name", comment: "氏名" }],
        },
      ],
    };
    const stmts = generateSQL(schema, { columnDefs });
    expect(stmts).toEqual([
      "ALTER TABLE `users` MODIFY COLUMN `name` varchar(100) NOT NULL COMMENT '氏名';",
    ]);
  });

  it("uses default public schema for PostgreSQL when not specified", () => {
    const schema: SchemaInfo = {
      connection: { provider: "postgresql", url: "postgresql://localhost/test" },
      models: [
        { name: "T", dbName: "t", comment: "test", fields: [] },
      ],
    };
    const stmts = generateSQL(schema);
    expect(stmts).toEqual([`COMMENT ON TABLE "public"."t" IS 'test';`]);
  });
});
