import { simDynamoDbValuesEqual } from "../../item/sim-dynamodb-value-comparison.js";
import {
  compareSimDynamoDbValues,
  simDynamoDbOrderHolds,
} from "../../item/sim-dynamodb-value-order.js";
import type { SimDynamoDbValue } from "../../item/sim-dynamodb-value.js";
import type { SimDynamoDbKeyConditionTerm } from "./sim-dynamodb-key-condition-term.js";

interface SimDynamoDbComparisonKeyTermProperties {
  readonly attributeName: string;
  readonly operator: string;
  readonly value: SimDynamoDbValue;
}

/**
 * A key attribute compared against one value.
 *
 * This is the only term the partition key can carry, and only with `=`, since a
 * query reads one item collection and a range of partition keys would be
 * several. The value it holds is therefore also the value a collection is found
 * by.
 */
export class SimDynamoDbComparisonKeyTerm implements SimDynamoDbKeyConditionTerm {
  public readonly attributeName: string;
  public readonly operator: string;
  public readonly value: SimDynamoDbValue;

  constructor(properties: SimDynamoDbComparisonKeyTermProperties) {
    this.attributeName = properties.attributeName;
    this.operator = properties.operator;
    this.value = properties.value;
  }

  /**
   * Whether a key value stands in the relation the operator asked for.
   */
  holdsFor(value: SimDynamoDbValue): boolean {
    if (this.operator === "=") {
      return simDynamoDbValuesEqual(value, this.value);
    }

    const order = compareSimDynamoDbValues(value, this.value);

    if (order === undefined) {
      return false;
    }

    return simDynamoDbOrderHolds(this.operator, order);
  }

  /**
   * Every scalar key type compares and orders, so there is nothing to refuse.
   */
  assertUsableOn(): void {
    return;
  }
}
