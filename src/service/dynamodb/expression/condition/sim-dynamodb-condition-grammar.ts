import type { SimDynamoDbExpressionParameters } from "../sim-dynamodb-expression-parameters.js";
import { SimDynamoDbExpressionTokens } from "../sim-dynamodb-expression-tokens.js";
import { SimDynamoDbConditionParser } from "./sim-dynamodb-condition-parser.js";

/**
 * Build a parser for one expression written in the condition grammar.
 *
 * The same grammar arrives as a `ConditionExpression` on a write and as a
 * `FilterExpression` on a read, so the name a refusal carries is passed in.
 * Nothing else about them differs.
 */
export function simDynamoDbConditionParser(
  expressionName: string,
  expression: string,
  parameters: SimDynamoDbExpressionParameters,
): SimDynamoDbConditionParser {
  return new SimDynamoDbConditionParser({
    tokens: SimDynamoDbExpressionTokens.of(
      expressionName,
      expression,
      "the expression says nothing, and an expression cannot be empty",
    ),
    names: parameters.names,
    values: parameters.values,
  });
}
