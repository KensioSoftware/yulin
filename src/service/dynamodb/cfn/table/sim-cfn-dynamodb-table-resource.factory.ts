import { MappedFactory } from "@kensio/part-factory";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { simCfnDynamoDbTableKeyProperties } from "./sim-cfn-dynamodb-table-key-properties.js";

/**
 * What a test asks for when it wants an `AWS::DynamoDB::Table` Resource.
 *
 * A table is mostly its name and its key, and the rest of the Resource is the
 * same every time. `properties` is what the template says beyond that, and it
 * is applied last, so a test that needs a property of its own states that one
 * property rather than the whole Resource.
 */
export interface SimCfnDynamoDbTableResourceInput {
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
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Builds the `AWS::DynamoDB::Table` Resource a template carries.
 *
 * ```typescript
 * template: {
 *   Resources: {
 *     OrdersTable: simCfnDynamoDbTableResourceFactory.make({
 *       tableName: "orders",
 *       properties: { Tags: [{ Key: "Environment", Value: "test" }] },
 *     }),
 *   },
 * }
 * ```
 *
 * Nothing here decides what a property is allowed to be. The Resource is
 * deployed through the ordinary CloudFormation path, so a value this builds is
 * checked by the same CreateTable rules an SDK caller's table is.
 */
export const simCfnDynamoDbTableResourceFactory = new MappedFactory<
  SimCfnDynamoDbTableResourceInput,
  SimCfnTemplateValueRecord
>(
  () => ({
    tableName: undefined,
    partitionKeyName: "id",
    partitionKeyType: "S",
    sortKeyName: undefined,
    sortKeyType: "S",
    billingMode: "PAY_PER_REQUEST",
    properties: {},
  }),
  (input) => ({
    Type: "AWS::DynamoDB::Table",
    Properties: {
      ...simCfnDynamoDbTableNameProperty(input.tableName),
      ...simCfnDynamoDbTableKeyProperties(input),
      BillingMode: input.billingMode,
      ...input.properties,
    },
  }),
);

/**
 * The `TableName` property, for a template that names its table.
 *
 * Both Resource types that make a table name it the same way, so both build
 * the property here.
 */
export function simCfnDynamoDbTableNameProperty(
  tableName: string | undefined,
): SimCfnTemplateValueRecord {
  if (tableName === undefined) {
    return {};
  }

  return { TableName: tableName };
}
