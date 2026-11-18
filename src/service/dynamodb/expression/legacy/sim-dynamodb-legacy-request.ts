import type { SimDynamoDbLegacyComparison } from "./sim-dynamodb-legacy-comparison.js";
import { simDynamoDbLegacyComparison } from "./sim-dynamodb-legacy-comparison.js";
import {
  simDynamoDbLegacyConditions,
  simDynamoDbLegacyExpectation,
} from "./sim-dynamodb-legacy-conditions.js";
import type { SimDynamoDbLegacyInput } from "./sim-dynamodb-legacy.types.js";
import {
  assertSimDynamoDbLegacyInputShape,
  simDynamoDbLegacyParametersOf,
} from "./sim-dynamodb-legacy-input.js";
import { SimDynamoDbLegacyPlaceholders } from "./sim-dynamodb-legacy-placeholders.js";
import {
  simDynamoDbLegacyKeyConditions,
  simDynamoDbLegacyProjection,
} from "./sim-dynamodb-legacy-reads.js";
import { simDynamoDbLegacyUpdate } from "./sim-dynamodb-legacy-update.js";

/**
 * Rewrite a request's legacy parameters as the expressions that replaced them.
 *
 * AWS still answers every legacy parameter, and documents each as equivalent
 * to an expression. Rewriting the request means each is evaluated by the same
 * code as the expression it stands for, and authorized the same way. A request
 * carrying none comes back as it was.
 *
 * AWS refuses a request that mixes legacy parameters with expressions, and a
 * legacy request carrying placeholders of its own, so both are refused here
 * before anything is rewritten.
 */
export function simDynamoDbExpressionsOf<Input extends SimDynamoDbLegacyInput>(
  input: Input,
): Input {
  const legacy = simDynamoDbLegacyParametersOf(input);

  if (legacy.length === 0) {
    return input;
  }

  assertSimDynamoDbLegacyInputShape(input, legacy);

  return rewrite(input);
}

/**
 * Rewrite a legacy request that has passed every check on its shape.
 */
function rewrite<Input extends SimDynamoDbLegacyInput>(input: Input): Input {
  const placeholders = new SimDynamoDbLegacyPlaceholders();
  const compare = (
    attribute: string,
    condition: SimDynamoDbLegacyComparison,
  ): string => simDynamoDbLegacyComparison(attribute, condition, placeholders);
  const rewritten = {
    ProjectionExpression: simDynamoDbLegacyProjection(
      input.AttributesToGet,
      placeholders,
    ),
    KeyConditionExpression: simDynamoDbLegacyKeyConditions(
      input.KeyConditions,
      placeholders,
    ),
    FilterExpression: simDynamoDbLegacyConditions(
      input.QueryFilter ?? input.ScanFilter,
      input.ConditionalOperator,
      compare,
    ),
    UpdateExpression: simDynamoDbLegacyUpdate(
      input.AttributeUpdates ?? {},
      placeholders,
    ),
    ConditionExpression: simDynamoDbLegacyConditions(
      input.Expected,
      input.ConditionalOperator,
      (attribute, expected) =>
        simDynamoDbLegacyExpectation(attribute, expected, placeholders),
    ),
  };

  return {
    ...input,
    AttributesToGet: undefined,
    AttributeUpdates: undefined,
    ConditionalOperator: undefined,
    Expected: undefined,
    KeyConditions: undefined,
    QueryFilter: undefined,
    ScanFilter: undefined,
    ...rewritten,
    ...placeholders.parameters,
  };
}
