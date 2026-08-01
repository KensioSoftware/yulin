import { compareSimDynamoDbValues } from "../../item/sim-dynamodb-value-order.js";
import type { SimDynamoDbValue } from "../../item/sim-dynamodb-value.js";
import { simDynamoDbKeyConditionError } from "./sim-dynamodb-key-condition-error.js";
import type { SimDynamoDbKeyConditionTerm } from "./sim-dynamodb-key-condition-term.js";

interface SimDynamoDbBetweenKeyTermProperties {
  readonly attributeName: string;
  readonly lower: SimDynamoDbValue;
  readonly upper: SimDynamoDbValue;
}

/**
 * A sort key between two bounds, both of which count as inside.
 */
export class SimDynamoDbBetweenKeyTerm implements SimDynamoDbKeyConditionTerm {
  public readonly attributeName: string;
  public readonly operator = "BETWEEN";

  private readonly lower: SimDynamoDbValue;
  private readonly upper: SimDynamoDbValue;

  constructor(properties: SimDynamoDbBetweenKeyTermProperties) {
    this.attributeName = properties.attributeName;
    this.lower = properties.lower;
    this.upper = properties.upper;

    this.assertBoundsOrdered();
  }

  /**
   * Whether a key value is at or between the two bounds.
   */
  holdsFor(value: SimDynamoDbValue): boolean {
    const aboveLower = compareSimDynamoDbValues(value, this.lower);
    const belowUpper = compareSimDynamoDbValues(value, this.upper);

    if (aboveLower === undefined || belowUpper === undefined) {
      return false;
    }

    return aboveLower >= 0 && belowUpper <= 0;
  }

  /**
   * Both bounds are ordinary key values, so there is nothing to refuse.
   */
  assertUsableOn(): void {
    return;
  }

  /**
   * Refuse a range that runs backwards, or whose bounds are different types.
   *
   * Real DynamoDB refuses both. A backwards range names no items at all, and
   * bounds of two types have no order to sit between, so either one is a
   * request that cannot mean what it says.
   */
  private assertBoundsOrdered(): void {
    const order = compareSimDynamoDbValues(this.lower, this.upper);

    if (order === undefined) {
      throw simDynamoDbKeyConditionError(
        `the BETWEEN bounds on ${this.attributeName} are not the same type, ` +
          `so nothing can sit between them`,
      );
    }

    if (order > 0) {
      throw simDynamoDbKeyConditionError(
        `the BETWEEN operator on ${this.attributeName} requires an upper ` +
          `bound at or above its lower bound`,
      );
    }
  }
}
