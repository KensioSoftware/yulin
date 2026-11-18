import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import { SimDynamoDbExpressionParameters } from "../sim-dynamodb-expression-parameters.js";
import type { SimDynamoDbLegacyInput } from "./sim-dynamodb-legacy.types.js";

/**
 * The legacy parameters a request carries, by name.
 */
export function simDynamoDbLegacyParametersOf(
  input: SimDynamoDbLegacyInput,
): readonly string[] {
  return givenNames({
    AttributesToGet: input.AttributesToGet,
    AttributeUpdates: input.AttributeUpdates,
    ConditionalOperator: input.ConditionalOperator,
    Expected: input.Expected,
    KeyConditions: input.KeyConditions,
    QueryFilter: input.QueryFilter,
    ScanFilter: input.ScanFilter,
  });
}

/**
 * Refuse a legacy request AWS refuses for its shape.
 *
 * AWS refuses a request that mixes legacy parameters with expressions, and a
 * legacy request carrying placeholders of its own. A `ConditionalOperator` with
 * no legacy conditions to join is refused too.
 */
export function assertSimDynamoDbLegacyInputShape(
  input: SimDynamoDbLegacyInput,
  legacy: readonly string[],
): void {
  assertUnmixed(input, legacy);
  SimDynamoDbExpressionParameters.assertNoneWithout(input);
  assertSomethingToJoin(input);
}

/**
 * The names of the parameters a request gave a value.
 */
function givenNames(parameters: Readonly<Record<string, unknown>>): string[] {
  return Object.entries(parameters)
    .filter(([, value]) => value !== undefined)
    .map(([name]) => name);
}

/**
 * Refuse a request carrying legacy parameters and expressions together.
 */
function assertUnmixed(
  input: SimDynamoDbLegacyInput,
  legacy: readonly string[],
): void {
  const expressions = givenNames({
    ProjectionExpression: input.ProjectionExpression,
    ConditionExpression: input.ConditionExpression,
    UpdateExpression: input.UpdateExpression,
    KeyConditionExpression: input.KeyConditionExpression,
    FilterExpression: input.FilterExpression,
  });

  if (expressions.length > 0) {
    throw new SimDynamoDbValidationException(
      `Can not use both expression and non-expression parameters in the ` +
        `same request: Non-expression parameters: {${legacy.join(", ")}} ` +
        `Expression parameters: {${expressions.join(", ")}}`,
    );
  }
}

/**
 * Refuse a `ConditionalOperator` with no legacy conditions for it to join.
 */
function assertSomethingToJoin(input: SimDynamoDbLegacyInput): void {
  const conditions = input.Expected ?? input.QueryFilter ?? input.ScanFilter;

  if (conditions === undefined && input.ConditionalOperator !== undefined) {
    throw new SimDynamoDbValidationException(
      `ConditionalOperator can only be used with Expected, QueryFilter or ` +
        `ScanFilter, and this request carries none of them`,
    );
  }
}
