import type { SimGlueExpressionCursor } from "./sim-glue-expression-cursor.js";
import type { SimGluePartitionColumn } from "./sim-glue-partition-columns.js";
import {
  simGlueBetweenFilter,
  simGlueComparisonFilter,
  simGlueInFilter,
} from "./sim-glue-partition-comparisons.js";
import {
  simGlueNotFilter,
  type SimGluePartitionFilter,
} from "./sim-glue-partition-filter.js";
import { simGlueLikeFilter } from "./sim-glue-partition-like.js";
import type { SimGluePartitionOperands } from "./sim-glue-partition-operands.js";

interface SimGluePartitionTermParserProperties {
  readonly cursor: SimGlueExpressionCursor;
  readonly operands: SimGluePartitionOperands;
}

/**
 * Reads one test an expression makes against one partition key.
 *
 * A term is a key, an operator and what the operator takes. `NOT` in front of
 * `LIKE`, `IN` or `BETWEEN` reverses the term it belongs to. That is a
 * different thing from the `NOT` reversing a whole bracketed group, which the
 * expression parser reads.
 */
export class SimGluePartitionTermParser {
  readonly #cursor: SimGlueExpressionCursor;
  readonly #operands: SimGluePartitionOperands;

  constructor(properties: SimGluePartitionTermParserProperties) {
    this.#cursor = properties.cursor;
    this.#operands = properties.operands;
  }

  /** Read one term. */
  parse(): SimGluePartitionFilter {
    const column = this.#operands.column();
    const negated = this.#cursor.takeKeyword("NOT");
    const filter = this.#operation(column, negated);

    return negated ? simGlueNotFilter(filter) : filter;
  }

  /** Read the operator this term uses, and whatever it takes. */
  #operation(
    column: SimGluePartitionColumn,
    negated: boolean,
  ): SimGluePartitionFilter {
    if (this.#cursor.takeKeyword("LIKE")) {
      return simGlueLikeFilter(column, this.#operands.literal(column));
    }

    if (this.#cursor.takeKeyword("IN")) {
      return simGlueInFilter(column, this.#operands.literalList(column));
    }

    if (this.#cursor.takeKeyword("BETWEEN")) {
      return this.#between(column);
    }

    if (negated) {
      throw this.#cursor.error("LIKE, IN or BETWEEN was expected after NOT");
    }

    return simGlueComparisonFilter(
      column,
      this.#operands.comparator(),
      this.#operands.literal(column),
    );
  }

  /** Read `key BETWEEN lower AND upper`, both ends included. */
  #between(column: SimGluePartitionColumn): SimGluePartitionFilter {
    const lower = this.#operands.literal(column);
    this.#cursor.expectKeyword("AND");

    return simGlueBetweenFilter(column, lower, this.#operands.literal(column));
  }
}
