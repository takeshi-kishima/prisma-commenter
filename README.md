# prisma-commenter

Sync Prisma schema `///` doc comments to database comments, and vice versa.

Prisma's `///` documentation comments are only used for JSDoc generation in the Prisma Client. They are **not** reflected in the actual database. Additionally, `prisma db pull` does **not** read database comments back into `///`, and even **removes** existing `///` comments.

This CLI tool bridges that gap in both directions:

- **push**: schema.prisma `///` → DB `COMMENT ON`
- **pull**: DB `COMMENT ON` → schema.prisma `///`

## Installation

```bash
npm install -D prisma-commenter
```

Or run directly with npx:

```bash
npx prisma-commenter push --dry-run
```

## Usage

```bash
npx prisma-commenter <command> [options]
```

### Commands

| Command | Description |
|---|---|
| `push` | Apply `///` comments from schema.prisma to the database (default) |
| `pull` | Read database comments and write them as `///` into schema.prisma |

### Options

| Option | Description | Default |
|---|---|---|
| `--schema <path>` | Path to `schema.prisma` file | `./prisma/schema.prisma` |
| `--dry-run` | Preview changes without applying | `false` |
| `--verbose` | Print detailed output | `false` |
| `--schema-name <name>` | PostgreSQL schema name | `public` |
| `--version` | Show version number | |
| `--help` | Show help | |

### Examples

**Push: schema → DB**

```bash
# Preview SQL
npx prisma-commenter push --dry-run

# Apply to database
npx prisma-commenter push
```

**Pull: DB → schema**

```bash
# Preview changes to schema.prisma
npx prisma-commenter pull --dry-run

# Write /// comments into schema.prisma
npx prisma-commenter pull
```

## Recommended Workflow

```bash
# 1. After prisma db pull (which removes /// comments)
prisma db pull
npx prisma-commenter pull     # Restore /// from DB comments

# 2. Edit /// comments in schema.prisma

# 3. Push comments to DB
npx prisma-commenter push

# 4. After prisma migrate
prisma migrate dev
npx prisma-commenter push     # Apply comments to new tables/columns
```

### package.json scripts

```json
{
  "scripts": {
    "db:migrate": "prisma migrate dev && npx prisma-commenter push",
    "db:pull": "prisma db pull && npx prisma-commenter pull",
    "db:comment:push": "npx prisma-commenter push",
    "db:comment:pull": "npx prisma-commenter pull",
    "db:comment:dry": "npx prisma-commenter push --dry-run",
    "db:comment:preview": "npx prisma-commenter pull --dry-run"
  }
}
```

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

Running `npx prisma-commenter push --dry-run` with a PostgreSQL datasource produces:

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
