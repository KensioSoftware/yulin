import type { SimArn } from "../../../aws/arn.js";
import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim DynamoDB CreateTable command.
 */
export interface SimCreateTableCommand {
  readonly input: SimCreateTableCommandInput;
}

/**
 * Minimal structural sim DynamoDB CreateTable input.
 */
export interface SimCreateTableCommandInput {
  readonly TableName?: string | undefined;
  readonly AttributeDefinitions?: SimDynamoDbAttributeDefinition[] | undefined;
  readonly KeySchema?: readonly SimDynamoDbKeySchemaElement[] | undefined;
}

/**
 * Minimal structural sim DynamoDB CreateTable output.
 */
export interface SimCreateTableCommandOutput {
  readonly TableDescription?: SimDynamoDbTableDescription;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim DynamoDB table description.
 */
export interface SimDynamoDbTableDescription {
  readonly AttributeDefinitions?: readonly SimDynamoDbAttributeDefinition[];
  readonly TableName?: string;
  readonly TableArn?: SimArn;
  readonly KeySchema?: SimDynamoDbKeySchemaElement[] | undefined;
  readonly TableStatus?: SimDynamoDbTableStatus;
  readonly CreationDateTime?: Date;
  readonly GlobalSecondaryIndexes?: readonly SimDynamoDbGlobalSecondaryIndexDescription[];
}

/**
 * Minimal structural sim DynamoDB attribute definition.
 */
export interface SimDynamoDbAttributeDefinition {
  readonly AttributeName?: string | undefined;
  readonly AttributeType?: SimDynamoDbScalarAttributeType | undefined;
}

/**
 * Minimal structural sim DynamoDB key schema element.
 */
export interface SimDynamoDbKeySchemaElement {
  readonly AttributeName?: string | undefined;
  readonly KeyType?: SimDynamoDbKeyType | undefined;
}

/**
 * Minimal structural sim DynamoDB key type.
 */
export type SimDynamoDbKeyType = "HASH" | "RANGE";

/**
 * Minimal structural sim DynamoDB scalar attribute type.
 */
export type SimDynamoDbScalarAttributeType = "S" | "N" | "B";

/**
 * Minimal structural sim DynamoDB table status.
 */
export type SimDynamoDbTableStatus =
  | "CREATING"
  | "UPDATING"
  | "DELETING"
  | "ACTIVE"
  | "INACCESSIBLE_ENCRYPTION_CREDENTIALS"
  | "ARCHIVING"
  | "ARCHIVED";

/**
 * Minimal structural sim DynamoDB global secondary index description.
 */
export interface SimDynamoDbGlobalSecondaryIndexDescription {
  readonly IndexName?: string | undefined;
  readonly KeySchema?: readonly SimDynamoDbKeySchemaElement[] | undefined;
  readonly Projection?: SimDynamoDbProjection | undefined;
  readonly IndexStatus?: SimDynamoDbIndexStatus | undefined;
  readonly IndexArn?: SimArn | undefined;
  readonly ItemCount?: number | undefined;
  readonly IndexSizeBytes?: number | undefined;
}

/**
 * Minimal structural sim DynamoDB projection.
 */
export interface SimDynamoDbProjection {
  readonly ProjectionType?: SimDynamoDbProjectionType | undefined;
  readonly NonKeyAttributes?: readonly string[] | undefined;
}

/**
 * Minimal structural sim DynamoDB projection type.
 */
export type SimDynamoDbProjectionType = "ALL" | "KEYS_ONLY" | "INCLUDE";

/**
 * Minimal structural sim DynamoDB index status.
 */
export type SimDynamoDbIndexStatus =
  "CREATING" | "UPDATING" | "DELETING" | "ACTIVE";
