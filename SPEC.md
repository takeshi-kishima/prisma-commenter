# prisma-commenter 製品仕様書

## 概要
Prisma schema ファイル (`schema.prisma`) に記載された `///` ドキュメントコメント（論理名）を、データベースのコメント機能に自動的に反映するCLIツール。

## 背景・課題
- データベース設計では、テーブルやカラムに「論理名」を付与するのが一般的（例: `created_at` → 作成日時）
- Prisma の `///` コメントは Prisma Client の JSDoc にのみ反映され、DBには反映されない
- `prisma migrate` / `prisma db push` は `COMMENT ON` 文を生成しない
- 逆方向（DB → schema）は `prisma db pull` が v4.17+ でネイティブ対応済み
- **このツールは schema → DB 方向のギャップを埋める**

## 対象ユーザー
- Prisma を使用している開発チーム
- DBの論理名管理を schema.prisma で一元化したいチーム

## 機能要件

### F1: schema.prisma パース
- `///` ドキュメントコメントをモデル・フィールドに紐付けて抽出する
- 複数行の `///` コメントを結合する
- `@map` によるカラム名のオーバーライドを認識する
- `@@map` によるテーブル名のオーバーライドを認識する
- リレーションフィールド（DBカラムを持たない）はスキップする
- `@ignore` / `@@ignore` が付いたフィールド・モデルはスキップする
- `view` ブロックはモデルと同様に扱う
- `datasource` ブロックから接続情報（provider, url）を読み取る
- `env("DATABASE_URL")` 形式の環境変数参照を解決する

### F2: SQL生成 — PostgreSQL
- テーブルコメント: `COMMENT ON TABLE "schema"."table" IS 'コメント';`
- カラムコメント: `COMMENT ON COLUMN "schema"."table"."column" IS 'コメント';`
- PostgreSQL スキーマ名を指定可能（デフォルト: `public`）
- 識別子はダブルクォート、文字列リテラルはシングルクォートでエスケープ

### F3: SQL生成 — MySQL / MariaDB
- テーブルコメント: `ALTER TABLE \`table\` COMMENT = 'コメント';`
- カラムコメント: `ALTER TABLE \`table\` MODIFY COLUMN \`column\` <型定義> COMMENT 'コメント';`
- カラムコメントには完全なカラム定義が必要なため、`INFORMATION_SCHEMA.COLUMNS` から現在の型情報を取得する
- 識別子はバッククォート、文字列リテラルはシングルクォートでエスケープ

### F4: SQL実行
- 生成したSQLをデータベースに直接実行する
- PostgreSQL では トランザクション内で実行する
- MySQL の DDL はトランザクション対象外であることを認識する
- 接続エラー・実行エラーを分かりやすく表示する

### F5: CLI インターフェース
- `npx prisma-commenter` で実行可能
- `--schema <path>`: schema.prisma のパス指定（デフォルト: `./prisma/schema.prisma`）
- `--dry-run`: SQL文の出力のみ、実行しない
- `--verbose`: 実行中の各SQL文を表示
- `--schema-name <name>`: PostgreSQL スキーマ名（デフォルト: `public`）
- `--version`: バージョン表示
- `--help`: ヘルプ表示

## 非機能要件
- コメント内のSQLインジェクション対策（適切なエスケープ）
- 明確なエラーメッセージ（接続失敗、ファイル不在、パースエラー等）
- npm パッケージとして配布可能

## 対象外（v1 スコープ外）
- CockroachDB / SQL Server 対応
- マルチファイルスキーマ（Prisma 5.x `prismaSchemaFolder`）
- コメントの差分検出（常に全コメントを上書き適用）
- GUI / Web UI
