import { simGlueLikeMatches } from "./sim-glue-like-match.js";
import type { SimGluePartitionColumn } from "./sim-glue-partition-columns.js";
import type { SimGluePartitionFilter } from "./sim-glue-partition-filter.js";
import type { SimGluePartitionLiteral } from "./sim-glue-partition-literal.js";
import { simGlueColumnValue } from "./sim-glue-partition-order.js";

/**
 * A filter holding where a key matches a SQL `LIKE` pattern.
 *
 * The pattern is matched against the value as it was stored, whatever type
 * the key is declared with. `LIKE` is a test on text, and a numeric key
 * compared this way is compared as the text it was registered as.
 */
export function simGlueLikeFilter(
  column: SimGluePartitionColumn,
  pattern: SimGluePartitionLiteral,
): SimGluePartitionFilter {
  return (values): boolean =>
    simGlueLikeMatches(simGlueColumnValue(column, values), pattern.text);
}
