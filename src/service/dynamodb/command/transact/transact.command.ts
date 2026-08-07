import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimDynamoDbAttributeValue } from "../item/item.types.js";

/**
 * What every action of a transactional write carries.
 *
 * Each action names its own table and carries its own condition, so one
 * transaction can guard each of the items it touches differently.
 */
interface SimDynamoDbTransactAction {
  readonly TableName?: string | undefined;
  readonly ConditionExpression?: string | undefined;
  readonly ExpressionAttributeNames?:
    | Readonly<Record<string, string>>
    | undefined;
  readonly ExpressionAttributeValues?:
    | Readonly<Record<string, SimDynamoDbAttributeValue>>
    | undefined;
  readonly ReturnValuesOnConditionCheckFailure?: string | undefined;
}

/**
 * Minimal structural sim DynamoDB transactional Put.
 */
export interface SimDynamoDbTransactPut extends SimDynamoDbTransactAction {
  readonly Item?:
    | Readonly<Record<string, SimDynamoDbAttributeValue>>
    | undefined;
}

/**
 * Minimal structural sim DynamoDB transactional Update.
 *
 * A transactional update names its `UpdateExpression`, where UpdateItem takes a
 * request without one as an upsert of the Key.
 */
export interface SimDynamoDbTransactUpdate extends SimDynamoDbTransactAction {
  readonly Key?:
    | Readonly<Record<string, SimDynamoDbAttributeValue>>
    | undefined;
  readonly UpdateExpression?: string | undefined;
}

/**
 * Minimal structural sim DynamoDB transactional Delete.
 */
export interface SimDynamoDbTransactDelete extends SimDynamoDbTransactAction {
  readonly Key?:
    | Readonly<Record<string, SimDynamoDbAttributeValue>>
    | undefined;
}

/**
 * Minimal structural sim DynamoDB transactional ConditionCheck.
 *
 * A condition check writes nothing. It is how a transaction says that an item
 * it is not changing has to hold for the items it is changing to be written.
 */
export interface SimDynamoDbTransactConditionCheck extends SimDynamoDbTransactAction {
  readonly Key?:
    | Readonly<Record<string, SimDynamoDbAttributeValue>>
    | undefined;
}

/**
 * Minimal structural sim DynamoDB TransactWriteItem.
 *
 * One entry carries exactly one of the four, which is what makes it a put, an
 * update, a delete or a condition check.
 */
export interface SimDynamoDbTransactWriteItem {
  readonly Put?: SimDynamoDbTransactPut | undefined;
  readonly Update?: SimDynamoDbTransactUpdate | undefined;
  readonly Delete?: SimDynamoDbTransactDelete | undefined;
  readonly ConditionCheck?: SimDynamoDbTransactConditionCheck | undefined;
}

/**
 * Minimal structural sim DynamoDB TransactWriteItems command.
 */
export interface SimTransactWriteItemsCommand {
  readonly input: SimTransactWriteItemsCommandInput;
}

/**
 * Minimal structural sim DynamoDB TransactWriteItems input.
 */
export interface SimTransactWriteItemsCommandInput {
  readonly TransactItems?: readonly SimDynamoDbTransactWriteItem[] | undefined;
  readonly ClientRequestToken?: string | undefined;
  readonly ReturnConsumedCapacity?: string | undefined;
  readonly ReturnItemCollectionMetrics?: string | undefined;
}

/**
 * Minimal structural sim DynamoDB TransactWriteItems output.
 *
 * A transactional write reports nothing about the items it wrote. It applied
 * every action or none of them, so there is nothing to say per action.
 */
export interface SimTransactWriteItemsCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim DynamoDB transactional Get.
 *
 * There is no `ConsistentRead` here. A transactional read is always strongly
 * consistent, so there is nothing to ask for.
 */
export interface SimDynamoDbTransactGet {
  readonly TableName?: string | undefined;
  readonly Key?:
    | Readonly<Record<string, SimDynamoDbAttributeValue>>
    | undefined;
  readonly ProjectionExpression?: string | undefined;
  readonly ExpressionAttributeNames?:
    | Readonly<Record<string, string>>
    | undefined;
}

/**
 * Minimal structural sim DynamoDB TransactGetItem.
 */
export interface SimDynamoDbTransactGetItem {
  readonly Get?: SimDynamoDbTransactGet | undefined;
}

/**
 * Minimal structural sim DynamoDB TransactGetItems command.
 */
export interface SimTransactGetItemsCommand {
  readonly input: SimTransactGetItemsCommandInput;
}

/**
 * Minimal structural sim DynamoDB TransactGetItems input.
 */
export interface SimTransactGetItemsCommandInput {
  readonly TransactItems?: readonly SimDynamoDbTransactGetItem[] | undefined;
  readonly ReturnConsumedCapacity?: string | undefined;
}

/**
 * What one Get of a transactional read answers with.
 *
 * A key that holds nothing gives an entry with no `Item`, rather than being
 * left out, so the answers line up with the Gets that asked for them.
 */
export interface SimDynamoDbItemResponse {
  readonly Item?:
    | Readonly<Record<string, SimDynamoDbAttributeValue>>
    | undefined;
}

/**
 * Minimal structural sim DynamoDB TransactGetItems output.
 */
export interface SimTransactGetItemsCommandOutput {
  readonly Responses: readonly SimDynamoDbItemResponse[];
  readonly $metadata: SimResponseMetadata;
}

/**
 * Why one action of a cancelled transaction was cancelled.
 *
 * There is one of these per action, in request order, including the actions
 * nothing was wrong with, which carry the code `None`.
 */
export interface SimDynamoDbCancellationReason {
  readonly Code: string;
  readonly Message?: string | undefined;
  readonly Item?:
    | Readonly<Record<string, SimDynamoDbAttributeValue>>
    | undefined;
}
