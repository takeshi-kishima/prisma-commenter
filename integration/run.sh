#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# prisma-commenter Integration Tests
# ============================================================

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# --- Colors ------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

pass() { echo -e "${GREEN}  [PASS]${NC} $1"; }
fail() { echo -e "${RED}  [FAIL]${NC} $1"; FAILURES=$((FAILURES + 1)); }
info() { echo -e "${CYAN}  [INFO]${NC} $1"; }
section() { echo -e "\n${BOLD}${YELLOW}=== $1 ===${NC}"; }

FAILURES=0

# Skip Prisma AI consent prompt (this is a disposable test DB)
export PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="yes"

# --- Cleanup trap ------------------------------------------
cleanup() {
  section "Cleanup"
  info "Stopping and removing containers + volumes..."
  docker compose down -v --remove-orphans 2>/dev/null || true
  info "Cleanup done."
}
trap cleanup EXIT

# --- Build the project first --------------------------------
section "Build"
info "Building prisma-commenter..."
npm run build
pass "Build succeeded"

# --- Start Docker containers --------------------------------
section "Docker Compose Up"
docker compose up -d
info "Waiting for databases to be ready..."

# Wait for healthy status
wait_for_healthy() {
  local service=$1
  local max_wait=60
  local elapsed=0
  while [ $elapsed -lt $max_wait ]; do
    local status
    status=$(docker compose ps "$service" --format json 2>/dev/null | grep -o '"Health":"[^"]*"' | head -1 || echo "")
    if echo "$status" | grep -q "healthy"; then
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  return 1
}

if wait_for_healthy postgres; then
  pass "PostgreSQL is ready"
else
  fail "PostgreSQL did not become ready within 60s"
  exit 1
fi

if wait_for_healthy mysql; then
  pass "MySQL is ready"
else
  fail "MySQL did not become ready within 60s"
  exit 1
fi

# ============================================================
# PostgreSQL Tests
# ============================================================
section "PostgreSQL Integration Tests"

export DATABASE_URL="postgresql://test:test@localhost:5433/prisma_commenter_test"

# 1. Create tables via Prisma migrate
info "Running Prisma migrate (PostgreSQL)..."
npx prisma db push --schema=integration/postgres/schema.prisma --force-reset --accept-data-loss 2>&1 | tail -3
pass "Prisma migrate (PostgreSQL)"

# 2. Dry-run test
info "Testing --dry-run (PostgreSQL)..."
DRY_RUN_OUTPUT=$(node dist/index.js push --schema integration/postgres/schema.prisma --dry-run 2>&1)
echo "$DRY_RUN_OUTPUT" | head -5
info "..."

if echo "$DRY_RUN_OUTPUT" | grep -q "COMMENT ON TABLE"; then
  pass "dry-run generates COMMENT ON TABLE"
else
  fail "dry-run did not generate COMMENT ON TABLE"
fi

if echo "$DRY_RUN_OUTPUT" | grep -q "COMMENT ON COLUMN"; then
  pass "dry-run generates COMMENT ON COLUMN"
else
  fail "dry-run did not generate COMMENT ON COLUMN"
fi

# 3. Execute comments
info "Executing prisma-commenter (PostgreSQL)..."
node dist/index.js push --schema integration/postgres/schema.prisma --verbose 2>&1
pass "prisma-commenter executed (PostgreSQL)"

# 4. Verify table comments
info "Verifying table comments (PostgreSQL)..."

PG_CONN="postgresql://test:test@localhost:5433/prisma_commenter_test"

verify_pg_table_comment() {
  local table=$1
  local expected=$2
  local result
  result=$(docker compose exec -T postgres psql -U test -d prisma_commenter_test -t -A -c \
    "SELECT obj_description(c.oid) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = '${table}' AND n.nspname = 'public';")
  result=$(echo "$result" | tr -d '[:space:]')
  expected_trimmed=$(echo "$expected" | tr -d '[:space:]')
  if [ "$result" = "$expected_trimmed" ]; then
    pass "Table '${table}' comment = '${expected}'"
  else
    fail "Table '${table}' comment: expected '${expected}', got '${result}'"
  fi
}

verify_pg_column_comment() {
  local table=$1
  local column=$2
  local expected=$3
  local result
  result=$(docker compose exec -T postgres psql -U test -d prisma_commenter_test -t -A -c \
    "SELECT col_description(a.attrelid, a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = '${table}' AND a.attname = '${column}' AND n.nspname = 'public';")
  result=$(echo "$result" | tr -d '[:space:]')
  expected_trimmed=$(echo "$expected" | tr -d '[:space:]')
  if [ "$result" = "$expected_trimmed" ]; then
    pass "Column '${table}.${column}' comment = '${expected}'"
  else
    fail "Column '${table}.${column}' comment: expected '${expected}', got '${result}'"
  fi
}

# Table comments
verify_pg_table_comment "users" "ユーザー情報"
verify_pg_table_comment "posts" "ブログ記事"
verify_pg_table_comment "profiles" "ユーザープロフィール"
verify_pg_table_comment "categories" "カテゴリ"
verify_pg_table_comment "category_posts" "記事カテゴリ中間テーブル"
verify_pg_table_comment "audit_logs" "監査ログ"

