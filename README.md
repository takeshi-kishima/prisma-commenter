# prisma-commenter

Sync Prisma schema `///` doc comments to database `COMMENT ON` / `ALTER TABLE ... COMMENT` statements.

Prisma's `///` documentation comments are only used for JSDoc generation in the Prisma Client. They are **not** reflected in the actual database. This CLI tool bridges that gap by reading your `schema.prisma` and applying comments directly to your PostgreSQL or MySQL database.

## Installation

```bash
npm install -D prisma-commenter
```

Or run directly with npx:

```bash
npx prisma-commenter --dry-run
```

## Usage

```bash
npx prisma-commenter [options]
```

### Options

| Option | Description | Default |
|---|---|---|
| `--schema <path>` | Path to `schema.prisma` file | `./prisma/schema.prisma` |
| `--dry-run` | Output generated SQL without executing | `false` |
| `--verbose` | Print each SQL statement during execution | `false` |
| `--schema-name <name>` | PostgreSQL schema name | `public` |
| `--version` | Show version number | |
| `--help` | Show help | |

### Examples

Preview the SQL that would be executed:

```bash
npx prisma-commenter --dry-run
```

Apply comments to the database:

```bash
npx prisma-commenter
```

Use a custom schema path and PostgreSQL schema:

```bash
npx prisma-commenter --schema ./db/schema.prisma --schema-name myschema
```

Verbose output showing each statement:

```bash
npx prisma-commenter --verbose
```

## How It Works

1. Parses your `schema.prisma` file using `@mrleebo/prisma-ast`
2. Extracts `///` doc comments attached to models, views, and fields
3. Reads the `datasource` block to determine the database provider and connection URL
4. Generates the appropriate SQL:
   - **PostgreSQL**: `COMMENT ON TABLE` / `COMMENT ON COLUMN` statements
   - **MySQL**: `ALTER TABLE ... COMMENT` / `ALTER TABLE ... MODIFY COLUMN ... COMMENT` statements
5. Executes the SQL against your database (or prints it in `--dry-run` mode)

## Schema Example

```prisma
/// Users table
model User {
  /// Primary key
  id    Int    @id @default(autoincrement())
  /// User email address
  email String @unique
  /// Display name
  name  String @map("user_name")

  posts Post[]

  @@map("users")
}
```

Running `npx prisma-commenter --dry-run` with a PostgreSQL datasource produces:

```sql
COMMENT ON TABLE "public"."users" IS 'Users table';
COMMENT ON COLUMN "public"."users"."id" IS 'Primary key';
COMMENT ON COLUMN "public"."users"."email" IS 'User email address';
COMMENT ON COLUMN "public"."users"."user_name" IS 'Display name';
```

## Supported Features

- `///` single-line and multi-line doc comments
- `@map` / `@@map` column and table name overrides
- `@ignore` / `@@ignore` skipping
- `view` blocks (treated the same as `model`)
- `env("DATABASE_URL")` environment variable resolution
- Relation fields are automatically skipped (no DB column)
- SQL injection protection via proper escaping

## Supported Databases

- PostgreSQL
- MySQL / MariaDB

## Requirements

- Node.js >= 18
- A valid `datasource` block in your Prisma schema with `provider` set to `postgresql` or `mysql`

## License

MIT
