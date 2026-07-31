import type { SimDynamoDbExpressionParameters } from "../sim-dynamodb-expression-parameters.js";
import { SimDynamoDbExpressionTokens } from "../sim-dynamodb-expression-tokens.js";
import { updateExpressionName } from "./sim-dynamodb-update-refusal.js";
import { SimDynamoDbUpdateParser } from "./sim-dynamodb-update-parser.js";
import type { SimDynamoDbUpdate } from "./sim-dynamodb-update.js";

/**
 * Read one UpdateExpression against placeholders that have already been
 * gathered.
 *
 * An update expression carries no literals, so everything it assigns arrives
 * through `ExpressionAttributeValues`. It shares those placeholders with the
 * ConditionExpression the same request may carry, which is why the parameters
 * are passed in rather than read here.
 */
export function parseSimDynamoDbUpdate(
  expression: string,
  parameters: SimDynamoDbExpressionParameters,
): SimDynamoDbUpdate {
  return new SimDynamoDbUpdateParser({
    tokens: SimDynamoDbExpressionTokens.of(
      updateExpressionName,
      expression,
      "the expression says nothing, and an expression cannot be empty",
    ),
    names: parameters.names,
    values: parameters.values,
  }).parse();
}
