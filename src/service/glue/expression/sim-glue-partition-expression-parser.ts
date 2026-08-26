import { SimGlueExpressionCursor } from "./sim-glue-expression-cursor.js";
import type { SimGluePartitionColumns } from "./sim-glue-partition-columns.js";
import {
  simGlueAllOf,
  simGlueAnyOf,
  simGlueNotFilter,
  type SimGluePartitionFilter,
} from "./sim-glue-partition-filter.js";
import { SimGluePartitionOperands } from "./sim-glue-partition-operands.js";
import { SimGluePartitionTermParser } from "./sim-glue-partition-term-parser.js";

/**
 * Reads a `GetPartitions` `Expression` into the filter it asks for.
 *
 * The grammar is the SQL one, with the precedence SQL gives it. `NOT` binds
 * tightest, then `AND`, then `OR`, so `a = '1' OR b = '2' AND c = '3'` reads
 * as `a = '1' OR (b = '2' AND c = '3')`. Brackets say something else.
 */
export class SimGluePartitionExpressionParser {
  readonly #cursor: SimGlueExpressionCursor;
  readonly #terms: SimGluePartitionTermParser;

  constructor(expression: string, columns: SimGluePartitionColumns) {
    const cursor = new SimGlueExpressionCursor(expression);

    this.#cursor = cursor;
    this.#terms = new SimGluePartitionTermParser({
      cursor,
      operands: new SimGluePartitionOperands({ cursor, columns }),
    });
  }

  /** Read the whole expression, refusing anything left over after it. */
  parse(): SimGluePartitionFilter {
    const filter = this.#either();

    this.#assertNothingFollows();

    return filter;
  }

  /** Refuse an expression that was complete and then carried on. */
  #assertNothingFollows(): void {
    if (!this.#cursor.atEnd) {
      throw this.#cursor.error(
        "the expression was complete and then carried on",
      );
    }
  }

  /** Read one or more `AND` groups joined by `OR`. */
  #either(): SimGluePartitionFilter {
    const filters = [this.#both()];

    while (this.#cursor.takeKeyword("OR")) {
      filters.push(this.#both());
    }

    return simGlueAnyOf(filters);
  }

  /** Read one or more terms joined by `AND`. */
  #both(): SimGluePartitionFilter {
    const filters = [this.#negated()];

    while (this.#cursor.takeKeyword("AND")) {
      filters.push(this.#negated());
    }

    return simGlueAllOf(filters);
  }

  /** Read a term, or a `NOT` in front of one. */
  #negated(): SimGluePartitionFilter {
    if (this.#cursor.takeKeyword("NOT")) {
      return simGlueNotFilter(this.#negated());
    }

    return this.#grouped();
  }

  /** Read a bracketed expression, or one plain term. */
  #grouped(): SimGluePartitionFilter {
    if (!this.#cursor.takeSymbol("(")) {
      return this.#terms.parse();
    }

    const filter = this.#either();
    this.#cursor.expectSymbol(")");

    return filter;
  }
}
