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
