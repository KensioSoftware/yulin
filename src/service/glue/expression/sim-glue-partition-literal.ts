import { simGlueExpressionError } from "./sim-glue-expression-error.js";
import type { SimGlueExpressionToken } from "./sim-glue-expression-token.js";
import type { SimGluePartitionColumn } from "./sim-glue-partition-columns.js";

/**
 * A literal an expression compares a partition key against.
 *
 * Both readings are kept. Which one a comparison uses follows the column's
 * declared type, and `LIKE` matches the text of a value whatever that type is.
 */
export interface SimGluePartitionLiteral {
  readonly text: string;
  readonly numeric: number;
}

/**
 * Read a literal an expression compares a column against.
 *
 * A column declared as a number is held to a literal that is one. Comparing it
 * against `'today'` can hold for no partition, and answering with an empty
 * list would read as a table that happens to have none.
 */
export function simGluePartitionLiteral(
  column: SimGluePartitionColumn,
  token: SimGlueExpressionToken,
  where: string,
): SimGluePartitionLiteral {
  if (token.kind !== "string" && token.kind !== "number") {
    throw simGlueExpressionError(
      `a value was expected for ${column.name}, and '${token.text}' is not one`,
      where,
    );
  }

  const numeric = simGlueNumericValue(token.text);

  if (column.comparison === "number" && Number.isNaN(numeric)) {
    throw simGlueExpressionError(
      `${column.name} is declared as a number, and '${token.text}' is not one`,
      where,
    );
  }

  return { text: token.text, numeric };
}

/**
 * What a stored partition value reads as when its key is a number.
 *
 * An empty value is not a number, which `Number` alone reads as zero.
 */
export function simGlueNumericValue(text: string): number {
  return text.trim() === "" ? NaN : Number(text);
}
