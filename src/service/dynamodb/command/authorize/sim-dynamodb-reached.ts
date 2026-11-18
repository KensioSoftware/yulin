import type { SimIamConditions } from "../../../iam/tag/sim-iam-tag-conditions.js";
import { simDynamoDbAttributesConditionKey } from "./sim-dynamodb-attributes.js";
import type { SimDynamoDbPartitionKeyValues } from "./sim-dynamodb-leading-keys.js";
import { simDynamoDbPartitionKeyConditions } from "./sim-dynamodb-leading-keys.js";
import type { SimDynamoDbRequestKeys } from "./sim-dynamodb-request-keys.js";
import { simDynamoDbRequestKeyConditions } from "./sim-dynamodb-request-keys.js";

/**
 * What one request reaches in the table it names.
 *
 * The partition key values, attribute names and request parameters each
 * become a DynamoDB condition key. A request reaching nothing under one of
 * them leaves it out, as AWS leaves a key out for an operation that reaches
 * nothing it names. The index name decides the resource authorized.
 */
export interface SimDynamoDbReached extends SimDynamoDbRequestKeys {
  /** The index the request reads, when it names one. */
  readonly indexName?: string | undefined;

  /** The partition key values the request reaches, by key position. */
  readonly partitionKeys?: SimDynamoDbPartitionKeyValues | undefined;

  /** The top-level attribute names the request names. */
  readonly attributes?: readonly string[] | undefined;

  /** The tags a request sets or the keys it removes, for IAM to read. */
  readonly requestConditions?: SimIamConditions | undefined;
}

/**
 * The condition values a request carries for the table it names.
 */
export function simDynamoDbConditionContextOf(
  reached: SimDynamoDbReached,
): SimIamConditions {
  const attributes = reached.attributes ?? [];
  const attributeConditions =
    attributes.length === 0
      ? {}
      : { [simDynamoDbAttributesConditionKey]: attributes };

  return {
    ...reached.requestConditions,
    ...simDynamoDbPartitionKeyConditions(reached.partitionKeys ?? []),
    ...attributeConditions,
    ...simDynamoDbRequestKeyConditions(reached),
  };
}
