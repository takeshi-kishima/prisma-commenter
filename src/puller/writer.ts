import { getSchema } from "@mrleebo/prisma-ast";
import type {
  Model,
  View,
  Field,
  BlockAttribute,
  Attribute,
  AttributeArgument,
} from "@mrleebo/prisma-ast";
import type { DbComments } from "./types.js";
import { unquote } from "../utils.js";

/**
 * Known Prisma scalar types. Non-scalar, non-enum types are relations.
 */
const PRISMA_SCALAR_TYPES: ReadonlySet<string> = new Set([
  "String",
  "Boolean",
  "Int",
  "BigInt",
  "Float",
  "Decimal",
  "DateTime",
  "Json",
  "Bytes",
  "Unsupported",
]);

/**
 * Check if a field is a relation (no DB column).
 */
function isRelationField(field: Field): boolean {
  const typeName =
    typeof field.fieldType === "string" ? field.fieldType : null;
  if (typeName === null) return false;

  // Has explicit @relation
  if (
    (field.attributes ?? []).some(
      (attr) => attr.type === "attribute" && attr.name === "relation",
    )
  ) {
    return true;
  }

  if (PRISMA_SCALAR_TYPES.has(typeName)) return false;
  if (field.array) return true;

  return false;
}

/**
 * Get the @map or @@map value from attributes.
 */
function getMapValue(
  attrs: Array<Attribute | BlockAttribute> | undefined,
): string | null {
  if (!attrs) return null;
  for (const attr of attrs) {
    if (attr.type !== "attribute" || attr.name !== "map") continue;
    const args: AttributeArgument[] = "args" in attr ? (attr.args ?? []) : [];
    if (args.length > 0) {
      const first = args[0];
      if (
        first.type === "attributeArgument" &&
        typeof first.value === "string"
      ) {
        return unquote(first.value);
      }
    }
  }
  return null;
}

/**
 * Represents a model/view found in the schema with its line positions and DB name mappings.
 */
interface ModelPosition {
  /** Prisma model name. */
  name: string;
  /** DB table name (from @@map or same as name). */
  dbName: string;
  /** 0-based line index of the "model X {" or "view X {" line. */
  startLine: number;
  /** Fields with their line positions and DB names. */
  fields: FieldPosition[];
}

interface FieldPosition {
  /** Prisma field name. */
  name: string;
  /** DB column name (from @map or same as name). */
  dbName: string;
  /** 0-based line index of the field definition. */
  line: number;
  /** Whether this is a relation field (should be skipped). */
  isRelation: boolean;
}

/**
 * Build a map of model/field positions by parsing the schema with prisma-ast
 * and correlating with line numbers from the source text.
 */
function buildModelPositions(source: string): ModelPosition[] {
  const ast = getSchema(source);
  const lines = source.split("\n");
  const positions: ModelPosition[] = [];

  for (const block of ast.list) {
    if (block.type !== "model" && block.type !== "view") continue;
    const obj = block as Model | View;

    // Find the line for this model/view declaration
    const blockKeyword = block.type; // "model" or "view"
    const regex = new RegExp(
      `^\\s*${blockKeyword}\\s+${escapeRegExp(obj.name)}\\s*\\{`,
    );

    let startLine = -1;
    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        startLine = i;
        break;
      }
    }
    if (startLine === -1) continue;

    // Get @@map for table name
    const blockAttrs = obj.properties.filter(
      (p): p is BlockAttribute =>
        p.type === "attribute" && (p as BlockAttribute).kind === "object",
    );
    const mapName = getMapValue(blockAttrs);
    const dbName = mapName ?? obj.name;

    // Find fields and their line positions
    const fields: FieldPosition[] = [];

    // Find the closing brace to limit our search
    let closeLine = lines.length;
    let braceCount = 0;
    for (let i = startLine; i < lines.length; i++) {
      for (const ch of lines[i]) {
        if (ch === "{") braceCount++;
        if (ch === "}") braceCount--;
      }
      if (braceCount === 0 && i > startLine) {
        closeLine = i;
        break;
      }
    }

    for (const prop of obj.properties) {
      if (prop.type !== "field") continue;
      const field = prop as Field;
      const relation = isRelationField(field);
      const fieldDbName = getMapValue(field.attributes) ?? field.name;

      // Find the line for this field within the model block
      const fieldRegex = new RegExp(
        `^\\s+${escapeRegExp(field.name)}\\s+`,
      );
      let fieldLine = -1;
      for (let i = startLine + 1; i < closeLine; i++) {
        if (fieldRegex.test(lines[i])) {
          fieldLine = i;
          break;
        }
      }
      if (fieldLine === -1) continue;

      fields.push({
        name: field.name,
        dbName: fieldDbName,
        line: fieldLine,
        isRelation: relation,
      });
    }

    positions.push({ name: obj.name, dbName, startLine, fields });
  }

  return positions;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Check if a line is a `///` doc comment.
 */
function isDocCommentLine(line: string): boolean {
  return /^\s*\/\/\//.test(line);
}

/**
 * Apply DB comments to a schema.prisma source string.
 *
 * @param source - The original schema.prisma content.
 * @param comments - Comments fetched from the database.
 * @returns The modified schema content (or the same if no changes).
 */
export function applyComments(source: string, comments: DbComments): string {
  const positions = buildModelPositions(source);
  const lines = source.split("\n");

  // We process from bottom to top so that line insertions don't affect
  // earlier line indices.
  const operations: Array<{
    /** 0-based line index where the target (model/field) is. */
    targetLine: number;
    /** The comment text to set. */
    comment: string;
    /** Indentation to use for the /// line. */
    indent: string;
  }> = [];

  for (const model of positions) {
    // Check for table comment
    const tableComment = comments.tables.get(model.dbName);
    if (tableComment) {
      const indent = getIndent(lines[model.startLine]);
      operations.push({
        targetLine: model.startLine,
        comment: tableComment,
        indent,
      });
    }

    // Check for column comments
    for (const field of model.fields) {
      if (field.isRelation) continue;
      const key = `${model.dbName}.${field.dbName}`;
      const columnComment = comments.columns.get(key);
      if (columnComment) {
        const indent = getIndent(lines[field.line]);
        operations.push({
          targetLine: field.line,
          comment: columnComment,
          indent,
        });
      }
    }
  }

  // Sort operations by targetLine descending so we can modify bottom-up
  operations.sort((a, b) => b.targetLine - a.targetLine);

  for (const op of operations) {
    const commentLines = op.comment.split("\n").map(
      (text) => `${op.indent}/// ${text}`,
    );

    // Check if there are existing /// doc comments immediately before the target line
    let firstCommentLine = op.targetLine;
    while (
      firstCommentLine > 0 &&
      isDocCommentLine(lines[firstCommentLine - 1])
    ) {
      firstCommentLine--;
    }

    if (firstCommentLine < op.targetLine) {
      // Replace existing /// comments
      lines.splice(
        firstCommentLine,
        op.targetLine - firstCommentLine,
        ...commentLines,
      );
    } else {
      // Insert new /// comments before the target line
      lines.splice(op.targetLine, 0, ...commentLines);
    }
  }

  return lines.join("\n");
}

/**
 * Extract leading whitespace from a line.
 */
function getIndent(line: string): string {
  const match = line.match(/^(\s*)/);
  return match ? match[1] : "";
}
