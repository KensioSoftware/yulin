import { SimDynamoDbUnsupportedOperation } from "../../error/dynamodb.error.js";
import type { SimCreateTableCommandInput } from "./table.command.js";
import type { SimDynamoDbSecondaryIndexInput } from "./table.types.js";

/**
 * Refuse the CreateTable inputs this simulation does not model.
 *
 * Each of these changes what the table does, so accepting one and ignoring it
 * would leave a test passing against a table that is not the table the request
 * asked for: items would outlive a time to live that was never applied, and
 * changes would be published to a stream that was never made. Refusing is the
 * louder failure, and the one that happens here rather than in a deployment.
 *
 * Only input that asks for something is refused. A stream or encryption
 * specification that is switched off describes the table this simulation
 * already makes, so it is let through.
 */
export function refuseUnsimulatedTableInput(
  input: SimCreateTableCommandInput,
): void {
  refuseStreams(input);
  refuseEncryption(input);
  refuseThroughputExtras(input);

  if (input.ResourcePolicy !== undefined) {
    throw new SimDynamoDbUnsupportedOperation(
      "A table ResourcePolicy is not simulated, so CreateTable refuses one " +
        "rather than leaving the table open to callers the policy would have " +
        "kept out",
    );
  }
}

/**
 * Refuse the stream a table's changes would be published to.
 */
function refuseStreams(input: SimCreateTableCommandInput): void {
  if (input.StreamSpecification?.StreamEnabled === true) {
    throw new SimDynamoDbUnsupportedOperation(
      "DynamoDB streams are not simulated, so CreateTable refuses a " +
        "StreamSpecification rather than creating a table whose changes are " +
        "published nowhere",
    );
  }
}

/**
 * Refuse the encryption a table's items would be held under.
 *
 * `Enabled: false` is the default rather than a request for anything: real
 * DynamoDB encrypts every table with an AWS owned key, and the flag only asks
 * for a customer managed one.
 */
function refuseEncryption(input: SimCreateTableCommandInput): void {
  if (input.SSESpecification?.Enabled === true) {
    throw new SimDynamoDbUnsupportedOperation(
      "Table encryption at rest is not simulated, so CreateTable refuses an " +
        "SSESpecification rather than reporting an encryption key it is not " +
        "using",
    );
  }
}

/**
 * Refuse the throughput settings that go beyond provisioned capacity.
 *
 * A global secondary index carries its own copy of each of these, so the
 * indexes are read alongside the table itself rather than being let through
 * with settings nothing applies.
 */
function refuseThroughputExtras(input: SimCreateTableCommandInput): void {
  if (input.OnDemandThroughput !== undefined) {
    throw new SimDynamoDbUnsupportedOperation(
      "OnDemandThroughput maximums are not simulated, so CreateTable refuses " +
        "them rather than reporting limits nothing here applies",
    );
  }

  if (input.WarmThroughput !== undefined) {
    throw new SimDynamoDbUnsupportedOperation(
      "WarmThroughput is not simulated, so CreateTable refuses it rather " +
        "than reporting a pre-warmed capacity nothing here applies",
    );
  }

  refuseIndexThroughputExtras(input.GlobalSecondaryIndexes ?? []);
}

/**
 * How a refusal names the index carrying a setting nothing here applies.
 *
 * The name is what a reader recognises an index by. A request that left it out
 * is refused for that once the indexes are read, so until then the position in
 * the list stands in for it.
 */
function indexDescription(
  index: SimDynamoDbSecondaryIndexInput,
  position: number,
): string {
  if (index.IndexName === undefined) {
    return `GlobalSecondaryIndexes entry ${(position + 1).toString()}`;
  }

  return `index ${index.IndexName}`;
}

/**
 * Refuse the throughput settings an index carries of its own.
 *
 * A request can declare twenty indexes, so the refusal says which one was
 * carrying the setting rather than leaving the reader to find it.
 */
function refuseIndexThroughputExtras(
  indexes: readonly SimDynamoDbSecondaryIndexInput[],
): void {
  for (const [position, index] of indexes.entries()) {
    const described = indexDescription(index, position);

    if (index.OnDemandThroughput !== undefined) {
      throw new SimDynamoDbUnsupportedOperation(
        `OnDemandThroughput maximums are not simulated, so CreateTable ` +
          `refuses them on ${described} rather than reporting limits nothing ` +
          `here applies`,
      );
    }

    if (index.WarmThroughput !== undefined) {
      throw new SimDynamoDbUnsupportedOperation(
        `WarmThroughput is not simulated, so CreateTable refuses it on ` +
          `${described} rather than reporting a pre-warmed capacity nothing ` +
          `here applies`,
      );
    }
  }
}
