import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimDynamoDbScalarAttributeType } from "../../command/table/table.types.js";
import { compareSimDynamoDbValues } from "../../item/sim-dynamodb-value-order.js";
import type { SimDynamoDbValue } from "../../item/sim-dynamodb-value.js";
import { simDynamoDbKeyConditionError } from "./sim-dynamodb-key-condition-error.js";
import {
  assertSimDynamoDbKeyValueType,
  type SimDynamoDbKeyConditionTerm,
} from "./sim-dynamodb-key-condition-term.js";

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
   *
   * All three always order. Every one of them is the type the table declared
   * for the key attribute, which `assertUsableOn` checked before the query ran.
   */
  holdsFor(value: SimDynamoDbValue): boolean {
    const aboveLower = compareSimDynamoDbValues(value, this.lower);
    const belowUpper = compareSimDynamoDbValues(value, this.upper);

    assertDefined(
      aboveLower,
      `order against the ${this.attributeName} lower bound`,
    );
    assertDefined(
      belowUpper,
      `order against the ${this.attributeName} upper bound`,
    );

    return aboveLower >= 0 && belowUpper <= 0;
  }

  /**
   * Refuse bounds of a type the key attribute was not declared as.
   *
   * The two bounds already agree with each other, which is checked when the
   * term is built, so this is what ties them to the table.
   */
  assertUsableOn(type: SimDynamoDbScalarAttributeType): void {
    assertSimDynamoDbKeyValueType(this.attributeName, this.lower, type);
    assertSimDynamoDbKeyValueType(this.attributeName, this.upper, type);
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
