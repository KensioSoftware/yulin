import type { SimArn } from "../../../aws/arn.js";

/**
 * Minimal structural sim DynamoDB table description.
 */
export interface SimDynamoDbTableDescription {
  readonly AttributeDefinitions?:
    readonly SimDynamoDbAttributeDefinition[] | undefined;
  readonly TableName?: string | undefined;
  readonly TableArn?: SimArn | undefined;
  readonly TableId?: string | undefined;
  readonly KeySchema?: readonly SimDynamoDbKeySchemaElement[] | undefined;
  readonly TableStatus?: SimDynamoDbTableStatus | undefined;
  readonly CreationDateTime?: Date | undefined;
  readonly BillingModeSummary?: SimDynamoDbBillingModeSummary | undefined;
  readonly ProvisionedThroughput?:
    SimDynamoDbProvisionedThroughputDescription | undefined;
  readonly TableClassSummary?: SimDynamoDbTableClassSummary | undefined;
  readonly DeletionProtectionEnabled?: boolean | undefined;
  readonly ItemCount?: number | undefined;
  readonly TableSizeBytes?: number | undefined;
  readonly GlobalSecondaryIndexes?:
    readonly SimDynamoDbGlobalSecondaryIndexDescription[] | undefined;
}

/**
 * Minimal structural sim DynamoDB attribute definition, as a request carries it.
 */
export interface SimDynamoDbAttributeDefinitionInput {
  readonly AttributeName?: string | undefined;
  readonly AttributeType?: string | undefined;
}

/**
 * Minimal structural sim DynamoDB attribute definition, as a table reports it.
 */
export interface SimDynamoDbAttributeDefinition {
  readonly AttributeName: string;
  readonly AttributeType: SimDynamoDbScalarAttributeType;
}

/**
 * Minimal structural sim DynamoDB key schema element, as a request carries it.
 */
export interface SimDynamoDbKeySchemaElementInput {
  readonly AttributeName?: string | undefined;
  readonly KeyType?: string | undefined;
}

/**
 * Minimal structural sim DynamoDB key schema element, as a table reports it.
 */
export interface SimDynamoDbKeySchemaElement {
  readonly AttributeName: string;
  readonly KeyType: SimDynamoDbKeyType;
}

/**
 * Minimal structural sim DynamoDB provisioned throughput.
 */
export interface SimDynamoDbProvisionedThroughput {
  readonly ReadCapacityUnits?: number | undefined;
  readonly WriteCapacityUnits?: number | undefined;
}

/**
 * Minimal structural sim DynamoDB provisioned throughput description.
 */
export interface SimDynamoDbProvisionedThroughputDescription {
  readonly ReadCapacityUnits: number;
  readonly WriteCapacityUnits: number;
  readonly NumberOfDecreasesToday: number;
}

/**
 * Minimal structural sim DynamoDB billing mode summary.
 */
export interface SimDynamoDbBillingModeSummary {
  readonly BillingMode: SimDynamoDbBillingMode;
}

/**
 * Minimal structural sim DynamoDB table class summary.
 */
export interface SimDynamoDbTableClassSummary {
  readonly TableClass: SimDynamoDbTableClass;
}

/**
 * Minimal structural sim DynamoDB tag, as a request carries it.
 */
export interface SimDynamoDbTagInput {
  readonly Key?: string | undefined;
  readonly Value?: string | undefined;
}

/**
 * Minimal structural sim DynamoDB tag, as a resource reports it.
 *
 * A tag that is held has both halves, where a request may be missing either.
 */
export interface SimDynamoDbTag {
  readonly Key: string;
  readonly Value: string;
}

/**
 * Minimal structural sim DynamoDB secondary index, global or local.
 */
export interface SimDynamoDbSecondaryIndexInput {
  readonly IndexName?: string | undefined;
}

/**
 * Minimal structural sim DynamoDB stream specification.
 */
export interface SimDynamoDbStreamSpecification {
  readonly StreamEnabled?: boolean | undefined;
  readonly StreamViewType?: string | undefined;
}

/**
 * Minimal structural sim DynamoDB server-side encryption specification.
 */
export interface SimDynamoDbSseSpecification {
  readonly Enabled?: boolean | undefined;
  readonly SSEType?: string | undefined;
  readonly KMSMasterKeyId?: string | undefined;
}

/**
 * Minimal structural sim DynamoDB on-demand throughput.
 */
export interface SimDynamoDbOnDemandThroughput {
  readonly MaxReadRequestUnits?: number | undefined;
  readonly MaxWriteRequestUnits?: number | undefined;
}

/**
 * Minimal structural sim DynamoDB warm throughput.
 */
export interface SimDynamoDbWarmThroughput {
  readonly ReadUnitsPerSecond?: number | undefined;
  readonly WriteUnitsPerSecond?: number | undefined;
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
 * Minimal structural sim DynamoDB billing mode.
 */
export type SimDynamoDbBillingMode = "PROVISIONED" | "PAY_PER_REQUEST";

/**
 * Minimal structural sim DynamoDB table class.
 */
export type SimDynamoDbTableClass = "STANDARD" | "STANDARD_INFREQUENT_ACCESS";

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
