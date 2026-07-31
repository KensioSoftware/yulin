import { parseSimDynamoDbCondition } from "../../expression/condition/sim-dynamodb-condition-expression.js";
import type { SimDynamoDbCondition } from "../../expression/condition/sim-dynamodb-condition.js";
import type { SimDynamoDbExpressionParameterInput } from "../../expression/sim-dynamodb-expression-parameters.js";
import { SimDynamoDbExpressionParameters } from "../../expression/sim-dynamodb-expression-parameters.js";
import { parseSimDynamoDbUpdate } from "../../expression/update/sim-dynamodb-update-expression.js";
import type { SimDynamoDbUpdate } from "../../expression/update/sim-dynamodb-update.js";
import type { SimDynamoDbItem } from "../../item/sim-dynamodb-item.js";
import { SimDynamoDbConditionCheck } from "./sim-dynamodb-condition-check.js";

interface SimDynamoDbUpdatePlanInput extends SimDynamoDbExpressionParameterInput {
  readonly UpdateExpression?: string | undefined;
  readonly ConditionExpression?: string | undefined;
  readonly ReturnValuesOnConditionCheckFailure?: string | undefined;
}

interface SimDynamoDbUpdatePlanProperties {
  readonly update: SimDynamoDbUpdate | undefined;
  readonly check: SimDynamoDbConditionCheck;
}

/**
 * What an UpdateItem request says to do, and what it is guarded by.
 *
 * An update carries two expressions, and both draw on the same
 * `ExpressionAttributeNames` and `ExpressionAttributeValues`. Reading them
 * together is what lets a placeholder used by either count as used, so a
 * request naming one only in its UpdateExpression is not refused for it.
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

    const parameters = new SimDynamoDbExpressionParameters(input);
    const update = parseSimDynamoDbUpdate(expression, parameters);
    const condition = conditionIn(input.ConditionExpression, parameters);

    parameters.assertAllUsed();

    return new this({
      update,
      check: SimDynamoDbConditionCheck.of(condition, input, operation),
    });
  }

  /**
   * Refuse an update that would move the item's primary key.
   */
  assertLeavesKeyAlone(keyAttributeNames: readonly string[]): void {
    this.update?.assertLeavesKeyAlone(keyAttributeNames);
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

/**
 * Read the condition guarding an update, if it names one.
 */
function conditionIn(
  expression: string | undefined,
  parameters: SimDynamoDbExpressionParameters,
): SimDynamoDbCondition | undefined {
  if (expression === undefined) {
    return undefined;
  }

  return parseSimDynamoDbCondition(expression, parameters);
}
