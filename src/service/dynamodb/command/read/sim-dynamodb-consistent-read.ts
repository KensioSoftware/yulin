import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";

interface SimDynamoDbConsistentReadInput {
  readonly ConsistentRead?: boolean | undefined;
  readonly IndexName?: string | undefined;
}

/**
 * Refuse a strongly consistent read of a global secondary index.
 *
 * A global secondary index is maintained asynchronously on AWS, so it cannot
 * answer a strongly consistent read at all, whatever the index is. Local
 * secondary indexes can, and are not simulated, so an `IndexName` here always
 * names a global one.
 *
 * Every read here is strongly consistent, so accepting this and ignoring it
 * would leave a test passing on a request real DynamoDB refuses outright.
 */
export function refuseSimDynamoDbConsistentIndexRead(
  input: SimDynamoDbConsistentReadInput,
): void {
  if (input.ConsistentRead !== true || input.IndexName === undefined) {
    return;
  }

  throw new SimDynamoDbValidationException(
    `Consistent reads are not supported on global secondary indexes, and ` +
      `this request asks for one on ${input.IndexName}`,
  );
}
