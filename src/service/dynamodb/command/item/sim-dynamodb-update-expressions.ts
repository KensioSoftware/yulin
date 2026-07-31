import { parseSimDynamoDbCondition } from "../../expression/condition/sim-dynamodb-condition-expression.js";
import type { SimDynamoDbCondition } from "../../expression/condition/sim-dynamodb-condition.js";
import type { SimDynamoDbExpressionParameterInput } from "../../expression/sim-dynamodb-expression-parameters.js";
import { SimDynamoDbExpressionParameters } from "../../expression/sim-dynamodb-expression-parameters.js";
import { parseSimDynamoDbUpdate } from "../../expression/update/sim-dynamodb-update-expression.js";
import type { SimDynamoDbUpdate } from "../../expression/update/sim-dynamodb-update.js";

/**
 * The two expressions an UpdateItem request can carry.
 */
export interface SimDynamoDbUpdateExpressionInput extends SimDynamoDbExpressionParameterInput {
  readonly UpdateExpression?: string | undefined;
  readonly ConditionExpression?: string | undefined;
}

/**
 * What a request's expressions say, once both have been read.
 */
export interface SimDynamoDbUpdateExpressions {
  readonly update: SimDynamoDbUpdate;
  readonly condition: SimDynamoDbCondition | undefined;
}

/**
 * Read both expressions of an update against one set of placeholders.
 *
 * `ExpressionAttributeNames` and `ExpressionAttributeValues` are shared between
 * them, so they are checked once both have been read. A placeholder used by
 * either counts as used, and one used by neither is refused.
 */
export function readSimDynamoDbUpdateExpressions(
  input: SimDynamoDbUpdateExpressionInput,
  expression: string,
): SimDynamoDbUpdateExpressions {
  const parameters = new SimDynamoDbExpressionParameters(input);
  const update = parseSimDynamoDbUpdate(expression, parameters);
  const condition = conditionIn(input.ConditionExpression, parameters);

  parameters.assertAllUsed();

  return { update, condition };
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
