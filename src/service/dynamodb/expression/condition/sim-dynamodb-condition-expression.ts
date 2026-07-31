import type { SimDynamoDbExpressionParameterInput } from "../sim-dynamodb-expression-parameters.js";
import { SimDynamoDbExpressionParameters } from "../sim-dynamodb-expression-parameters.js";
import { SimDynamoDbExpressionTokens } from "../sim-dynamodb-expression-tokens.js";
import type { SimDynamoDbCondition } from "./sim-dynamodb-condition.js";
import { SimDynamoDbConditionParser } from "./sim-dynamodb-condition-parser.js";

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
  const condition = new SimDynamoDbConditionParser({
    tokens: SimDynamoDbExpressionTokens.of(
      expressionName,
      expression,
      "the expression says nothing, and an expression cannot be empty",
    ),
    names: parameters.names,
    values: parameters.values,
  }).parse();

  parameters.assertAllUsed();

  return condition;
}
