import type { SimGlueExpressionCursor } from "./sim-glue-expression-cursor.js";
import { simGlueExpressionAt } from "./sim-glue-expression-error.js";
import type {
  SimGluePartitionColumn,
  SimGluePartitionColumns,
} from "./sim-glue-partition-columns.js";
import {
  simGluePartitionLiteral,
  type SimGluePartitionLiteral,
} from "./sim-glue-partition-literal.js";
import {
  simGlueComparisonTest,
  type SimGlueOrderTest,
} from "./sim-glue-partition-order.js";

interface SimGluePartitionOperandsProperties {
  readonly cursor: SimGlueExpressionCursor;
  readonly columns: SimGluePartitionColumns;
}

/**
 * The pieces a term is written out of.
 *
 * A partition key, an operator and a literal are read the same way wherever
 * they appear, and what a term does with them is the parser's business.
 */
export class SimGluePartitionOperands {
  readonly #cursor: SimGlueExpressionCursor;
  readonly #columns: SimGluePartitionColumns;

  constructor(properties: SimGluePartitionOperandsProperties) {
    this.#cursor = properties.cursor;
    this.#columns = properties.columns;
  }

  /** Read a partition key, refusing one the table does not declare. */
  column(): SimGluePartitionColumn {
    const token = this.#cursor.next("a partition key");

    if (token.kind !== "name") {
      throw this.#cursor.error(
        `a partition key was expected, and '${token.text}' is not a name`,
      );
    }

    const column = this.#columns.find(token.text);

    if (column === undefined) {
      throw this.#cursor.error(
        `${token.text} is not a partition key of this table, which is ` +
          `partitioned by ${this.#columns.names.join(", ")}`,
      );
    }

    return column;
  }

  /** Read one comparison operator, and the test it makes. */
  comparator(): SimGlueOrderTest {
    const token = this.#cursor.next("a comparison operator");
    const holds =
      token.kind === "symbol" ? simGlueComparisonTest(token.text) : undefined;

    if (holds === undefined) {
      throw this.#cursor.error(`'${token.text}' is not a comparison operator`);
    }

    return holds;
  }

  /** Read one literal, held to the type its column is declared with. */
  literal(column: SimGluePartitionColumn): SimGluePartitionLiteral {
    const token = this.#cursor.next(`a value for ${column.name}`);

    return simGluePartitionLiteral(
      column,
      token,
      simGlueExpressionAt(this.#cursor.peek()),
    );
  }

  /** Read `(a, b, c)`, the values an `IN` accepts. */
  literalList(
    column: SimGluePartitionColumn,
  ): readonly SimGluePartitionLiteral[] {
    this.#cursor.expectSymbol("(");

    const literals = [this.literal(column)];

    while (this.#cursor.takeSymbol(",")) {
      literals.push(this.literal(column));
    }

    this.#cursor.expectSymbol(")");

    return literals;
  }
}
