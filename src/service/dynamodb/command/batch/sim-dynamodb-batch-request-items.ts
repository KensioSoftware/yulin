import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";

/**
 * What one table of a batch request asks for.
 *
 * The reference is the name or ARN the request used, kept as it arrived. A
 * batch read answers under the same key the request named the table by, so the
 * caller can find its items under what it asked with.
 */
export interface SimDynamoDbBatchTableRequest<Requested> {
  readonly reference: string;
  readonly requested: Requested;
}

/**
 * Read the tables a batch request names.
 *
 * A JavaScript object cannot hold one key twice, so the rule that a table is
 * named once per request needs nothing here. What is left is that a batch has
 * to work on something: real DynamoDB refuses an empty RequestItems rather than
 * answering with an empty result.
 */
export function readSimDynamoDbBatchRequestItems<Requested>(
  requestItems: Readonly<Record<string, Requested>> | undefined,
  operation: string,
): readonly SimDynamoDbBatchTableRequest<Requested>[] {
  const entries = Object.entries(requestItems ?? {});

  if (entries.length === 0) {
    throw new SimDynamoDbValidationException(
      `${operation} requires RequestItems naming at least one table`,
    );
  }

  return entries.map(([reference, requested]) => ({ reference, requested }));
}

/**
 * Refuse a batch naming one item of a table more than once.
 *
 * The keys are the marshalled primary keys of one table, so two entries that
 * name the same item are the same text whichever attribute order they arrived
 * in. Real DynamoDB takes the whole batch down for this rather than applying
 * one of the two, since which one it applied would be arbitrary.
 */
export function assertDistinctBatchItems(
  keys: readonly string[],
  reference: string,
  operation: string,
): void {
  const seen = new Set<string>();

  for (const key of keys) {
    if (seen.has(key)) {
      throw new SimDynamoDbValidationException(
        `Provided list of item keys contains duplicates: ${operation} names ` +
          `one item of the table ${reference} more than once`,
      );
    }

    seen.add(key);
  }
}
