import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type {
  SimDynamoDbAttributeValue,
  SimDynamoDbLegacyCondition,
} from "../item/item.types.js";

/**
 * Minimal structural sim DynamoDB Scan command.
 */
export interface SimScanCommand {
  readonly input: SimScanCommandInput;
}

/**
 * Minimal structural sim DynamoDB Scan input.
 *
 * The inputs this simulation does not model are declared as well as the ones it
 * does, so a request that asks for one of them is refused by name rather than
 * given a page that means something else.
 */
export interface SimScanCommandInput {
  readonly TableName?: string | undefined;
  readonly Limit?: number | undefined;
  readonly ExclusiveStartKey?:
    Readonly<Record<string, SimDynamoDbAttributeValue>> | undefined;
  readonly ConsistentRead?: boolean | undefined;
  readonly Segment?: number | undefined;
  readonly TotalSegments?: number | undefined;
  readonly IndexName?: string | undefined;
  readonly FilterExpression?: string | undefined;
  readonly ProjectionExpression?: string | undefined;
  readonly ExpressionAttributeNames?:
    Readonly<Record<string, string>> | undefined;
  readonly ExpressionAttributeValues?:
    Readonly<Record<string, SimDynamoDbAttributeValue>> | undefined;
  readonly Select?: string | undefined;
  readonly ReturnConsumedCapacity?: string | undefined;
  readonly AttributesToGet?: readonly string[] | undefined;
  readonly ScanFilter?:
    Readonly<Record<string, SimDynamoDbLegacyCondition>> | undefined;
  readonly ConditionalOperator?: string | undefined;
}

/**
 * Minimal structural sim DynamoDB Scan output.
 *
 * `Count` and `ScannedCount` are the same number here, since nothing filters a
 * scan yet: every item the walk evaluated is an item it answers with.
 *
 * `LastEvaluatedKey` is absent only when the table, or the segment of it being
 * read, ran out inside the `Limit`, so a caller loops until it is gone rather
 * than until the page is short.
 */
export interface SimScanCommandOutput {
  readonly Items?:
    readonly Readonly<Record<string, SimDynamoDbAttributeValue>>[] | undefined;
  readonly Count?: number | undefined;
  readonly ScannedCount?: number | undefined;
  readonly LastEvaluatedKey?:
    Readonly<Record<string, SimDynamoDbAttributeValue>> | undefined;
  readonly $metadata: SimResponseMetadata;
}
