import type { SimDynamoDbSecondaryIndexInput } from "../command/table/table.types.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";

/**
 * How a refusal says a local secondary index has no capacity of its own.
 */
function refuseSetting(
  setting: string,
  indexName: string,
): SimDynamoDbValidationException {
  return new SimDynamoDbValidationException(
    `One or more parameter values were invalid: ${setting} cannot be ` +
      `specified for index: ${indexName} because it is a local secondary ` +
      `index, which is read and written out of the table's own throughput`,
  );
}

/**
 * Refuse the capacity a local secondary index cannot be given.
 *
 * A local secondary index sits in the same partition as the items it indexes
 * and shares the table's throughput, so there is nothing to provision for it.
 * Real DynamoDB has no throughput field on a `LocalSecondaryIndex` at all, so a
 * request carrying one is refused rather than stored and ignored.
 */
export function refuseSimDynamoDbLocalIndexThroughput(
  input: SimDynamoDbSecondaryIndexInput,
  indexName: string,
): void {
  if (input.ProvisionedThroughput !== undefined) {
    throw refuseSetting("ProvisionedThroughput", indexName);
  }

  if (input.OnDemandThroughput !== undefined) {
    throw refuseSetting("OnDemandThroughput", indexName);
  }

  if (input.WarmThroughput !== undefined) {
    throw refuseSetting("WarmThroughput", indexName);
  }
}
