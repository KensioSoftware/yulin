import { parseSimDynamoDbFilter } from "../../expression/filter/sim-dynamodb-filter-expression.js";
import type { SimDynamoDbFilter } from "../../expression/filter/sim-dynamodb-filter.js";
import { parseSimDynamoDbProjection } from "../../expression/projection/sim-dynamodb-projection-expression.js";
import type { SimDynamoDbProjection } from "../../expression/projection/sim-dynamodb-projection.js";
import { SimDynamoDbExpressionParameters } from "../../expression/sim-dynamodb-expression-parameters.js";
import type { SimScanCommandInput } from "./scan.command.js";

/**
 * What a scan's expressions say, once both have been read.
 */
export interface SimDynamoDbScanExpressions {
  readonly filter: SimDynamoDbFilter | undefined;
  readonly projection: SimDynamoDbProjection | undefined;
}

/**
 * Read both expressions of a scan against one set of placeholders.
 *
 * `ExpressionAttributeNames` and `ExpressionAttributeValues` are shared between
 * the filter and the projection, so they are checked once both have been read.
 * A placeholder used by either counts as used, and one used by neither is
 * refused.
 *
 * A scan that names neither expression is a different refusal. There is nothing
 * for a placeholder to be unused in, which is the wording real DynamoDB uses
 * for a request carrying parameters and no expression at all.
 *
 * Both are read before the table is reached, so an expression DynamoDB would
 * refuse is refused whether or not the table is there. What is left is which
 * attributes the view being read carries, which each of them is held to once
 * the table has been found.
 */
export function readSimDynamoDbScanExpressions(
  input: SimScanCommandInput,
): SimDynamoDbScanExpressions {
  if (
    input.FilterExpression === undefined &&
    input.ProjectionExpression === undefined
  ) {
    SimDynamoDbExpressionParameters.assertNoneWithout(input);

    return { filter: undefined, projection: undefined };
  }

  const parameters = new SimDynamoDbExpressionParameters(input);
  const filter = filterIn(input.FilterExpression, parameters);
  const projection = projectionIn(input.ProjectionExpression, parameters);

  parameters.assertAllUsed();

  return { filter, projection };
}

/**
 * Read the filter a scan drops read items by, if it names one.
 */
function filterIn(
  expression: string | undefined,
  parameters: SimDynamoDbExpressionParameters,
): SimDynamoDbFilter | undefined {
  if (expression === undefined) {
    return undefined;
  }

  return parseSimDynamoDbFilter(expression, parameters);
}

/**
 * Read the parts of an item a scan answers with, if it names them.
 */
function projectionIn(
  expression: string | undefined,
  parameters: SimDynamoDbExpressionParameters,
): SimDynamoDbProjection | undefined {
  if (expression === undefined) {
    return undefined;
  }

  return parseSimDynamoDbProjection(expression, parameters);
}
