import { simDynamoDbConditionParser } from "../condition/sim-dynamodb-condition-grammar.js";
import type { SimDynamoDbExpressionParameters } from "../sim-dynamodb-expression-parameters.js";
import { SimDynamoDbFilter } from "./sim-dynamodb-filter.js";

const expressionName = "FilterExpression";

/**
 * Read one FilterExpression against placeholders that have already been
 * gathered.
 *
 * Every read that can carry a filter can carry another expression alongside it,
 * and they draw on the same `ExpressionAttributeNames` and
 * `ExpressionAttributeValues`, so the placeholders are gathered by the caller
 * and checked once every expression has been read.
 */
export function parseSimDynamoDbFilter(
  expression: string,
  parameters: SimDynamoDbExpressionParameters,
): SimDynamoDbFilter {
  const parser = simDynamoDbConditionParser(
    expressionName,
    expression,
    parameters,
  );

  return new SimDynamoDbFilter({
    condition: parser.parse(),
    paths: parser.paths,
  });
}
