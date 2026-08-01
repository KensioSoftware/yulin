import { simDynamoDbValuesEqual } from "../../item/sim-dynamodb-value-comparison.js";
import {
  compareSimDynamoDbValues,
  simDynamoDbOrderHolds,
} from "../../item/sim-dynamodb-value-order.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimDynamoDbScalarAttributeType } from "../../command/table/table.types.js";
import type { SimDynamoDbValue } from "../../item/sim-dynamodb-value.js";
import {
  assertSimDynamoDbKeyValueType,
  type SimDynamoDbKeyConditionTerm,
} from "./sim-dynamodb-key-condition-term.js";

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
   *
   * The two sides always order. Both are the type the table declared for the
   * key attribute: the stored one because a write that broke that was refused,
   * and the supplied one because `assertUsableOn` refused the query.
   */
  holdsFor(value: SimDynamoDbValue): boolean {
    if (this.operator === "=") {
      return simDynamoDbValuesEqual(value, this.value);
    }

    const order = compareSimDynamoDbValues(value, this.value);

    assertDefined(order, `order of two ${this.attributeName} key values`);

    return simDynamoDbOrderHolds(this.operator, order);
  }

  /**
   * Refuse a value of a type the key attribute was not declared as.
   *
   * Every scalar key type compares and orders, so the operator is always fine.
   * What has to match is the value it compares against.
   */
  assertUsableOn(type: SimDynamoDbScalarAttributeType): void {
    assertSimDynamoDbKeyValueType(this.attributeName, this.value, type);
  }
}
