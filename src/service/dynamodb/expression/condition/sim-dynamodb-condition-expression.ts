import type { SimDynamoDbExpressionParameterInput } from "../sim-dynamodb-expression-parameters.js";
import { SimDynamoDbExpressionParameters } from "../sim-dynamodb-expression-parameters.js";
import type { SimDynamoDbCondition } from "./sim-dynamodb-condition.js";
import { simDynamoDbConditionParser } from "./sim-dynamodb-condition-grammar.js";

const expressionName = "ConditionExpression";

interface SimDynamoDbConditionRequest extends SimDynamoDbExpressionParameterInput {
  readonly ConditionExpression?: string | undefined;
}

/**
 * Read the condition a write is guarded by, if it names one.
 *
 * A request with no ConditionExpression is an unconditional write, so there is
 * nothing to check.
 */
export function readSimDynamoDbCondition(
  request: SimDynamoDbConditionRequest,
): SimDynamoDbCondition | undefined {
  const expression = request.ConditionExpression;

  if (expression === undefined) {
    SimDynamoDbExpressionParameters.assertNoneWithout(request);

    return undefined;
  }

  const parameters = new SimDynamoDbExpressionParameters(request);
  const condition = parseSimDynamoDbCondition(expression, parameters);

  parameters.assertAllUsed();

  return condition;
}

/**
 * Read one ConditionExpression against placeholders that have already been
 * gathered.
 *
 * A request can carry a condition alongside another expression, and both draw
 * on the same `ExpressionAttributeNames` and `ExpressionAttributeValues`.
 * Parsing against the parameters rather than against the request is what lets
 * an UpdateItem check its placeholders once both of its expressions have been
 * read.
 */
export function parseSimDynamoDbCondition(
  expression: string,
  parameters: SimDynamoDbExpressionParameters,
): SimDynamoDbCondition {
  return simDynamoDbConditionParser(
    expressionName,
    expression,
    parameters,
  ).parse();
}
