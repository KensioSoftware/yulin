import { MappedFactory } from "@kensio/part-factory";
import { DEFAULT_SIM_AWS_REGION_NAME } from "../../../aws/sim-aws-region.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { simCfnDynamoDbTableKeyProperties } from "../table/sim-cfn-dynamodb-table-key-properties.js";
import { simCfnDynamoDbTableNameProperty } from "../table/sim-cfn-dynamodb-table-resource.factory.js";

/**
 * What a test asks for when it wants an `AWS::DynamoDB::GlobalTable` Resource.
 *
 * A global table is an ordinary table plus the regions it replicates to, so
 * this takes what the table Resource builder takes and adds the replicas.
 * `properties` and `replicaProperties` are what the template says beyond that,
 * and each is applied last where it belongs, so a test that needs one property
 * states that one property rather than the whole Resource.
 */
export interface SimCfnDynamoDbGlobalTableResourceInput {
  /**
   * The name the template gives the table, where nothing leaves `TableName`
   * out, as CDK does for a table it lets CloudFormation name.
   */
  readonly tableName: string | undefined;
  readonly partitionKeyName: string;
  readonly partitionKeyType: string;

  /**
   * The sort key the table has, where nothing gives it a partition key alone.
   */
  readonly sortKeyName: string | undefined;
  readonly sortKeyType: string;
  readonly billingMode: string;

  /**
   * The regions the table replicates to, which is the region the stack is in
   * for a `TableV2` that asked for no replicas at all.
   */
  readonly replicaRegions: readonly string[];
  readonly replicaProperties: SimCfnTemplateValueRecord;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Builds the `AWS::DynamoDB::GlobalTable` Resource a template carries.
 *
 * ```typescript
 * template: {
 *   Resources: {
 *     OrdersTable: simCfnDynamoDbGlobalTableResourceFactory.make({
 *       tableName: "orders",
 *       replicaProperties: { TableClass: "STANDARD_INFREQUENT_ACCESS" },
 *     }),
 *   },
 * }
 * ```
 *
 * Nothing here decides what a property is allowed to be. The Resource is
 * deployed through the ordinary CloudFormation path, so a value this builds is
 * checked by the same CreateTable rules an SDK caller's table is.
 */
export const simCfnDynamoDbGlobalTableResourceFactory = new MappedFactory<
  SimCfnDynamoDbGlobalTableResourceInput,
  SimCfnTemplateValueRecord
>(
  () => ({
    tableName: undefined,
    partitionKeyName: "id",
    partitionKeyType: "S",
    sortKeyName: undefined,
    sortKeyType: "S",
    billingMode: "PAY_PER_REQUEST",
    replicaRegions: [DEFAULT_SIM_AWS_REGION_NAME],
    replicaProperties: {},
    properties: {},
  }),
  (input) => ({
    Type: "AWS::DynamoDB::GlobalTable",
    Properties: {
      ...simCfnDynamoDbTableNameProperty(input.tableName),
      ...simCfnDynamoDbTableKeyProperties(input),
      BillingMode: input.billingMode,
      Replicas: input.replicaRegions.map((region) => ({
        Region: region,
        ...input.replicaProperties,
      })),
      ...input.properties,
    },
  }),
);
