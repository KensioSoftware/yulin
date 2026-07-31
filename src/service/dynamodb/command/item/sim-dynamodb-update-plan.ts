import { SimDynamoDbProjection } from "../../expression/projection/sim-dynamodb-projection.js";
import { updateExpressionName } from "../../expression/update/sim-dynamodb-update-refusal.js";
import type { SimDynamoDbUpdate } from "../../expression/update/sim-dynamodb-update.js";
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
}

/**
 * What an UpdateItem request says to do, and what it is guarded by.
 */
export class SimDynamoDbUpdatePlan {
  public readonly check: SimDynamoDbConditionCheck;

  private readonly update: SimDynamoDbUpdate | undefined;

  private constructor(properties: SimDynamoDbUpdatePlanProperties) {
    this.update = properties.update;
    this.check = properties.check;
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
      return new this({
        update: undefined,
        check: SimDynamoDbConditionCheck.read(input, operation),
      });
    }

    const read = readSimDynamoDbUpdateExpressions(input, expression);

    return new this({
      update: read.update,
      check: SimDynamoDbConditionCheck.of(read.condition, input, operation),
    });
  }

  /**
   * Refuse an update that would move the item's primary key.
   */
  assertLeavesKeyAlone(keyAttributeNames: readonly string[]): void {
    this.update?.assertLeavesKeyAlone(keyAttributeNames);
  }

  /**
   * The parts of an item this update touched, for the reporting modes that
   * answer with those and nothing else.
   *
   * A request that says nothing to change touched nothing, so the projection it
   * answers with finds nothing in either item.
   */
  touched(): SimDynamoDbProjection {
    return (
      this.update?.touched() ??
      new SimDynamoDbProjection({
        expressionName: updateExpressionName,
        paths: [],
      })
    );
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
