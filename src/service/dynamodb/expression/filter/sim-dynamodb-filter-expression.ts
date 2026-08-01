import { simDynamoDbConditionParser } from "../condition/sim-dynamodb-condition-grammar.js";
import type { SimDynamoDbExpressionParameterInput } from "../sim-dynamodb-expression-parameters.js";
import { SimDynamoDbExpressionParameters } from "../sim-dynamodb-expression-parameters.js";
import { SimDynamoDbFilter } from "./sim-dynamodb-filter.js";

const expressionName = "FilterExpression";

interface SimDynamoDbFilterRequest extends SimDynamoDbExpressionParameterInput {
  readonly FilterExpression?: string | undefined;
}

/**
 * Read the filter a read drops items by, if it names one.
 *
 * A request with no FilterExpression answers with every item it read, so there
 * is nothing to drop by.
 */
export function readSimDynamoDbFilter(
  request: SimDynamoDbFilterRequest,
): SimDynamoDbFilter | undefined {
  const expression = request.FilterExpression;

  if (expression === undefined) {
    SimDynamoDbExpressionParameters.assertNoneWithout(request);

    return undefined;
  }

  const parameters = new SimDynamoDbExpressionParameters(request);
  const filter = parseSimDynamoDbFilter(expression, parameters);

  parameters.assertAllUsed();

  return filter;
}

/**
 * Read one FilterExpression against placeholders that have already been
 * gathered.
 *
 * A query carries a key condition alongside its filter, and both draw on the
 * same `ExpressionAttributeNames` and `ExpressionAttributeValues`, so the
 * placeholders are checked once both expressions have been read.
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
