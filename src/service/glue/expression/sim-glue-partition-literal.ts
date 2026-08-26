import { simGlueDecimal, type SimGlueDecimal } from "./sim-glue-decimal.js";
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
  readonly decimal: SimGlueDecimal | undefined;
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

  const decimal = simGlueDecimal(token.text);

  if (decimal === undefined && column.comparison === "number") {
    throw simGlueExpressionError(
      `${column.name} is declared as a number, and '${token.text}' is not one`,
      where,
    );
  }

  return { text: token.text, decimal };
}
