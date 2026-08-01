import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimDynamoDbAttributeValue } from "../item/item.types.js";

/**
 * Minimal structural sim DynamoDB PutRequest.
 *
 * A real PutRequest carries an Item and nothing else. `ConditionExpression` is
 * declared so a request carrying one is refused by name, rather than written
 * unconditionally by a batch that never looked at it.
 */
export interface SimDynamoDbPutRequest {
  readonly Item?:
    Readonly<Record<string, SimDynamoDbAttributeValue>> | undefined;
  readonly ConditionExpression?: string | undefined;
}

/**
 * Minimal structural sim DynamoDB DeleteRequest.
 */
export interface SimDynamoDbDeleteRequest {
  readonly Key?:
    Readonly<Record<string, SimDynamoDbAttributeValue>> | undefined;
  readonly ConditionExpression?: string | undefined;
}

/**
 * Minimal structural sim DynamoDB WriteRequest.
 *
 * One entry of a batch write carries exactly one of the two, which is what
 * makes it a put or a delete.
 */
export interface SimDynamoDbWriteRequest {
  readonly PutRequest?: SimDynamoDbPutRequest | undefined;
  readonly DeleteRequest?: SimDynamoDbDeleteRequest | undefined;
}

/**
 * Minimal structural sim DynamoDB BatchWriteItem command.
 */
export interface SimBatchWriteItemCommand {
  readonly input: SimBatchWriteItemCommandInput;
}

/**
 * Minimal structural sim DynamoDB BatchWriteItem input.
 */
export interface SimBatchWriteItemCommandInput {
  readonly RequestItems?:
    Readonly<Record<string, readonly SimDynamoDbWriteRequest[]>> | undefined;
  readonly ReturnConsumedCapacity?: string | undefined;
  readonly ReturnItemCollectionMetrics?: string | undefined;
}

/**
 * Minimal structural sim DynamoDB BatchWriteItem output.
 *
 * `UnprocessedItems` is there and empty rather than absent, which is what real
 * DynamoDB answers with when it wrote everything it was given.
 */
export interface SimBatchWriteItemCommandOutput {
  // The requests are not readonly, so what came back can be given straight to
  // the next BatchWriteItem the way a retry loop gives it.
  readonly UnprocessedItems: Readonly<
    Record<string, SimDynamoDbWriteRequest[]>
  >;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim DynamoDB KeysAndAttributes.
 *
 * This is what a batch read asks one table for: the keys, and how to read the
 * items they name. Consistency and projection are settled here rather than on
 * the request, so one call can read one table consistently and another not.
 */
export interface SimDynamoDbKeysAndAttributes {
  readonly Keys?:
    readonly Readonly<Record<string, SimDynamoDbAttributeValue>>[] | undefined;
  readonly ConsistentRead?: boolean | undefined;
  readonly ProjectionExpression?: string | undefined;
  readonly ExpressionAttributeNames?:
    Readonly<Record<string, string>> | undefined;
  readonly AttributesToGet?: readonly string[] | undefined;
}

/**
 * Minimal structural sim DynamoDB BatchGetItem command.
 */
export interface SimBatchGetItemCommand {
  readonly input: SimBatchGetItemCommandInput;
}

/**
 * Minimal structural sim DynamoDB BatchGetItem input.
 */
export interface SimBatchGetItemCommandInput {
  readonly RequestItems?:
    Readonly<Record<string, SimDynamoDbKeysAndAttributes>> | undefined;
  readonly ReturnConsumedCapacity?: string | undefined;
}

/**
 * Minimal structural sim DynamoDB BatchGetItem output.
 *
 * A key that holds nothing is absent from `Responses` rather than standing in
 * it as an empty item, so the items that came back are the items that were
 * there.
 */
export interface SimBatchGetItemCommandOutput {
  readonly Responses: Readonly<
    Record<
      string,
      readonly Readonly<Record<string, SimDynamoDbAttributeValue>>[]
    >
  >;
  readonly UnprocessedKeys: Readonly<
    Record<string, SimDynamoDbKeysAndAttributes>
  >;
  readonly $metadata: SimResponseMetadata;
}
