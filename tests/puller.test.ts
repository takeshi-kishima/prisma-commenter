import { describe, it, expect, vi, beforeEach } from "vitest";

// Shared mock state
const pgMockClient = {
  connect: vi.fn(),
  query: vi.fn(),
  end: vi.fn(),
};

const mysqlMockConnection = {
  query: vi.fn(),
  end: vi.fn(),
};

vi.mock("pg", () => {
  // Must use a real constructor function for `new pg.Client()`
  function MockClient() {
    return pgMockClient;
  }
  return {
    default: {
      Client: MockClient,
    },
  };
});

vi.mock("mysql2/promise", () => ({
  default: {
    createConnection: vi.fn(() => Promise.resolve(mysqlMockConnection)),
  },
}));

describe("pullPostgres", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pgMockClient.connect.mockResolvedValue(undefined);
    pgMockClient.end.mockResolvedValue(undefined);
  });

  it("fetches table and column comments from PostgreSQL", async () => {
    const { pullPostgres } = await import("../src/puller/postgres.js");

    pgMockClient.query
      .mockResolvedValueOnce({
        rows: [
          { table_name: "users", comment: "Users table" },
          { table_name: "posts", comment: "Blog posts" },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { table_name: "users", column_name: "email", comment: "Email address" },
          { table_name: "users", column_name: "name", comment: "Display name" },
          { table_name: "posts", column_name: "title", comment: "Post title" },
        ],
      });

    const result = await pullPostgres("postgresql://localhost:5432/test");

    expect(result.tables.get("users")).toBe("Users table");
    expect(result.tables.get("posts")).toBe("Blog posts");
    expect(result.columns.get("users.email")).toBe("Email address");
    expect(result.columns.get("users.name")).toBe("Display name");
    expect(result.columns.get("posts.title")).toBe("Post title");
  });

  it("uses custom schema name", async () => {
    const { pullPostgres } = await import("../src/puller/postgres.js");

    pgMockClient.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await pullPostgres("postgresql://localhost:5432/test", "myschema");

    // Check that the schema name was passed as parameter
    const tableQuery = pgMockClient.query.mock.calls[0];
    expect(tableQuery[1]).toEqual(["myschema"]);
    const columnQuery = pgMockClient.query.mock.calls[1];
    expect(columnQuery[1]).toEqual(["myschema"]);
  });

  it("returns empty maps when no comments exist", async () => {
    const { pullPostgres } = await import("../src/puller/postgres.js");

    pgMockClient.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await pullPostgres("postgresql://localhost:5432/test");

    expect(result.tables.size).toBe(0);
    expect(result.columns.size).toBe(0);
  });

  it("closes the connection even on error", async () => {
    const { pullPostgres } = await import("../src/puller/postgres.js");

    pgMockClient.query.mockRejectedValueOnce(new Error("query failed"));

    await expect(
      pullPostgres("postgresql://localhost:5432/test"),
    ).rejects.toThrow("query failed");

    expect(pgMockClient.end).toHaveBeenCalled();
  });
});

describe("pullMySQL", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mysqlMockConnection.end.mockResolvedValue(undefined);
  });

  it("fetches table and column comments from MySQL", async () => {
    const { pullMySQL } = await import("../src/puller/mysql.js");

    mysqlMockConnection.query
      .mockResolvedValueOnce([
        [
          { TABLE_NAME: "users", TABLE_COMMENT: "Users table" },
          { TABLE_NAME: "posts", TABLE_COMMENT: "Blog posts" },
        ],
      ])
      .mockResolvedValueOnce([
        [
          { TABLE_NAME: "users", COLUMN_NAME: "email", COLUMN_COMMENT: "Email" },
          { TABLE_NAME: "posts", COLUMN_NAME: "title", COLUMN_COMMENT: "Title" },
        ],
      ]);

    const result = await pullMySQL("mysql://localhost/test");

    expect(result.tables.get("users")).toBe("Users table");
    expect(result.tables.get("posts")).toBe("Blog posts");
    expect(result.columns.get("users.email")).toBe("Email");
    expect(result.columns.get("posts.title")).toBe("Title");
  });

  it("returns empty maps when no comments exist", async () => {
    const { pullMySQL } = await import("../src/puller/mysql.js");

    mysqlMockConnection.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]]);

    const result = await pullMySQL("mysql://localhost/test");

    expect(result.tables.size).toBe(0);
    expect(result.columns.size).toBe(0);
  });

  it("closes the connection even on error", async () => {
    const { pullMySQL } = await import("../src/puller/mysql.js");

    mysqlMockConnection.query.mockRejectedValueOnce(new Error("query failed"));

    await expect(pullMySQL("mysql://localhost/test")).rejects.toThrow(
      "query failed",
    );

    expect(mysqlMockConnection.end).toHaveBeenCalled();
  });
});

describe("pullComments dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pgMockClient.connect.mockResolvedValue(undefined);
    pgMockClient.end.mockResolvedValue(undefined);
    mysqlMockConnection.end.mockResolvedValue(undefined);
  });

  it("dispatches to PostgreSQL puller for postgresql provider", async () => {
    pgMockClient.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const { pullComments } = await import("../src/puller/index.js");
    const result = await pullComments(
      "postgresql",
      "postgresql://localhost/test",
    );
    expect(result.tables).toBeInstanceOf(Map);
    expect(result.columns).toBeInstanceOf(Map);
  });

  it("dispatches to MySQL puller for mysql provider", async () => {
    mysqlMockConnection.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]]);

    const { pullComments } = await import("../src/puller/index.js");
    const result = await pullComments("mysql", "mysql://localhost/test");
    expect(result.tables).toBeInstanceOf(Map);
    expect(result.columns).toBeInstanceOf(Map);
  });
});
