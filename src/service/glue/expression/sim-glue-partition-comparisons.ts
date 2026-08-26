import type { SimGluePartitionColumn } from "./sim-glue-partition-columns.js";
import type { SimGluePartitionFilter } from "./sim-glue-partition-filter.js";
import type { SimGluePartitionLiteral } from "./sim-glue-partition-literal.js";
import {
  simGlueAtLeast,
  simGlueAtMost,
  simGlueColumnValue,
  simGlueEqual,
  simGluePartitionOrder,
  type SimGlueOrderTest,
} from "./sim-glue-partition-order.js";

/** A filter putting one partition key against one literal. */
export function simGlueComparisonFilter(
  column: SimGluePartitionColumn,
  holds: SimGlueOrderTest,
  literal: SimGluePartitionLiteral,
): SimGluePartitionFilter {
  return (values): boolean => {
    const placed = simGluePartitionOrder(
      column,
      simGlueColumnValue(column, values),
      literal,
    );

    return placed === undefined ? false : holds(placed);
  };
}

/** A filter holding for a key between two literals, both ends included. */
export function simGlueBetweenFilter(
  column: SimGluePartitionColumn,
  lower: SimGluePartitionLiteral,
  upper: SimGluePartitionLiteral,
): SimGluePartitionFilter {
  const atLeast = simGlueComparisonFilter(column, simGlueAtLeast, lower);
  const atMost = simGlueComparisonFilter(column, simGlueAtMost, upper);

  return (values): boolean => atLeast(values) && atMost(values);
}

/** A filter holding for a key equal to any one of these literals. */
export function simGlueInFilter(
  column: SimGluePartitionColumn,
  literals: readonly SimGluePartitionLiteral[],
): SimGluePartitionFilter {
  const equals = literals.map((literal) =>
    simGlueComparisonFilter(column, simGlueEqual, literal),
  );

  return (values): boolean => equals.some((holds) => holds(values));
}
