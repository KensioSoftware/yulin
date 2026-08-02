import { MappedFactory } from "@kensio/part-factory";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";

/**
 * What a test asks for when it wants an `AWS::DynamoDB::Table` Resource
 * carrying a secondary index of each kind.
 *
 * The keys are fixed, since what a test of the CloudFormation path is about is
 * the properties reaching CreateTable rather than which attribute is the key.
 * `properties` is what the template says beyond that, and it is applied last,
 * so a test that needs one property of its own states that one.
 */
export interface SimCfnDynamoDbIndexedTableResourceInput {
  readonly tableName: string;
  readonly globalIndexName: string;
  readonly localIndexName: string;
  readonly projectionType: string;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Builds the `AWS::DynamoDB::Table` Resource of a table with one global and one
 * local secondary index.
 *
 * The table is keyed by `customerId` and `orderId`. The global index is keyed
 * by `status` and `orderId`, which is a partition key the table does not have.
 * The local index is keyed by the table's own `customerId` and by `total`,
 * which reorders one customer's orders.
 *
 * ```typescript
 * template: {
 *   Resources: {
 *     OrdersTable: simCfnDynamoDbIndexedTableResourceFactory.make({}),
 *   },
 * }
 * ```
 */
export const simCfnDynamoDbIndexedTableResourceFactory = new MappedFactory<
  SimCfnDynamoDbIndexedTableResourceInput,
  SimCfnTemplateValueRecord
>(
  () => ({
    tableName: "orders",
    globalIndexName: "byStatus",
    localIndexName: "byTotal",
    projectionType: "ALL",
    properties: {},
  }),
  (input) => ({
    Type: "AWS::DynamoDB::Table",
    Properties: {
      TableName: input.tableName,
      KeySchema: [
        { AttributeName: "customerId", KeyType: "HASH" },
        { AttributeName: "orderId", KeyType: "RANGE" },
      ],
      AttributeDefinitions: [
        { AttributeName: "customerId", AttributeType: "S" },
        { AttributeName: "orderId", AttributeType: "S" },
        { AttributeName: "status", AttributeType: "S" },
        { AttributeName: "total", AttributeType: "N" },
      ],
      BillingMode: "PAY_PER_REQUEST",
      GlobalSecondaryIndexes: [
        {
          IndexName: input.globalIndexName,
          KeySchema: [
            { AttributeName: "status", KeyType: "HASH" },
            { AttributeName: "orderId", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: input.projectionType },
        },
      ],
      LocalSecondaryIndexes: [
        {
          IndexName: input.localIndexName,
          KeySchema: [
            { AttributeName: "customerId", KeyType: "HASH" },
            { AttributeName: "total", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: input.projectionType },
        },
      ],
      ...input.properties,
    },
  }),
);
