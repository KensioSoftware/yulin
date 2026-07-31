import { simDynamoDbValuesEqual } from "../../item/sim-dynamodb-value-comparison.js";
import { compareSimDynamoDbValues } from "../../item/sim-dynamodb-value-order.js";
import type { SimDynamoDbValue } from "../../item/sim-dynamodb-value.js";
import type { SimDynamoDbCondition } from "./sim-dynamodb-condition.js";
import type { SimDynamoDbConditionOperand } from "./sim-dynamodb-condition-operand.js";
import type { SimDynamoDbItemSnapshot } from "../sim-dynamodb-item-snapshot.js";

/**
 * The comparators a condition expression can put between two operands.
 */
export const simDynamoDbComparators: ReadonlySet<string> = new Set([
  "=",
  "<>",
  "<",
  "<=",
  ">",
  ">=",
]);

/**
 * Whether an ordering satisfies a comparator.
 *
 * Only the four ordering comparators reach here, so the last of them is the
 * remaining case. `=` and `<>` are answered by equality before this is asked.
 */
function ordered(comparator: string, order: number): boolean {
  switch (comparator) {
    case "<": {
      return order < 0;
    }
    case "<=": {
      return order <= 0;
    }
    case ">": {
      return order > 0;
    }
    default: {
      return order >= 0;
    }
  }
}

/**
 * Two operands compared against each other.
 *
 * A comparison between two types is never an error, which is what lets one
 * condition guard items that do not all carry the same attributes. What it
 * answers depends on the comparator. Equality works across types, so a string
 * and a number are not equal: `=` is false and `<>` is true. Ordering does
 * not, so `<`, `<=`, `>` and `>=` are all false between them.
 */
export class SimDynamoDbComparisonCondition implements SimDynamoDbCondition {
  private readonly left: SimDynamoDbConditionOperand;
  private readonly comparator: string;
  private readonly right: SimDynamoDbConditionOperand;

  constructor(
    left: SimDynamoDbConditionOperand,
    comparator: string,
    right: SimDynamoDbConditionOperand,
  ) {
    this.left = left;
    this.comparator = comparator;
    this.right = right;
  }

  /**
   * Whether the two operands stand in the relation the comparator asked for.
   */
  holdsFor(subject: SimDynamoDbItemSnapshot): boolean {
    const left = this.left.valueIn(subject);
    const right = this.right.valueIn(subject);

    if (left === undefined || right === undefined) {
      return false;
    }

    return this.holdsBetween(left, right);
  }

  private holdsBetween(
    left: SimDynamoDbValue,
    right: SimDynamoDbValue,
  ): boolean {
    if (this.comparator === "=") {
      return simDynamoDbValuesEqual(left, right);
    }

    if (this.comparator === "<>") {
      return !simDynamoDbValuesEqual(left, right);
    }

    const order = compareSimDynamoDbValues(left, right);

    if (order === undefined) {
      return false;
    }

    return ordered(this.comparator, order);
  }
}

/**
 * An operand between two bounds, both of which count as inside.
 */
export class SimDynamoDbBetweenCondition implements SimDynamoDbCondition {
  private readonly aboveLower: SimDynamoDbComparisonCondition;
  private readonly belowUpper: SimDynamoDbComparisonCondition;

  constructor(
    operand: SimDynamoDbConditionOperand,
    lower: SimDynamoDbConditionOperand,
    upper: SimDynamoDbConditionOperand,
  ) {
    this.aboveLower = new SimDynamoDbComparisonCondition(lower, "<=", operand);
    this.belowUpper = new SimDynamoDbComparisonCondition(operand, "<=", upper);
  }

  /**
   * Whether the operand is at or between the two bounds.
   */
  holdsFor(subject: SimDynamoDbItemSnapshot): boolean {
    return (
      this.aboveLower.holdsFor(subject) && this.belowUpper.holdsFor(subject)
    );
  }
}

/**
 * An operand equal to any one of a list of others.
 */
export class SimDynamoDbInCondition implements SimDynamoDbCondition {
  private readonly operand: SimDynamoDbConditionOperand;
  private readonly candidates: readonly SimDynamoDbConditionOperand[];

  constructor(
    operand: SimDynamoDbConditionOperand,
    candidates: readonly SimDynamoDbConditionOperand[],
  ) {
    this.operand = operand;
    this.candidates = candidates;
  }

  /**
   * Whether the operand equals any one of the candidates.
   */
  holdsFor(subject: SimDynamoDbItemSnapshot): boolean {
    const value = this.operand.valueIn(subject);

    if (value === undefined) {
      return false;
    }

    return this.candidates.some((candidate) => {
      const other = candidate.valueIn(subject);

      return other !== undefined && simDynamoDbValuesEqual(value, other);
    });
  }
}
