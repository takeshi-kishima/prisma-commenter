# prisma-commenter 実装計画

## Context
Prisma schema の `///` ドキュメントコメント（論理名）をデータベースの `COMMENT ON` / `ALTER TABLE ... COMMENT` に反映するCLIツール。Prisma にはこの機能がないため、自作する。

## 技術選定
- **言語**: TypeScript (Node.js)
- **Prismaパーサー**: `@mrleebo/prisma-ast` — `///` doc commentと `@map`/`@@map` を正しくパース可能
- **DB対応**: PostgreSQL, MySQL/MariaDB
- **CLIフレームワーク**: `commander`
- **ビルド**: `tsup`（シングルバンドル）
- **テスト**: `vitest`
- **DBドライバ**: `pg` (PostgreSQL), `mysql2` (MySQL)

## プロジェクト構成

```
prisma-commenter/
  package.json
  tsconfig.json
  src/
    index.ts              # CLI エントリポイント (shebang)
    cli.ts                # commander 設定 + オーケストレーション
    parser/
      types.ts            # SchemaInfo, ModelInfo, FieldInfo インターフェース
      adapter.ts          # prisma-ast AST → 独自型への変換
      connection.ts       # datasource URL + provider 抽出
      index.ts            # parseSchema() 公開API
    sql/
      index.ts            # generateSQL() 公開API
      postgres.ts         # COMMENT ON 生成
      mysql.ts            # ALTER TABLE ... COMMENT 生成
      escape.ts           # SQL エスケープ（dialect別）
    executor/
      index.ts            # execute() 公開API
      postgres.ts         # pg クライアント
      mysql.ts            # mysql2 クライアント
  tests/
    fixtures/             # テスト用 .prisma ファイル
    parser.test.ts
    sql.test.ts
    cli.test.ts
```

## CLI インターフェース

```
npx prisma-commenter [options]

Options:
  --schema <path>       schema.prisma のパス (default: ./prisma/schema.prisma)
  --dry-run             SQL出力のみ、実行しない
  --verbose             実行中のSQL文を表示
  --schema-name <name>  PostgreSQLスキーマ名 (default: "public")
```

## SQL生成ロジック

### PostgreSQL
```sql
COMMENT ON TABLE "public"."users" IS '利用者';
COMMENT ON COLUMN "public"."users"."name" IS '氏名';
```

### MySQL
```sql
ALTER TABLE `users` COMMENT = '利用者';
-- カラムコメントは INFORMATION_SCHEMA から現在の型情報を取得して生成
ALTER TABLE `users` MODIFY COLUMN `name` varchar(255) NOT NULL COMMENT '氏名';
```

**MySQL の注意点**: カラムコメントは `ALTER TABLE MODIFY COLUMN` で完全なカラム定義が必要。実行時に `INFORMATION_SCHEMA.COLUMNS` を参照して型情報を取得する。`--dry-run` 時も接続して型情報を読み取る。

## 実装フェーズ

### Phase 1: スキャフォールド + パーサー
1. プロジェクト初期化 (package.json, tsconfig.json, .gitignore)
2. `src/parser/types.ts` — 核となるインターフェース
3. `src/parser/adapter.ts` — prisma-ast AST変換（最も複雑なロジック）
   - `///` コメントを次のモデル/フィールドに紐付け
   - `@map`/`@@map` からDB名を取得
   - リレーションフィールドはスキップ
4. `src/parser/connection.ts` — datasource URL解決（`env()` 対応）
5. `src/parser/index.ts`
6. `tests/parser.test.ts` + fixtures

### Phase 2: SQL生成
7. `src/sql/escape.ts` — dialect別エスケープ
8. `src/sql/postgres.ts`
9. `src/sql/mysql.ts`
10. `tests/sql.test.ts`

### Phase 3: エグゼキュータ + CLI
11. `src/executor/postgres.ts` + `src/executor/mysql.ts`
12. `src/cli.ts` + `src/index.ts`
13. `tests/cli.test.ts`

### Phase 4: ビルド + 仕上げ
14. `tsup` 設定
15. `npx` 実行テスト
16. README

## エッジケース対応
- **リレーションフィールド** (`posts Post[]`): DBカラムなし → スキップ
- **`@@map`/`@map`**: DB名のオーバーライドを正しく反映
- **`env("DATABASE_URL")`**: `process.env` から解決
- **コメント内のシングルクォート**: dialect別に正しくエスケープ
- **`@ignore`/`@@ignore`**: スキップ
- **`view` ブロック**: モデルと同様に対応
- **空のコメント** (`///` のみ): スキップ

## 検証方法
1. **ユニットテスト**: `vitest` でパーサー・SQL生成をテスト
2. **dry-run テスト**: CLI を `--dry-run` で実行しSQL出力を検証
3. **手動統合テスト**: Docker で PostgreSQL / MySQL を立ち上げ、実際にコメントが反映されることを確認
