import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type {
  SimDynamoDbAttributeDefinitionInput,
  SimDynamoDbGlobalSecondaryIndexUpdateInput,
  SimDynamoDbKeySchemaElementInput,
  SimDynamoDbOnDemandThroughput,
  SimDynamoDbProvisionedThroughput,
  SimDynamoDbReplicaUpdateInput,
  SimDynamoDbSecondaryIndexInput,
  SimDynamoDbSseSpecification,
  SimDynamoDbTableDescription,
  SimDynamoDbTagInput,
  SimDynamoDbWarmThroughput,
} from "./table.types.js";
import type { SimDynamoDbStreamSpecification } from "../../stream/sim-dynamodb-stream.types.js";

/**
 * Minimal structural sim DynamoDB CreateTable command.
 */
export interface SimCreateTableCommand {
  readonly input: SimCreateTableCommandInput;
}

/**
 * Minimal structural sim DynamoDB CreateTable input.
 *
 * The values a request carries are typed as loosely as the wire carries them,
 * so a caller that is not using the AWS SDK's own types reaches the same
 * validation an SDK caller does rather than being stopped by the compiler.
 */
export interface SimCreateTableCommandInput {
  readonly TableName?: string | undefined;
  readonly AttributeDefinitions?:
    readonly SimDynamoDbAttributeDefinitionInput[] | undefined;
  readonly KeySchema?: readonly SimDynamoDbKeySchemaElementInput[] | undefined;
  readonly BillingMode?: string | undefined;
  readonly ProvisionedThroughput?: SimDynamoDbProvisionedThroughput | undefined;
  readonly TableClass?: string | undefined;
  readonly DeletionProtectionEnabled?: boolean | undefined;
  readonly GlobalSecondaryIndexes?:
    readonly SimDynamoDbSecondaryIndexInput[] | undefined;
  readonly LocalSecondaryIndexes?:
    readonly SimDynamoDbSecondaryIndexInput[] | undefined;
  readonly Tags?: readonly SimDynamoDbTagInput[] | undefined;
  readonly StreamSpecification?: SimDynamoDbStreamSpecification | undefined;
  readonly SSESpecification?: SimDynamoDbSseSpecification | undefined;
  readonly ResourcePolicy?: string | undefined;
  readonly OnDemandThroughput?: SimDynamoDbOnDemandThroughput | undefined;
  readonly WarmThroughput?: SimDynamoDbWarmThroughput | undefined;
}

/**
 * Minimal structural sim DynamoDB CreateTable output.
 */
export interface SimCreateTableCommandOutput {
  readonly TableDescription?: SimDynamoDbTableDescription;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim DynamoDB UpdateTable command.
 */
export interface SimUpdateTableCommand {
  readonly input: SimUpdateTableCommandInput;
}

/**
 * Minimal structural sim DynamoDB UpdateTable input.
 *
 * `TableName` takes the table's name or its ARN, as real DynamoDB does. The
 * settings that are not simulated are declared as well as the ones that are, so
 * a request asking for one of them is refused by name rather than accepted and
 * ignored.
 */
export interface SimUpdateTableCommandInput {
  readonly TableName?: string | undefined;
  readonly AttributeDefinitions?:
    readonly SimDynamoDbAttributeDefinitionInput[] | undefined;
  readonly BillingMode?: string | undefined;
  readonly ProvisionedThroughput?: SimDynamoDbProvisionedThroughput | undefined;
  readonly GlobalSecondaryIndexUpdates?:
    readonly SimDynamoDbGlobalSecondaryIndexUpdateInput[] | undefined;
  readonly TableClass?: string | undefined;
  readonly DeletionProtectionEnabled?: boolean | undefined;
  readonly StreamSpecification?: SimDynamoDbStreamSpecification | undefined;
  readonly SSESpecification?: SimDynamoDbSseSpecification | undefined;
  readonly ReplicaUpdates?:
    readonly SimDynamoDbReplicaUpdateInput[] | undefined;
  readonly OnDemandThroughput?: SimDynamoDbOnDemandThroughput | undefined;
  readonly WarmThroughput?: SimDynamoDbWarmThroughput | undefined;
}

/**
 * Minimal structural sim DynamoDB UpdateTable output.
 */
export interface SimUpdateTableCommandOutput {
  readonly TableDescription?: SimDynamoDbTableDescription | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim DynamoDB DescribeTable command.
 */
export interface SimDescribeTableCommand {
  readonly input: SimDescribeTableCommandInput;
}

/**
 * Minimal structural sim DynamoDB DescribeTable input.
 *
 * `TableName` takes the table's name or its ARN, as real DynamoDB does.
 */
export interface SimDescribeTableCommandInput {
  readonly TableName?: string | undefined;
}

/**
 * Minimal structural sim DynamoDB DescribeTable output.
 */
export interface SimDescribeTableCommandOutput {
  readonly Table?: SimDynamoDbTableDescription | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim DynamoDB DeleteTable command.
 */
export interface SimDeleteTableCommand {
  readonly input: SimDeleteTableCommandInput;
}

/**
 * Minimal structural sim DynamoDB DeleteTable input.
 *
 * `TableName` takes the table's name or its ARN, as real DynamoDB does.
 */
export interface SimDeleteTableCommandInput {
  readonly TableName?: string | undefined;
}

/**
 * Minimal structural sim DynamoDB DeleteTable output.
 */
export interface SimDeleteTableCommandOutput {
  readonly TableDescription?: SimDynamoDbTableDescription | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim DynamoDB ListTables command.
 */
export interface SimListTablesCommand {
  readonly input: SimListTablesCommandInput;
}

/**
 * Minimal structural sim DynamoDB ListTables input.
 */
export interface SimListTablesCommandInput {
  readonly ExclusiveStartTableName?: string | undefined;
  readonly Limit?: number | undefined;
}

/**
 * Minimal structural sim DynamoDB ListTables output.
 */
export interface SimListTablesCommandOutput {
  readonly TableNames?: readonly string[] | undefined;
  readonly LastEvaluatedTableName?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}
