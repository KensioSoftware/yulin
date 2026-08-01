import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import type { SimDynamoDbExpressionParameterInput } from "../sim-dynamodb-expression-parameters.js";
import { SimDynamoDbExpressionParameters } from "../sim-dynamodb-expression-parameters.js";
import { SimDynamoDbExpressionTokens } from "../sim-dynamodb-expression-tokens.js";
import { keyConditionExpressionName } from "./sim-dynamodb-key-condition-error.js";
import { SimDynamoDbKeyConditionParser } from "./sim-dynamodb-key-condition-parser.js";
import { SimDynamoDbKeyConditionTerms } from "./sim-dynamodb-key-condition-terms.js";

interface SimDynamoDbKeyConditionRequest extends SimDynamoDbExpressionParameterInput {
  readonly KeyConditionExpression?: string | undefined;
}

/**
 * Read the key condition a query walks its item collection by.
 *
 * A query names one item collection, so unlike every other expression parameter
 * this one is required rather than optional: a request without it is asking for
 * a scan.
 */
export function readSimDynamoDbKeyCondition(
  request: SimDynamoDbKeyConditionRequest,
): SimDynamoDbKeyConditionTerms {
  const expression = request.KeyConditionExpression;

  if (expression === undefined) {
    throw new SimDynamoDbValidationException(
      "A KeyConditionExpression is required, since a query reads the items " +
        "under one partition key",
    );
  }

  const parameters = new SimDynamoDbExpressionParameters(request);
  const terms = new SimDynamoDbKeyConditionParser({
    tokens: SimDynamoDbExpressionTokens.of(
      keyConditionExpressionName,
      expression,
      "the expression says nothing, and an expression cannot be empty",
    ),
    names: parameters.names,
    values: parameters.values,
  }).parse();

  parameters.assertAllUsed();

  return new SimDynamoDbKeyConditionTerms(terms);
}
