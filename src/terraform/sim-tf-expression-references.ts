import { isRecord } from "../util/type-guard/record.js";

/**
 * Every `references` entry anywhere inside an expression.
 *
 * A plan writes an expression as a record holding `references`, and nests
 * that record wherever the configuration nested the expression. A nested block
 * becomes a list of records, and a block inside a block becomes a list inside
 * a record, so reaching every reference means walking whatever shape the
 * configuration had rather than reading one key.
 */
export function terraformExpressionReferences(
  value: unknown,
): readonly string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => terraformExpressionReferences(entry));
  }

  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([key, nested]) =>
    key === "references" && Array.isArray(nested)
      ? nested.filter((entry): entry is string => typeof entry === "string")
      : terraformExpressionReferences(nested),
  );
}
