import type { SimDynamoDbProjection } from "../../expression/projection/sim-dynamodb-projection.js";
import type { SimDynamoDbUpdate } from "../../expression/update/sim-dynamodb-update.js";
import { simDynamoDbTouchedBy } from "./sim-dynamodb-update-touched.js";
import type { SimDynamoDbItem } from "../../item/sim-dynamodb-item.js";
import { SimDynamoDbConditionCheck } from "./sim-dynamodb-condition-check.js";
import {
  readSimDynamoDbUpdateExpressions,
  type SimDynamoDbUpdateExpressionInput,
} from "./sim-dynamodb-update-expressions.js";

interface SimDynamoDbUpdatePlanInput extends SimDynamoDbUpdateExpressionInput {
  readonly ReturnValuesOnConditionCheckFailure?: string | undefined;
}

interface SimDynamoDbUpdatePlanProperties {
  readonly update: SimDynamoDbUpdate | undefined;
  readonly check: SimDynamoDbConditionCheck;
  readonly attributeNames: readonly string[];
}

/**
 * What an UpdateItem request says to do, and what it is guarded by.
 */
export class SimDynamoDbUpdatePlan {
  public readonly check: SimDynamoDbConditionCheck;

  /**
   * The top-level attributes both expressions named, for
   * `dynamodb:Attributes`. They share one set of placeholders, so the update
   * and the condition guarding it are gathered together.
   */
  public readonly attributeNames: readonly string[];

  private readonly update: SimDynamoDbUpdate | undefined;

  private constructor(properties: SimDynamoDbUpdatePlanProperties) {
    this.update = properties.update;
    this.check = properties.check;
    this.attributeNames = properties.attributeNames;
  }

  /**
   * Read the expressions a request carries, before anything is looked up.
   *
   * An expression DynamoDB would refuse is refused whether or not the key holds
   * anything, so a bad expression fails the same way every time.
   */
  static read(
    input: SimDynamoDbUpdatePlanInput,
    operation: string,
  ): SimDynamoDbUpdatePlan {
    const expression = input.UpdateExpression;

    if (expression === undefined) {
      const check = SimDynamoDbConditionCheck.read(input, operation);

      return new this({
        update: undefined,
        check,
        attributeNames: check.attributeNames,
      });
    }

    const read = readSimDynamoDbUpdateExpressions(input, expression);

    return new this({
      update: read.update,
      check: SimDynamoDbConditionCheck.of(read.condition, input, operation),
      attributeNames: read.attributes,
    });
  }

  /**
   * Refuse an update that would move the item's primary key.
   */
  assertLeavesKeyAlone(keyAttributeNames: readonly string[]): void {
    this.update?.assertLeavesKeyAlone(keyAttributeNames);
  }

  /**
   * The parts of an item this update touched.
   */
  touched(): SimDynamoDbProjection {
    return simDynamoDbTouchedBy(this.update);
  }

  /**
   * The item this update makes of the one that was there.
   *
   * A request with no UpdateExpression still writes: UpdateItem upserts, so it
   * leaves the stored item alone or creates one holding nothing but the Key.
   */
  applyTo(
    existing: SimDynamoDbItem | undefined,
    key: SimDynamoDbItem,
  ): SimDynamoDbItem {
    if (this.update === undefined) {
      return existing ?? key;
    }

    return this.update.applyTo(existing, key);
  }
}
