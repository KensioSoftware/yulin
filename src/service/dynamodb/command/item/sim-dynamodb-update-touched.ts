import { SimDynamoDbProjection } from "../../expression/projection/sim-dynamodb-projection.js";
import { updateExpressionName } from "../../expression/update/sim-dynamodb-update-refusal.js";
import type { SimDynamoDbUpdate } from "../../expression/update/sim-dynamodb-update.js";

/**
 * The parts of an item an update touched, for the reporting modes that answer
 * with those and nothing else.
 *
 * A request that says nothing to change touched nothing, so the projection it
 * answers with finds nothing in either item.
 */
export function simDynamoDbTouchedBy(
  update: SimDynamoDbUpdate | undefined,
): SimDynamoDbProjection {
  return (
    update?.touched() ??
    new SimDynamoDbProjection({
      expressionName: updateExpressionName,
      paths: [],
    })
  );
}
