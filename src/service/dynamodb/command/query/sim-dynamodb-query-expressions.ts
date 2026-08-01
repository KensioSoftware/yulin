import { parseSimDynamoDbFilter } from "../../expression/filter/sim-dynamodb-filter-expression.js";
import type { SimDynamoDbFilter } from "../../expression/filter/sim-dynamodb-filter.js";
import { readSimDynamoDbKeyCondition } from "../../expression/key-condition/sim-dynamodb-key-condition-expression.js";
import type { SimDynamoDbKeyConditionTerms } from "../../expression/key-condition/sim-dynamodb-key-condition-terms.js";
import { SimDynamoDbExpressionParameters } from "../../expression/sim-dynamodb-expression-parameters.js";
import type { SimQueryCommandInput } from "./query.command.js";

/**
 * What a query's expressions say, once both have been read.
 */
export interface SimDynamoDbQueryExpressions {
  readonly terms: SimDynamoDbKeyConditionTerms;
  readonly filter: SimDynamoDbFilter | undefined;
}

/**
 * Read both expressions of a query against one set of placeholders.
 *
 * `ExpressionAttributeNames` and `ExpressionAttributeValues` are shared between
 * them, so they are checked once both have been read. A placeholder used by
 * either counts as used, and one used by neither is refused.
 *
 * Both are read before the table is reached, so an expression DynamoDB would
 * refuse is refused whether or not the table is there. What is left is the part
 * that needs the key schema, which each of them is held to once the table has
 * been found.
 */
export function readSimDynamoDbQueryExpressions(
  input: SimQueryCommandInput,
): SimDynamoDbQueryExpressions {
  const parameters = new SimDynamoDbExpressionParameters(input);
  const terms = readSimDynamoDbKeyCondition(input, parameters);
  const filter = filterIn(input.FilterExpression, parameters);

  parameters.assertAllUsed();

  return { terms, filter };
}

/**
 * Read the filter a query drops read items by, if it names one.
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
