import type { SimGlueColumn } from "../table/sim-glue-table-schema.js";
import { SimGluePartitionColumns } from "./sim-glue-partition-columns.js";
import { SimGluePartitionExpressionParser } from "./sim-glue-partition-expression-parser.js";
import type { SimGluePartitionFilter } from "./sim-glue-partition-filter.js";

/**
 * Read a `GetPartitions` `Expression` against the table it filters.
 *
 * The table is needed to read the expression at all. Which names are partition
 * keys and how each one's values are ordered are both properties of the table,
 * so an expression naming a column the table lacks is refused here rather than
 * matching nothing.
 */
export function simGluePartitionExpressionFilter(
  expression: string,
  partitionKeys: readonly SimGlueColumn[],
): SimGluePartitionFilter {
  return new SimGluePartitionExpressionParser(
    expression,
    new SimGluePartitionColumns(partitionKeys),
  ).parse();
}
