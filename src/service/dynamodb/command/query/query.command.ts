import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type {
  SimDynamoDbAttributeValue,
  SimDynamoDbLegacyCondition,
} from "../item/item.types.js";

/**
 * Minimal structural sim DynamoDB Query command.
 */
export interface SimQueryCommand {
  readonly input: SimQueryCommandInput;
}

/**
 * Minimal structural sim DynamoDB Query input.
 *
 * The inputs this simulation does not model are declared as well as the ones it
 * does, so a request that asks for one of them is refused by name rather than
 * given a page that means something else.
 */
export interface SimQueryCommandInput {
  readonly TableName?: string | undefined;
  readonly KeyConditionExpression?: string | undefined;
  readonly ExpressionAttributeNames?:
    Readonly<Record<string, string>> | undefined;
  readonly ExpressionAttributeValues?:
    Readonly<Record<string, SimDynamoDbAttributeValue>> | undefined;
  readonly ScanIndexForward?: boolean | undefined;
  readonly Limit?: number | undefined;
  readonly ExclusiveStartKey?:
    Readonly<Record<string, SimDynamoDbAttributeValue>> | undefined;
  readonly ConsistentRead?: boolean | undefined;
  readonly IndexName?: string | undefined;
  readonly FilterExpression?: string | undefined;
  readonly ProjectionExpression?: string | undefined;
  readonly Select?: string | undefined;
  readonly ReturnConsumedCapacity?: string | undefined;
  readonly AttributesToGet?: readonly string[] | undefined;
  readonly KeyConditions?:
    Readonly<Record<string, SimDynamoDbLegacyCondition>> | undefined;
  readonly QueryFilter?:
    Readonly<Record<string, SimDynamoDbLegacyCondition>> | undefined;
  readonly ConditionalOperator?: string | undefined;

  // Scan parameters, which a Query never had. They are declared so a request
  // that meant to scan is refused by name rather than answered with one item
  // collection.
  readonly Segment?: number | undefined;
  readonly TotalSegments?: number | undefined;
}

/**
 * Minimal structural sim DynamoDB Query output.
 *
 * `ScannedCount` is how many items the walk evaluated and `Count` how many of
 * them the filter kept, so the two are the same number for a query carrying no
 * `FilterExpression`.
 *
 * `Items` is absent altogether for a `Select` of `COUNT`, rather than empty.
 *
 * `LastEvaluatedKey` is absent only when the key range ran out inside the
 * `Limit`, so a caller loops until it is gone rather than until the page is
 * short.
 */
export interface SimQueryCommandOutput {
  readonly Items?:
    readonly Readonly<Record<string, SimDynamoDbAttributeValue>>[] | undefined;
  readonly Count?: number | undefined;
  readonly ScannedCount?: number | undefined;
  readonly LastEvaluatedKey?:
    Readonly<Record<string, SimDynamoDbAttributeValue>> | undefined;
  readonly $metadata: SimResponseMetadata;
}
