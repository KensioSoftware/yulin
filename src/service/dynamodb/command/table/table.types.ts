import type { SimArn } from "../../../aws/arn.js";
import type { SimDynamoDbStreamSpecificationDescription } from "../../stream/sim-dynamodb-stream.types.js";

/**
 * Minimal structural sim DynamoDB table description.
 */
export interface SimDynamoDbTableDescription {
  readonly AttributeDefinitions?:
    | readonly SimDynamoDbAttributeDefinition[]
    | undefined;
  readonly TableName?: string | undefined;
  readonly TableArn?: SimArn | undefined;
  readonly TableId?: string | undefined;
  readonly KeySchema?: readonly SimDynamoDbKeySchemaElement[] | undefined;
  readonly TableStatus?: SimDynamoDbTableStatus | undefined;
  readonly CreationDateTime?: Date | undefined;
  readonly BillingModeSummary?: SimDynamoDbBillingModeSummary | undefined;
  readonly ProvisionedThroughput?:
    | SimDynamoDbProvisionedThroughputDescription
    | undefined;
  readonly TableClassSummary?: SimDynamoDbTableClassSummary | undefined;
  readonly DeletionProtectionEnabled?: boolean | undefined;
  readonly ItemCount?: number | undefined;
  readonly TableSizeBytes?: number | undefined;
  readonly GlobalSecondaryIndexes?:
    | readonly SimDynamoDbGlobalSecondaryIndexDescription[]
    | undefined;
  readonly LocalSecondaryIndexes?:
    | readonly SimDynamoDbLocalSecondaryIndexDescription[]
    | undefined;
  readonly StreamSpecification?:
    | SimDynamoDbStreamSpecificationDescription
    | undefined;
  readonly LatestStreamArn?: SimArn | undefined;
  readonly LatestStreamLabel?: string | undefined;
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
 *
 * The throughput settings this simulation does not model are declared as well
 * as the ones it does, so an index asking for one of them is refused by name
 * rather than created without it.
 */
export interface SimDynamoDbSecondaryIndexInput {
  readonly IndexName?: string | undefined;
  readonly KeySchema?: readonly SimDynamoDbKeySchemaElementInput[] | undefined;
  readonly Projection?: SimDynamoDbProjectionInput | undefined;
  readonly ProvisionedThroughput?: SimDynamoDbProvisionedThroughput | undefined;
  readonly OnDemandThroughput?: SimDynamoDbOnDemandThroughput | undefined;
  readonly WarmThroughput?: SimDynamoDbWarmThroughput | undefined;
}

/**
 * Minimal structural sim DynamoDB global secondary index update, as one entry
 * of the `GlobalSecondaryIndexUpdates` an UpdateTable request carries.
 *
 * One entry asks for one action. A `Create` declares an index the same way
 * CreateTable does, and an `Update` names an existing one to change the
 * capacity of.
 */
export interface SimDynamoDbGlobalSecondaryIndexUpdateInput {
  readonly Create?: SimDynamoDbSecondaryIndexInput | undefined;
  readonly Delete?: SimDynamoDbIndexDeletionInput | undefined;
  readonly Update?: SimDynamoDbSecondaryIndexInput | undefined;
}

/**
 * Minimal structural sim DynamoDB global secondary index deletion.
 */
export interface SimDynamoDbIndexDeletionInput {
  readonly IndexName?: string | undefined;
}

/**
 * Minimal structural sim DynamoDB replica update.
 *
 * Enough of the shape to recognise one and refuse it by name. Replication
 * across regions is not simulated.
 */
export interface SimDynamoDbReplicaUpdateInput {
  readonly Create?: SimDynamoDbReplicaRegionInput | undefined;
  readonly Delete?: SimDynamoDbReplicaRegionInput | undefined;
  readonly Update?: SimDynamoDbReplicaRegionInput | undefined;
}

/**
 * Minimal structural sim DynamoDB replica, as a replica update names one.
 */
export interface SimDynamoDbReplicaRegionInput {
  readonly RegionName?: string | undefined;
}

/**
 * Minimal structural sim DynamoDB projection, as a request carries it.
 */
export interface SimDynamoDbProjectionInput {
  readonly ProjectionType?: string | undefined;
  readonly NonKeyAttributes?: readonly string[] | undefined;
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
  readonly Backfilling?: boolean | undefined;
  readonly IndexArn?: SimArn | undefined;
  readonly ProvisionedThroughput?:
    | SimDynamoDbProvisionedThroughputDescription
    | undefined;
  readonly ItemCount?: number | undefined;
  readonly IndexSizeBytes?: number | undefined;
}

/**
 * Minimal structural sim DynamoDB local secondary index description.
 *
 * There is no `IndexStatus` and no `ProvisionedThroughput` here, unlike the
 * global secondary index description. A local secondary index is built with the
 * table that carries it and reads out of the table's own capacity, so DynamoDB
 * reports neither.
 */
export interface SimDynamoDbLocalSecondaryIndexDescription {
  readonly IndexName?: string | undefined;
  readonly KeySchema?: readonly SimDynamoDbKeySchemaElement[] | undefined;
  readonly Projection?: SimDynamoDbProjection | undefined;
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
  | "CREATING"
  | "UPDATING"
  | "DELETING"
  | "ACTIVE";
