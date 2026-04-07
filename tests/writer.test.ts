import { describe, it, expect } from "vitest";
import { applyComments } from "../src/puller/writer.js";
import type { DbComments } from "../src/puller/types.js";

function makeComments(
  tables: Record<string, string> = {},
  columns: Record<string, string> = {},
): DbComments {
  return {
    tables: new Map(Object.entries(tables)),
    columns: new Map(Object.entries(columns)),
  };
}

const basicSchema = `datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
  posts     Post[]
}

model Post {
  id        Int      @id @default(autoincrement())
  title     String
  content   String?
  authorId  Int
  author    User     @relation(fields: [authorId], references: [id])
}
`;

describe("applyComments", () => {
  it("inserts new table comments before model declarations", () => {
    const comments = makeComments(
      { User: "Users table", Post: "Blog posts" },
    );
    const result = applyComments(basicSchema, comments);

    expect(result).toContain("/// Users table\nmodel User {");
    expect(result).toContain("/// Blog posts\nmodel Post {");
  });

  it("inserts new column comments before field lines", () => {
    const comments = makeComments(
      {},
      { "User.email": "Email address", "Post.title": "Post title" },
    );
    const result = applyComments(basicSchema, comments);

    expect(result).toContain("  /// Email address\n  email     String   @unique");
    expect(result).toContain("  /// Post title\n  title     String");
  });

  it("inserts both table and column comments", () => {
    const comments = makeComments(
      { User: "Users table" },
      { "User.email": "Email address", "User.name": "Display name" },
    );
    const result = applyComments(basicSchema, comments);

    expect(result).toContain("/// Users table\nmodel User {");
    expect(result).toContain("  /// Email address\n  email");
    expect(result).toContain("  /// Display name\n  name");
  });

  it("replaces existing /// comments on models", () => {
    const schema = `datasource db {
  provider = "postgresql"
  url      = "postgresql://localhost/test"
}

/// Old comment
model User {
  id Int @id
}
`;
    const comments = makeComments({ User: "New comment" });
    const result = applyComments(schema, comments);

    expect(result).toContain("/// New comment\nmodel User {");
    expect(result).not.toContain("Old comment");
  });

  it("replaces existing /// comments on fields", () => {
    const schema = `datasource db {
  provider = "postgresql"
  url      = "postgresql://localhost/test"
}

model User {
  /// Old field comment
  id    Int    @id
  /// Old email comment
  email String @unique
}
`;
    const comments = makeComments(
      {},
      { "User.id": "New ID comment", "User.email": "New email comment" },
    );
    const result = applyComments(schema, comments);

    expect(result).toContain("  /// New ID comment\n  id    Int    @id");
    expect(result).toContain("  /// New email comment\n  email String @unique");
    expect(result).not.toContain("Old field comment");
    expect(result).not.toContain("Old email comment");
  });

  it("replaces multi-line /// comments", () => {
    const schema = `datasource db {
  provider = "postgresql"
  url      = "postgresql://localhost/test"
}

/// Line one
/// Line two
model User {
  id Int @id
}
`;
    const comments = makeComments({ User: "Single line" });
    const result = applyComments(schema, comments);

    expect(result).toContain("/// Single line\nmodel User {");
    expect(result).not.toContain("Line one");
    expect(result).not.toContain("Line two");
  });

  it("handles @map for column name mapping", () => {
    const schema = `datasource db {
  provider = "postgresql"
  url      = "postgresql://localhost/test"
}

model User {
  id       Int    @id
  fullName String @map("full_name")
}
`;
    const comments = makeComments(
      {},
      { "User.full_name": "Full name of user" },
    );
    const result = applyComments(schema, comments);

    expect(result).toContain("  /// Full name of user\n  fullName String @map(\"full_name\")");
  });

  it("handles @@map for table name mapping", () => {
    const schema = `datasource db {
  provider = "postgresql"
  url      = "postgresql://localhost/test"
}

model User {
  id    Int    @id
  email String

  @@map("app_users")
}
`;
    const comments = makeComments(
      { app_users: "Application users" },
      { "app_users.email": "User email" },
    );
    const result = applyComments(schema, comments);

    expect(result).toContain("/// Application users\nmodel User {");
    expect(result).toContain("  /// User email\n  email String");
  });

  it("skips relation fields", () => {
    const comments = makeComments(
      {},
      { "User.posts": "Should not appear" },
    );
    const result = applyComments(basicSchema, comments);

    // Relation field "posts" should not get a comment
    expect(result).not.toContain("/// Should not appear");
  });

  it("does not modify // regular comments", () => {
    const schema = `datasource db {
  provider = "postgresql"
  url      = "postgresql://localhost/test"
}

// This is a regular comment
model User {
  // Regular field comment
  id    Int    @id
  email String
}
`;
    const comments = makeComments(
      { User: "Users" },
      { "User.email": "Email" },
    );
    const result = applyComments(schema, comments);

    expect(result).toContain("// This is a regular comment");
    expect(result).toContain("// Regular field comment");
    expect(result).toContain("/// Users\nmodel User {");
    expect(result).toContain("  /// Email\n  email String");
  });

  it("returns unchanged source when no comments match", () => {
    const comments = makeComments(
      { NonExistent: "Comment" },
      { "NonExistent.col": "Column comment" },
    );
    const result = applyComments(basicSchema, comments);

    expect(result).toBe(basicSchema);
  });

  it("returns unchanged source when comments map is empty", () => {
    const comments = makeComments();
    const result = applyComments(basicSchema, comments);

    expect(result).toBe(basicSchema);
  });

  it("handles view blocks like model blocks", () => {
    const schema = `datasource db {
  provider = "postgresql"
  url      = "postgresql://localhost/test"
}

view UserSummary {
  id        Int    @unique
  name      String
  postCount Int    @map("post_count")
}
`;
    const comments = makeComments(
      { UserSummary: "User summary view" },
      { "UserSummary.post_count": "Number of posts" },
    );
    const result = applyComments(schema, comments);

    expect(result).toContain("/// User summary view\nview UserSummary {");
    expect(result).toContain("  /// Number of posts\n  postCount Int    @map(\"post_count\")");
  });

  it("inserts multi-line comments from DB", () => {
    const schema = `datasource db {
  provider = "postgresql"
  url      = "postgresql://localhost/test"
}

model User {
  id Int @id
}
`;
    const comments = makeComments({ User: "Line one\nLine two" });
    const result = applyComments(schema, comments);

    expect(result).toContain("/// Line one\n/// Line two\nmodel User {");
  });

  it("preserves indentation for field comments", () => {
    const schema = `datasource db {
  provider = "postgresql"
  url      = "postgresql://localhost/test"
}

model User {
  id    Int    @id
  email String
}
`;
    const comments = makeComments({}, { "User.email": "Email address" });
    const result = applyComments(schema, comments);

    // The comment should have the same indentation as the field
    const lines = result.split("\n");
    const commentLine = lines.find((l) => l.includes("/// Email address"))!;
    const emailLine = lines.find((l) => l.trimStart().startsWith("email"))!;
    const commentIndent = commentLine.match(/^(\s*)/)![1];
    const fieldIndent = emailLine.match(/^(\s*)/)![1];
    expect(commentIndent).toBe(fieldIndent);
  });

  it("dry-run scenario: applyComments can be used for preview without writing", () => {
    // applyComments is a pure function; dry-run is handled by the CLI layer.
    // This test verifies the function returns a new string without side effects.
    const comments = makeComments({ User: "Users table" });
    const result = applyComments(basicSchema, comments);

    // Original is not modified (strings are immutable, but verify different content)
    expect(result).not.toBe(basicSchema);
    expect(result).toContain("/// Users table");
    expect(basicSchema).not.toContain("/// Users table");
  });
});
