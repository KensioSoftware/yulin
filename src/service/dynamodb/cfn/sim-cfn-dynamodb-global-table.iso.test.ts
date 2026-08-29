import {
  DescribeTableCommand,
  GetItemCommand,
  ListTagsOfResourceCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertObjectEquals,
  assertStringStartsWith,
  assertTrue,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { simCfnDynamoDbGlobalTableResourceFactory } from "./global-table/sim-cfn-dynamodb-global-table-resource.factory.js";

/**
 * A template holding one unnamed on-demand global table with a partition and a
 * sort key, replicated nowhere but the region the stack is in.
 */
const ordersTableTemplate = {
  Resources: {
    OrdersTable: simCfnDynamoDbGlobalTableResourceFactory.make({
      partitionKeyName: "customerId",
      sortKeyName: "orderId",
    }),
  },
  Outputs: {
    OrdersTableName: { Value: { Ref: "OrdersTable" } },
  },
};

describe("DynamoDB CloudFormation GlobalTable deployment", () => {
  it("creates a table from a global table naming one replica", async () => {
    // Given a template declaring a named global table replicated to the one
    // region the stack is in, which is what CDK's TableV2 synthesises for a
    // table that asked for no replicas at all.
    const simAws = new SimAws();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersTable: simCfnDynamoDbGlobalTableResourceFactory.make({
            tableName: "orders",
            partitionKeyName: "customerId",
            sortKeyName: "orderId",
          }),
        },
      },
    });
    await stack.waitForDeployComplete();
    await simAws.backgroundTasksComplete();

    // Then DescribeTable finds an ordinary table, because with one replica
    // that is what a global table is.
    const described = await simAws
      .dynamoDb()
      .describeTable(new DescribeTableCommand({ TableName: "orders" }));

    assertNonNullable(described.Table);
    assertNonNullable(described.Table.KeySchema);
    assertIdentical(described.Table.TableStatus, "ACTIVE");
    assertIdentical(
      described.Table.TableArn,
      `arn:aws:dynamodb:${simAws.defaultRegionName}:` +
        `${simAws.defaultAccountId}:table/orders`,
    );
    assertIdentical(
      described.Table.KeySchema.at(0)?.AttributeName,
      "customerId",
    );
    assertIdentical(described.Table.KeySchema.at(1)?.AttributeName, "orderId");
    assertIdentical(
      described.Table.BillingModeSummary?.BillingMode,
      "PAY_PER_REQUEST",
    );
  });

  it("takes the settings a global table puts on its replica", async () => {
    // Given a template stating on the replica what an ordinary table states
    // about itself: its class, its protection and its tags.
    const simAws = new SimAws();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersTable: simCfnDynamoDbGlobalTableResourceFactory.make({
            tableName: "orders",
            replicaProperties: {
              TableClass: "STANDARD_INFREQUENT_ACCESS",
              DeletionProtectionEnabled: true,
              Tags: [{ Key: "Environment", Value: "test" }],
            },
          }),
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then they are on the table, since the replica is the table.
    const described = await simAws
      .dynamoDb()
      .describeTable(new DescribeTableCommand({ TableName: "orders" }));

    assertNonNullable(described.Table);
    assertIdentical(
      described.Table.TableClassSummary?.TableClass,
      "STANDARD_INFREQUENT_ACCESS",
    );
    assertTrue(described.Table.DeletionProtectionEnabled);

    const tags = await simAws.dynamoDb().listTagsOfResource(
      new ListTagsOfResourceCommand({
        ResourceArn: described.Table.TableArn,
      }),
    );
    assertArrayLength(tags.Tags, 1);
    assertObjectEquals(tags.Tags[0], { Key: "Environment", Value: "test" });
  });

  it("provisions a table from the two halves its capacity is split into", async () => {
    // Given a template provisioning writes on the table and reads on the
    // replica, which is how a global table states the capacity an ordinary
    // table states in one place.
    const simAws = new SimAws();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersTable: simCfnDynamoDbGlobalTableResourceFactory.make({
            tableName: "orders",
            billingMode: "PROVISIONED",
            properties: {
              WriteProvisionedThroughputSettings: { WriteCapacityUnits: 3 },
            },
            replicaProperties: {
              ReadProvisionedThroughputSettings: { ReadCapacityUnits: 5 },
            },
          }),
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the two halves are the one capacity reported back off the table.
    const described = await simAws
      .dynamoDb()
      .describeTable(new DescribeTableCommand({ TableName: "orders" }));

    assertNonNullable(described.Table?.ProvisionedThroughput);
    assertIdentical(described.Table.ProvisionedThroughput.ReadCapacityUnits, 5);
    assertIdentical(
      described.Table.ProvisionedThroughput.WriteCapacityUnits,
      3,
    );
  });

  it("provisions a secondary index from the two halves of its capacity", async () => {
    // Given a template declaring an index on the table and provisioning its
    // reads on the replica, which names the index rather than restating it.
    const simAws = new SimAws();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersTable: simCfnDynamoDbGlobalTableResourceFactory.make({
            tableName: "orders",
            partitionKeyName: "customerId",
            billingMode: "PROVISIONED",
            properties: {
              AttributeDefinitions: [
                { AttributeName: "customerId", AttributeType: "S" },
                { AttributeName: "status", AttributeType: "S" },
              ],
              WriteProvisionedThroughputSettings: { WriteCapacityUnits: 2 },
              GlobalSecondaryIndexes: [
                {
                  IndexName: "byStatus",
                  KeySchema: [{ AttributeName: "status", KeyType: "HASH" }],
                  Projection: { ProjectionType: "ALL" },
                  WriteProvisionedThroughputSettings: {
                    WriteCapacityUnits: 4,
                  },
                },
              ],
            },
            replicaProperties: {
              ReadProvisionedThroughputSettings: { ReadCapacityUnits: 1 },
              GlobalSecondaryIndexes: [
                {
                  IndexName: "byStatus",
                  ReadProvisionedThroughputSettings: { ReadCapacityUnits: 7 },
                },
              ],
            },
          }),
        },
      },
    });
    await stack.waitForDeployComplete();
    await simAws.backgroundTasksComplete();

    // Then the index carries the capacity both halves named.
    const described = await simAws
      .dynamoDb()
      .describeTable(new DescribeTableCommand({ TableName: "orders" }));

    const index = described.Table?.GlobalSecondaryIndexes?.at(0);
    assertNonNullable(index?.ProvisionedThroughput);
    assertIdentical(index.IndexName, "byStatus");
    assertIdentical(index.ProvisionedThroughput.ReadCapacityUnits, 7);
    assertIdentical(index.ProvisionedThroughput.WriteCapacityUnits, 4);
  });

  it("gives the table the stream its global table asked for", async () => {
    // Given a template asking for a stream, which a global table states the
    // way an ordinary table does.
    const simAws = new SimAws();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersTable: simCfnDynamoDbGlobalTableResourceFactory.make({
            tableName: "orders",
            properties: {
              StreamSpecification: { StreamViewType: "NEW_AND_OLD_IMAGES" },
            },
          }),
        },
        Outputs: {
          TableStreamArn: {
            Value: { "Fn::GetAtt": ["OrdersTable", "StreamArn"] },
          },
        },
      },
    });
    await stack.waitForDeployComplete();
    await simAws.backgroundTasksComplete();

    // Then the table has a stream, and Fn::GetAtt answers with its ARN.
    const described = await simAws
      .dynamoDb()
      .describeTable(new DescribeTableCommand({ TableName: "orders" }));

    assertNonNullable(described.Table);
    assertIdentical(
      described.Table.StreamSpecification?.StreamViewType,
      "NEW_AND_OLD_IMAGES",
    );
    assertIdentical(
      stack.outputs.get("TableStreamArn")?.value,
      described.Table.LatestStreamArn,
    );
  });

  it("resolves Ref to the table name and Fn::GetAtt to its ARN and ID", async () => {
    // Given a template referencing its global table every way the Resource
    // type documents.
    const simAws = new SimAws();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersTable: simCfnDynamoDbGlobalTableResourceFactory.make({
            tableName: "orders",
          }),
        },
        Outputs: {
          TableRef: { Value: { Ref: "OrdersTable" } },
          TableArn: { Value: { "Fn::GetAtt": ["OrdersTable", "Arn"] } },
          TableId: { Value: { "Fn::GetAtt": ["OrdersTable", "TableId"] } },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then Ref is the table name, as AWS::DynamoDB::GlobalTable Ref is, so it
    // can be handed straight to PutItem.
    assertIdentical(stack.outputs.get("TableRef")?.value, "orders");

    const described = await simAws
      .dynamoDb()
      .describeTable(new DescribeTableCommand({ TableName: "orders" }));
    assertIdentical(
      stack.outputs.get("TableArn")?.value,
      described.Table?.TableArn,
    );
    assertIdentical(
      stack.outputs.get("TableId")?.value,
      described.Table?.TableId,
    );
  });

  it("writes and reads an item through the table a Ref names", async () => {
    // Given a deployed global table whose name the stack outputs, left unnamed
    // as CDK leaves one it lets CloudFormation name.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: ordersTableTemplate,
    });
    await stack.waitForDeployComplete();

    const tableName = stack.outputs.get("OrdersTableName")?.value;
    assertTypeString(tableName);
    assertStringStartsWith(tableName, "orders-stack-OrdersTable-");

    // When an item is written to the table the Ref named.
    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: tableName,
        Item: {
          customerId: { S: "customer-1" },
          orderId: { S: "order-1" },
          total: { N: "42.5" },
        },
      }),
    );

    // Then it reads back off the deployed table.
    const read = await simAws.dynamoDb().getItem(
      new GetItemCommand({
        TableName: tableName,
        Key: { customerId: { S: "customer-1" }, orderId: { S: "order-1" } },
      }),
    );

    assertIdentical(read.Item?.["total"]?.N, "42.5");
  });

  it("creates the table in the Region its one replica names", async () => {
    // Given a template deployed through a scoped simulated CloudFormation,
    // with the replica naming the region the stack is deploying into.
    const simAws = new SimAws();
    const scoped = simAws.account("222222222222").region("eu-west-2");

    // When the template is deployed.
    const stack = await scoped.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersTable: simCfnDynamoDbGlobalTableResourceFactory.make({
            tableName: "orders",
            replicaRegions: ["eu-west-2"],
          }),
        },
        Outputs: {
          TableArn: { Value: { "Fn::GetAtt": ["OrdersTable", "Arn"] } },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the table is in that scope.
    assertIdentical(
      stack.outputs.get("TableArn")?.value,
      "arn:aws:dynamodb:eu-west-2:222222222222:table/orders",
    );
    assertNonNullable(scoped.dynamoDb().findTable("orders"));
  });
});
