import type {
  Schema,
  Block,
  Model,
  View,
  Property,
  Comment,
  Field,
  BlockAttribute,
  Attribute,
  AttributeArgument,
} from "@mrleebo/prisma-ast";
import type { ModelInfo, FieldInfo } from "./types.js";
import { unquote } from "../utils.js";

/**
 * Known Prisma scalar types and special types that map to actual DB columns.
 * If a field's type is NOT in this set and is NOT optional/array of scalars,
 * it is a relation field and should be skipped.
 *
 * We use a different strategy: a field is a relation if its type starts with
 * an uppercase letter AND is not a known scalar/special type.
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
 * Extract the text from a `///` doc comment, stripping the `///` prefix.
 */
function extractDocComment(text: string): string | null {
  if (!text.startsWith("///")) return null;
  return text.slice(3).trim();
}

/**
 * Check if a field has the @relation attribute (explicit relation).
 */
function hasRelationAttribute(field: Field): boolean {
  return (field.attributes ?? []).some(
    (attr) => attr.type === "attribute" && attr.name === "relation"
  );
}

/**
 * Determine if a field is a relation field (no corresponding DB column).
 *
 * A field is a relation if:
 * - It has a @relation attribute, OR
 * - Its type is not a known Prisma scalar and it's a list (e.g., Post[])
 * - Its type is not a known Prisma scalar (e.g., Post, Post?)
 */
function isRelationField(field: Field): boolean {
  const typeName =
    typeof field.fieldType === "string" ? field.fieldType : null;

  // If fieldType is a function (e.g., Unsupported("...")), it's not a relation
  if (typeName === null) return false;

  // Has explicit @relation
  if (hasRelationAttribute(field)) return true;

  // Known scalar type => not a relation
  if (PRISMA_SCALAR_TYPES.has(typeName)) return false;

  // Enum fields also start with uppercase but have no @relation.
  // However, enums DO map to DB columns, so we can't skip them.
  // The safest heuristic: skip only if @relation is present OR it's a list type.
  // A list field of a non-scalar type is always a relation (e.g., posts Post[]).
  if (field.array) return true;

  // For optional/required non-scalar non-list fields without @relation,
  // it could be either a relation or an enum. We keep them (enums have DB columns).
  return false;
}

/**
 * Check if a field has the @ignore attribute.
 */
function hasFieldIgnore(field: Field): boolean {
  return (field.attributes ?? []).some(
    (attr) => attr.type === "attribute" && attr.name === "ignore"
  );
}

/**
 * Check if a model/view has the @@ignore block attribute.
 */
function hasBlockIgnore(obj: Model | View): boolean {
  return obj.properties.some(
    (prop) =>
      prop.type === "attribute" &&
      (prop as BlockAttribute).kind === "object" &&
      prop.name === "ignore"
  );
}

/**
 * Get the database name from @map (field) or @@map (model) attribute.
 */
function getMapName(
  attributes: Array<Attribute | BlockAttribute> | undefined
): string | null;
function getMapName(properties: Property[]): string | null;
function getMapName(
  input: Array<Attribute | BlockAttribute> | Property[] | undefined
): string | null {
  if (!input) return null;

  for (const item of input) {
    if (item.type !== "attribute" || item.name !== "map") continue;

    const args: AttributeArgument[] =
      "args" in item ? (item.args ?? []) : [];
    if (args.length > 0) {
      const firstArg = args[0];
      if (
        firstArg.type === "attributeArgument" &&
        typeof firstArg.value === "string"
      ) {
        return unquote(firstArg.value);
      }
    }
  }
  return null;
}

/**
 * Get the @@map database table name from a model/view's properties.
 */
function getBlockMapName(obj: Model | View): string | null {
  const blockAttrs = obj.properties.filter(
    (p): p is BlockAttribute =>
      p.type === "attribute" && (p as BlockAttribute).kind === "object"
  );
  return getMapName(blockAttrs);
}

/**
 * Collect consecutive `///` doc comments that appear before a field or
 * at the end of the properties list (for model-level comment binding).
 *
 * Returns joined comment text or null.
 */
function collectDocComments(comments: string[]): string | null {
  if (comments.length === 0) return null;
  const joined = comments.join("\n");
  return joined || null;
}

/**
 * Convert prisma-ast model/view blocks into our ModelInfo array.
 *
 * Comment binding logic:
 * - Top-level `///` comments in schema.list that appear immediately before
 *   a model/view block are the model's doc comment.
 * - `///` comments inside properties that appear immediately before a field
 *   are that field's doc comment.
 */
export function extractModels(schema: Schema): ModelInfo[] {
  const models: ModelInfo[] = [];
  const list = schema.list;

  for (let i = 0; i < list.length; i++) {
    const block = list[i];

    // Only process model and view blocks
    if (block.type !== "model" && block.type !== "view") continue;

    const obj = block as Model | View;

    // Skip @@ignore models/views
    if (hasBlockIgnore(obj)) continue;

    // Collect preceding /// doc comments for this model/view
    const modelCommentParts: string[] = [];
    for (let j = i - 1; j >= 0; j--) {
      const prev = list[j];
      if (prev.type === "comment") {
        const text = extractDocComment(prev.text);
        if (text !== null) {
          modelCommentParts.unshift(text);
        } else {
          break; // Non-doc comment (e.g., // or //) — stop collecting
        }
      } else if (prev.type === "break") {
        // Breaks between comments and model are okay, keep looking
        // Actually, a break typically separates blocks. Stop here.
        break;
      } else {
        break;
      }
    }

    const modelComment = collectDocComments(modelCommentParts);
    const dbName = getBlockMapName(obj) ?? obj.name;

    // Process fields
    const fields: FieldInfo[] = [];
    const pendingComments: string[] = [];

    for (const prop of obj.properties) {
      if (prop.type === "comment") {
        const text = extractDocComment(prop.text);
        if (text !== null) {
          pendingComments.push(text);
        } else {
          // Non-doc comment, clear pending
          pendingComments.length = 0;
        }
        continue;
      }

      if (prop.type === "break") {
        // Clear pending comments on blank lines
        pendingComments.length = 0;
        continue;
      }

      if (prop.type === "attribute") {
        // Block-level attribute (@@map, @@ignore, etc.) — clear pending
        pendingComments.length = 0;
        continue;
      }

      // It's a Field
      const field = prop as Field;

      // Grab comments then clear for next field
      const fieldCommentParts = [...pendingComments];
      pendingComments.length = 0;

      // Skip relation fields
      if (isRelationField(field)) continue;

      // Skip @ignore fields
      if (hasFieldIgnore(field)) continue;

      // Determine the field's doc comment
      const fieldComment = collectDocComments(fieldCommentParts);
      if (fieldComment === null) continue; // No comment => nothing to sync

      const fieldDbName = getMapName(field.attributes) ?? field.name;

      fields.push({
        name: field.name,
        dbName: fieldDbName,
        comment: fieldComment,
      });
    }

    // Only include models that have a comment or have fields with comments
    if (modelComment !== null || fields.length > 0) {
      models.push({
        name: obj.name,
        dbName,
        comment: modelComment,
        fields,
      });
    }
  }

  return models;
}