# Column comments (sampling key columns including @map)
verify_pg_column_comment "users" "id" "ユーザーID"
verify_pg_column_comment "users" "email" "メールアドレス"
verify_pg_column_comment "users" "created_at" "作成日時"
verify_pg_column_comment "users" "updated_at" "更新日時"
verify_pg_column_comment "posts" "title" "記事タイトル"
verify_pg_column_comment "posts" "author_id" "著者ID"
verify_pg_column_comment "category_posts" "post_id" "記事ID"
verify_pg_column_comment "category_posts" "category_id" "カテゴリID"
verify_pg_column_comment "audit_logs" "action" "操作内容"

# ============================================================
# MySQL Tests
# ============================================================
section "MySQL Integration Tests"

export DATABASE_URL="mysql://test:test@localhost:3307/prisma_commenter_test"

# 1. Create tables via Prisma migrate
info "Running Prisma migrate (MySQL)..."
npx prisma db push --schema=integration/mysql/schema.prisma --force-reset --accept-data-loss 2>&1 | tail -3
pass "Prisma migrate (MySQL)"

# 2. Dry-run test
info "Testing --dry-run (MySQL)..."
DRY_RUN_OUTPUT=$(node dist/index.js push --schema integration/mysql/schema.prisma --dry-run 2>&1)
echo "$DRY_RUN_OUTPUT" | head -5
info "..."

if echo "$DRY_RUN_OUTPUT" | grep -q "ALTER TABLE"; then
  pass "dry-run generates ALTER TABLE"
else
  fail "dry-run did not generate ALTER TABLE"
fi

if echo "$DRY_RUN_OUTPUT" | grep -q "COMMENT"; then
  pass "dry-run generates COMMENT"
else
  fail "dry-run did not generate COMMENT"
fi

# 3. Execute comments
info "Executing prisma-commenter (MySQL)..."
node dist/index.js push --schema integration/mysql/schema.prisma --verbose 2>&1
pass "prisma-commenter executed (MySQL)"

# 4. Verify table comments
info "Verifying table comments (MySQL)..."

verify_mysql_table_comment() {
  local table=$1
  local expected=$2
  local result
  result=$(docker compose exec -T mysql mysql --default-character-set=utf8mb4 -u test -ptest prisma_commenter_test -N -B -e \
    "SELECT TABLE_COMMENT FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'prisma_commenter_test' AND TABLE_NAME = '${table}';")
  result=$(echo "$result" | tr -d '[:space:]')
  expected_trimmed=$(echo "$expected" | tr -d '[:space:]')
  if [ "$result" = "$expected_trimmed" ]; then
    pass "Table '${table}' comment = '${expected}'"
  else
    fail "Table '${table}' comment: expected '${expected}', got '${result}'"
  fi
}

verify_mysql_column_comment() {
  local table=$1
  local column=$2
  local expected=$3
  local result
  result=$(docker compose exec -T mysql mysql --default-character-set=utf8mb4 -u test -ptest prisma_commenter_test -N -B -e \
    "SELECT COLUMN_COMMENT FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'prisma_commenter_test' AND TABLE_NAME = '${table}' AND COLUMN_NAME = '${column}';")
  result=$(echo "$result" | tr -d '[:space:]')
  expected_trimmed=$(echo "$expected" | tr -d '[:space:]')
  if [ "$result" = "$expected_trimmed" ]; then
    pass "Column '${table}.${column}' comment = '${expected}'"
  else
    fail "Column '${table}.${column}' comment: expected '${expected}', got '${result}'"
  fi
}

# Table comments
verify_mysql_table_comment "users" "ユーザー情報"
verify_mysql_table_comment "posts" "ブログ記事"
verify_mysql_table_comment "profiles" "ユーザープロフィール"
verify_mysql_table_comment "categories" "カテゴリ"
verify_mysql_table_comment "category_posts" "記事カテゴリ中間テーブル"
verify_mysql_table_comment "audit_logs" "監査ログ"

# Column comments (sampling key columns including @map)
verify_mysql_column_comment "users" "id" "ユーザーID"
verify_mysql_column_comment "users" "email" "メールアドレス"
verify_mysql_column_comment "users" "created_at" "作成日時"
verify_mysql_column_comment "users" "updated_at" "更新日時"
verify_mysql_column_comment "posts" "title" "記事タイトル"
verify_mysql_column_comment "posts" "author_id" "著者ID"
verify_mysql_column_comment "category_posts" "post_id" "記事ID"
verify_mysql_column_comment "category_posts" "category_id" "カテゴリID"
verify_mysql_column_comment "audit_logs" "action" "操作内容"

# ============================================================
# Summary
# ============================================================
section "Summary"

if [ $FAILURES -eq 0 ]; then
  echo -e "\n${GREEN}${BOLD}  All integration tests passed!${NC}\n"
  exit 0
else
  echo -e "\n${RED}${BOLD}  ${FAILURES} test(s) failed.${NC}\n"
  exit 1
fi
