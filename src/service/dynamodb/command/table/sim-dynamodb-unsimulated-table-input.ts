import { SimDynamoDbUnsupportedOperation } from "../../error/dynamodb.error.js";
import type { SimCreateTableCommandInput } from "./table.command.js";

/**
 * Refuse the CreateTable inputs this simulation does not model.
 *
 * Each of these changes what the table does, so accepting one and ignoring it
 * would leave a test passing against a table that is not the table the request
 * asked for: queries would run against indexes that were never built, and items
 * would outlive a time to live that was never applied. Refusing is the louder
 * failure, and the one that happens here rather than in a deployment.
 *
 * Only input that asks for something is refused. An empty index or tag list,
 * and a stream or encryption specification that is switched off, describe the
 * table this simulation already makes, so they are let through.
 */
export function refuseUnsimulatedTableInput(
  input: SimCreateTableCommandInput,
): void {
  refuseSecondaryIndexes(input);
  refuseTags(input);
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
 * Refuse the secondary indexes a table would answer queries from.
 */
function refuseSecondaryIndexes(input: SimCreateTableCommandInput): void {
  if ((input.GlobalSecondaryIndexes ?? []).length > 0) {
    throw new SimDynamoDbUnsupportedOperation(
      "Global secondary indexes are not simulated, so CreateTable refuses " +
        "them rather than creating a table that is missing them",
    );
  }

  if ((input.LocalSecondaryIndexes ?? []).length > 0) {
    throw new SimDynamoDbUnsupportedOperation(
      "Local secondary indexes are not simulated, so CreateTable refuses " +
        "them rather than creating a table that is missing them",
    );
  }
}

/**
 * Refuse tags a table would be found and billed by.
 */
function refuseTags(input: SimCreateTableCommandInput): void {
  if ((input.Tags ?? []).length > 0) {
    throw new SimDynamoDbUnsupportedOperation(
      "Table tags are not simulated, so CreateTable refuses them rather than " +
        "dropping them",
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
}
