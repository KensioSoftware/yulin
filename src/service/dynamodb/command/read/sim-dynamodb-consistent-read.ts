import type { SimDynamoDbReadView } from "../../table/sim-dynamodb-read-view.js";

interface SimDynamoDbConsistentReadInput {
  readonly ConsistentRead?: boolean | undefined;
}

/**
 * Refuse a strongly consistent read the thing being read cannot answer.
 *
 * A global secondary index is maintained asynchronously on AWS, so it cannot
 * answer one at all. A local secondary index sits in the same partition as the
 * item it indexes and is written with it, so it can, and so can the table.
 * Which of those is being read is a question only the view can answer, so this
 * runs after the `IndexName` has been resolved rather than off the request
 * alone.
 *
 * Every read here is strongly consistent, so accepting the flag and ignoring it
 * would leave a test passing on a request real DynamoDB refuses outright.
 */
export function assertSimDynamoDbConsistentReadAnswerable(
  input: SimDynamoDbConsistentReadInput,
  view: SimDynamoDbReadView,
): void {
  if (input.ConsistentRead !== true) {
    return;
  }

  view.assertConsistentRead();
}
