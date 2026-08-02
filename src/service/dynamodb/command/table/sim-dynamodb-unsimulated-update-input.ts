import { SimDynamoDbUnsupportedOperation } from "../../error/dynamodb.error.js";
import type { SimUpdateTableCommandInput } from "./table.command.js";

/**
 * Refuse the UpdateTable inputs this simulation does not model.
 *
 * Each of these changes what the table does or where it lives, so accepting one
 * and ignoring it would leave a test passing against a table that is not the
 * table the request asked for: changes published to a stream that was never
 * made, or reads served from a region the table was never replicated to.
 *
 * As with CreateTable, only input that asks for something is refused. A stream
 * or encryption specification that is switched off describes the table this
 * simulation already has.
 */
export function refuseUnsimulatedUpdateInput(
  input: SimUpdateTableCommandInput,
): void {
  if (input.StreamSpecification?.StreamEnabled === true) {
    throw new SimDynamoDbUnsupportedOperation(
      "DynamoDB streams are not simulated, so UpdateTable refuses a " +
        "StreamSpecification rather than reporting a stream whose changes go " +
        "nowhere",
    );
  }

  if (input.SSESpecification?.Enabled === true) {
    throw new SimDynamoDbUnsupportedOperation(
      "Table encryption at rest is not simulated, so UpdateTable refuses an " +
        "SSESpecification rather than reporting an encryption key it is not " +
        "using",
    );
  }

  refuseReplicas(input);
  refuseThroughputExtras(input);
}

/**
 * Refuse the regions a table's items would be replicated to.
 */
function refuseReplicas(input: SimUpdateTableCommandInput): void {
  if (input.ReplicaUpdates !== undefined && input.ReplicaUpdates.length > 0) {
    throw new SimDynamoDbUnsupportedOperation(
      "Global table replicas are not simulated, so UpdateTable refuses " +
        "ReplicaUpdates rather than reporting a replica no region holds",
    );
  }
}

/**
 * Refuse the throughput settings that go beyond provisioned capacity.
 */
function refuseThroughputExtras(input: SimUpdateTableCommandInput): void {
  if (input.OnDemandThroughput !== undefined) {
    throw new SimDynamoDbUnsupportedOperation(
      "OnDemandThroughput maximums are not simulated, so UpdateTable refuses " +
        "them rather than reporting limits nothing here applies",
    );
  }

  if (input.WarmThroughput !== undefined) {
    throw new SimDynamoDbUnsupportedOperation(
      "WarmThroughput is not simulated, so UpdateTable refuses it rather " +
        "than reporting a pre-warmed capacity nothing here applies",
    );
  }
}
