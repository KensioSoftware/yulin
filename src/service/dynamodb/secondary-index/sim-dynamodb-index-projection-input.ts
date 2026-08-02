import type {
  SimDynamoDbProjectionInput,
  SimDynamoDbProjectionType,
} from "../command/table/table.types.js";

/**
 * What a test says when it asks for an index projecting one thing or another.
 */
export interface SimDynamoDbIndexedTableProjection {
  readonly projectionType: SimDynamoDbProjectionType;
  readonly nonKeyAttributes: readonly string[];
}

/**
 * The `Projection` an index is created with, which INCLUDE alone names
 * attributes for.
 *
 * The two index kinds project the same way, so their factories build this the
 * same way rather than each having a copy of the rule.
 */
export function simDynamoDbIndexProjectionInput(
  input: SimDynamoDbIndexedTableProjection,
): SimDynamoDbProjectionInput {
  if (input.projectionType !== "INCLUDE") {
    return { ProjectionType: input.projectionType };
  }

  return {
    ProjectionType: input.projectionType,
    NonKeyAttributes: input.nonKeyAttributes,
  };
}
