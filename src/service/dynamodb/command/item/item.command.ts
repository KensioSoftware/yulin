import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type {
  SimDynamoDbAttributeValue,
  SimDynamoDbExpectedAttributeValue,
} from "./item.types.js";

/**
 * Minimal structural sim DynamoDB PutItem command.
 */
export interface SimPutItemCommand {
  readonly input: SimPutItemCommandInput;
}

/**
 * Minimal structural sim DynamoDB PutItem input.
 *
 * The inputs this simulation does not model are declared as well as the ones it
 * does, so a request that asks for one of them is refused rather than quietly
 * given something else.
 */
export interface SimPutItemCommandInput {
  readonly TableName?: string | undefined;
  readonly Item?:
    Readonly<Record<string, SimDynamoDbAttributeValue>> | undefined;
  readonly ReturnValues?: string | undefined;
  readonly ConditionExpression?: string | undefined;
  readonly ExpressionAttributeNames?:
    Readonly<Record<string, string>> | undefined;
  readonly ExpressionAttributeValues?:
    Readonly<Record<string, SimDynamoDbAttributeValue>> | undefined;
  readonly ReturnConsumedCapacity?: string | undefined;
  readonly ReturnItemCollectionMetrics?: string | undefined;
  readonly ReturnValuesOnConditionCheckFailure?: string | undefined;
  readonly Expected?:
    Readonly<Record<string, SimDynamoDbExpectedAttributeValue>> | undefined;
  readonly ConditionalOperator?: string | undefined;
}

/**
 * Minimal structural sim DynamoDB PutItem output.
 */
export interface SimPutItemCommandOutput {
  readonly Attributes?:
    Readonly<Record<string, SimDynamoDbAttributeValue>> | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim DynamoDB GetItem command.
 */
export interface SimGetItemCommand {
  readonly input: SimGetItemCommandInput;
}

/**
 * Minimal structural sim DynamoDB GetItem input.
 *
 * As with the write commands, the inputs this simulation does not model are
 * declared as well as the ones it does, so a request that asks for one of them
 * is refused rather than quietly given something else.
 */
export interface SimGetItemCommandInput {
  readonly TableName?: string | undefined;
  readonly Key?:
    Readonly<Record<string, SimDynamoDbAttributeValue>> | undefined;
  readonly ConsistentRead?: boolean | undefined;
  readonly ProjectionExpression?: string | undefined;
  readonly ExpressionAttributeNames?:
    Readonly<Record<string, string>> | undefined;
  readonly AttributesToGet?: readonly string[] | undefined;
  readonly ReturnConsumedCapacity?: string | undefined;
}

/**
 * Minimal structural sim DynamoDB GetItem output.
 *
 * `Item` is absent rather than empty when the key holds nothing, which is how a
 * caller tells a miss from an item with no attributes beyond its key.
 */
export interface SimGetItemCommandOutput {
  readonly Item?:
    Readonly<Record<string, SimDynamoDbAttributeValue>> | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim DynamoDB DeleteItem command.
 */
export interface SimDeleteItemCommand {
  readonly input: SimDeleteItemCommandInput;
}

/**
 * Minimal structural sim DynamoDB DeleteItem input.
 */
export interface SimDeleteItemCommandInput {
  readonly TableName?: string | undefined;
  readonly Key?:
    Readonly<Record<string, SimDynamoDbAttributeValue>> | undefined;
  readonly ReturnValues?: string | undefined;
  readonly ConditionExpression?: string | undefined;
  readonly ExpressionAttributeNames?:
    Readonly<Record<string, string>> | undefined;
  readonly ExpressionAttributeValues?:
    Readonly<Record<string, SimDynamoDbAttributeValue>> | undefined;
  readonly ReturnConsumedCapacity?: string | undefined;
  readonly ReturnItemCollectionMetrics?: string | undefined;
  readonly ReturnValuesOnConditionCheckFailure?: string | undefined;
  readonly Expected?:
    Readonly<Record<string, SimDynamoDbExpectedAttributeValue>> | undefined;
  readonly ConditionalOperator?: string | undefined;
}

/**
 * Minimal structural sim DynamoDB DeleteItem output.
 */
export interface SimDeleteItemCommandOutput {
  readonly Attributes?:
    Readonly<Record<string, SimDynamoDbAttributeValue>> | undefined;
  readonly $metadata: SimResponseMetadata;
}
