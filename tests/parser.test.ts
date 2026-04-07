import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseSchema } from "../src/parser/index.js";

function fixture(name: string): string {
  return readFileSync(resolve(__dirname, "fixtures", name), "utf-8");
}

describe("parseSchema", () => {
  describe("basic schema", () => {
    beforeEach(() => {
      process.env.DATABASE_URL = "postgresql://localhost:5432/test";
    });
    afterEach(() => {
      delete process.env.DATABASE_URL;
    });

    it("extracts connection info with env() resolution", () => {
      const result = parseSchema(fixture("basic.prisma"));
      expect(result.connection).toEqual({
        provider: "postgresql",
        url: "postgresql://localhost:5432/test",
      });
    });

    it("extracts models with doc comments", () => {
      const result = parseSchema(fixture("basic.prisma"));
      expect(result.models).toHaveLength(2);

      const user = result.models.find((m) => m.name === "User")!;
      expect(user.comment).toBe("Users table");
      expect(user.dbName).toBe("User");

      const post = result.models.find((m) => m.name === "Post")!;
      expect(post.comment).toBe("Blog posts");
    });

    it("extracts field comments", () => {
      const result = parseSchema(fixture("basic.prisma"));
      const user = result.models.find((m) => m.name === "User")!;

      expect(user.fields).toEqual([
        { name: "id", dbName: "id", comment: "User identifier" },
        { name: "email", dbName: "email", comment: "Email address" },
        { name: "name", dbName: "name", comment: "Display name" },
      ]);
    });

    it("skips relation fields", () => {
      const result = parseSchema(fixture("basic.prisma"));
      const user = result.models.find((m) => m.name === "User")!;
      const fieldNames = user.fields.map((f) => f.name);
      expect(fieldNames).not.toContain("posts");

      const post = result.models.find((m) => m.name === "Post")!;
      const postFieldNames = post.fields.map((f) => f.name);
      expect(postFieldNames).not.toContain("author");
    });

    it("skips fields without comments", () => {
      const result = parseSchema(fixture("basic.prisma"));
      const user = result.models.find((m) => m.name === "User")!;
      const fieldNames = user.fields.map((f) => f.name);
      expect(fieldNames).not.toContain("createdAt");
    });
  });

  describe("@map / @@map", () => {
    it("uses @@map for table name", () => {
      const result = parseSchema(fixture("map-names.prisma"));
      const user = result.models.find((m) => m.name === "User")!;
      expect(user.dbName).toBe("app_users");

      const post = result.models.find((m) => m.name === "Post")!;
      expect(post.dbName).toBe("articles");
    });

    it("uses @map for column name", () => {
      const result = parseSchema(fixture("map-names.prisma"));
      const user = result.models.find((m) => m.name === "User")!;

      const email = user.fields.find((f) => f.name === "email")!;
      expect(email.dbName).toBe("email_address");

      const fullName = user.fields.find((f) => f.name === "fullName")!;
      expect(fullName.dbName).toBe("full_name");
    });
  });

  describe("@ignore / @@ignore", () => {
    it("skips @@ignore models", () => {
      const result = parseSchema(fixture("ignore.prisma"));
      const modelNames = result.models.map((m) => m.name);
      expect(modelNames).not.toContain("InternalLog");
    });

    it("skips @ignore fields", () => {
      const result = parseSchema(fixture("ignore.prisma"));
      const user = result.models.find((m) => m.name === "User")!;
      const fieldNames = user.fields.map((f) => f.name);
      expect(fieldNames).not.toContain("secret");
    });

    it("keeps non-ignored models and fields", () => {
      const result = parseSchema(fixture("ignore.prisma"));
      expect(result.models).toHaveLength(1);
      const user = result.models[0];
      expect(user.name).toBe("User");
      expect(user.fields).toHaveLength(2);
    });
  });

  describe("view blocks", () => {
    it("parses view blocks like models", () => {
      const result = parseSchema(fixture("view.prisma"));
      expect(result.models).toHaveLength(1);

      const view = result.models[0];
      expect(view.name).toBe("UserSummary");
      expect(view.comment).toBe("User summary view");
      expect(view.dbName).toBe("UserSummary");
    });

    it("extracts field comments from views", () => {
      const result = parseSchema(fixture("view.prisma"));
      const view = result.models[0];

      expect(view.fields).toEqual([
        { name: "id", dbName: "id", comment: "User ID" },
        { name: "name", dbName: "name", comment: "Display name" },
        { name: "postCount", dbName: "post_count", comment: "Number of posts" },
      ]);
    });
  });

  describe("multiline comments", () => {
    it("joins multiple /// lines for models", () => {
      const result = parseSchema(fixture("multiline-comment.prisma"));
      const user = result.models[0];
      expect(user.comment).toBe("User model\nStores application users");
    });

    it("joins multiple /// lines for fields", () => {
      const result = parseSchema(fixture("multiline-comment.prisma"));
      const user = result.models[0];
      const id = user.fields.find((f) => f.name === "id")!;
      expect(id.comment).toBe("Unique identifier\nAuto-incremented");
    });
  });

  describe("connection parsing", () => {
    it("parses MySQL provider", () => {
      const result = parseSchema(fixture("mysql.prisma"));
      expect(result.connection.provider).toBe("mysql");
      expect(result.connection.url).toBe(
        "mysql://root:password@localhost:3306/test"
      );
    });

    it("parses direct URL strings", () => {
      const result = parseSchema(fixture("map-names.prisma"));
      expect(result.connection.url).toBe(
        "postgresql://localhost:5432/test"
      );
    });

    it("resolves env() references", () => {
      process.env.TEST_DATABASE_URL = "postgresql://envhost:5432/envdb";
      try {
        const result = parseSchema(fixture("env-url.prisma"));
        expect(result.connection.url).toBe(
          "postgresql://envhost:5432/envdb"
        );
      } finally {
        delete process.env.TEST_DATABASE_URL;
      }
    });

    it("throws if env variable is not set", () => {
      delete process.env.TEST_DATABASE_URL;
      expect(() => parseSchema(fixture("env-url.prisma"))).toThrow(
        'Environment variable "TEST_DATABASE_URL" is not set'
      );
    });
  });

  describe("no comments schema", () => {
    it("returns empty models array when no comments exist", () => {
      const result = parseSchema(fixture("no-comments.prisma"));
      expect(result.models).toHaveLength(0);
    });
  });

  describe("error handling", () => {
    it("throws on missing datasource", () => {
      expect(() =>
        parseSchema(`
model User {
  id Int @id
}
`)
      ).toThrow("No datasource block found");
    });

    it("throws on unsupported provider", () => {
      expect(() =>
        parseSchema(`
          datasource db {
            provider = "sqlserver"
            url      = "sqlserver://localhost"
          }
        `)
      ).toThrow("Unsupported provider");
    });
  });
});
