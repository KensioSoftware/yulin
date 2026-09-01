import {
  DescribeTableCommand,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";
import {
  DescribeStacksCommand,
  UpdateStackCommand,
} from "@aws-sdk/client-cloudformation";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { jsonStringify } from "../../../util/type-guard/json.js";
import { SimAws } from "../../aws/sim-aws.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import { simCfnDynamoDbIndexedTableResourceFactory } from "./table/sim-cfn-dynamodb-indexed-table-resource.factory.js";
import { simCfnDynamoDbTableResourceFactory } from "./table/sim-cfn-dynamodb-table-resource.factory.js";

/**
 * Deploy a table with one secondary index of each kind, and put two orders for
 * one customer on it.
 */
async function deployIndexedOrders(simAws: SimAws): Promise<void> {
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "orders-stack",
    template: {
      Resources: {
        OrdersTable: simCfnDynamoDbIndexedTableResourceFactory.make({}),
      },
    },
  });
  await stack.waitForDeployComplete();
  await simAws.backgroundTasksComplete();

  await simAws.dynamoDb().putItem(
    new PutItemCommand({
      TableName: "orders",
      Item: {
        customerId: { S: "customer-1" },
        orderId: { S: "order-1" },
        status: { S: "OPEN" },
        total: { N: "42" },
      },
    }),
  );
  await simAws.dynamoDb().putItem(
    new PutItemCommand({
      TableName: "orders",
      Item: {
        customerId: { S: "customer-1" },
        orderId: { S: "order-2" },
        status: { S: "SHIPPED" },
        total: { N: "7" },
      },
    }),
  );
}

describe("DynamoDB CloudFormation Table secondary indexes", () => {
  it("refuses an update that creates two global secondary indexes", async () => {
    // Given a deployed table with one index and an item stored in it.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();
    const initialTable = simCfnDynamoDbTableResourceFactory.make({
      tableName: "orders",
      partitionKeyName: "orderId",
      properties: {
        AttributeDefinitions: [
          { AttributeName: "orderId", AttributeType: "S" },
          { AttributeName: "first", AttributeType: "S" },
        ],
        GlobalSecondaryIndexes: [
          {
            IndexName: "byFirst",
            KeySchema: [{ AttributeName: "first", KeyType: "HASH" }],
            Projection: { ProjectionType: "ALL" },
          },
        ],
      },
    });
    const stack = await cloudFormation.deployTemplate({
      stackName: "orders-stack",
      template: { Resources: { OrdersTable: initialTable } },
    });
    await stack.waitForDeployComplete();
    await simAws.backgroundTasksComplete();
    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: "orders",
        Item: {
          orderId: { S: "order-1" },
          first: { S: "one" },
          second: { S: "two" },
          third: { S: "three" },
        },
      }),
    );
    const tableBeforeUpdate = simAws.dynamoDb().findTable("orders");

    // When one CloudFormation update adds two indexes.
    const updatedTable = simCfnDynamoDbTableResourceFactory.make({
      tableName: "orders",
      partitionKeyName: "orderId",
      properties: {
        AttributeDefinitions: [
          { AttributeName: "orderId", AttributeType: "S" },
          { AttributeName: "first", AttributeType: "S" },
          { AttributeName: "second", AttributeType: "S" },
          { AttributeName: "third", AttributeType: "S" },
        ],
        GlobalSecondaryIndexes: [
          {
            IndexName: "byFirst",
            KeySchema: [{ AttributeName: "first", KeyType: "HASH" }],
            Projection: { ProjectionType: "ALL" },
          },
          {
            IndexName: "bySecond",
            KeySchema: [{ AttributeName: "second", KeyType: "HASH" }],
            Projection: { ProjectionType: "ALL" },
          },
          {
            IndexName: "byThird",
            KeySchema: [{ AttributeName: "third", KeyType: "HASH" }],
            Projection: { ProjectionType: "ALL" },
          },
        ],
      },
    });
    await cloudFormation.updateStack(
      new UpdateStackCommand({
        StackName: "orders-stack",
        TemplateBody: jsonStringify({
          Resources: { OrdersTable: updatedTable },
        }),
      }),
    );
    const error = await assertThrowsErrorAsync(async () => {
      await cloudFormation.waitForStackUpdateComplete("orders-stack");
    });

    // Then DynamoDB refuses the update before the table changes.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertIdentical(error.name, "ValidationException");
    assertIdentical(error.$metadata.httpStatusCode, 400);
    assertIdentical(
      error.message,
      "Cannot perform more than one GSI creation or deletion in a single update",
    );
    assertIdentical(simAws.dynamoDb().findTable("orders"), tableBeforeUpdate);

    const describedTable = await simAws
      .dynamoDb()
      .describeTable(new DescribeTableCommand({ TableName: "orders" }));
    assertArrayLength(describedTable.Table?.GlobalSecondaryIndexes, 1);
    assertIdentical(
      describedTable.Table.GlobalSecondaryIndexes[0].IndexName,
      "byFirst",
    );

    const stored = await simAws.dynamoDb().getItem(
      new GetItemCommand({
        TableName: "orders",
        Key: { orderId: { S: "order-1" } },
      }),
    );
    assertIdentical(stored.Item?.["third"]?.S, "three");

    const describedStack = await cloudFormation.describeStacks(
      new DescribeStacksCommand({ StackName: "orders-stack" }),
    );
    assertIdentical(describedStack.Stacks?.[0]?.StackStatus, "UPDATE_FAILED");
  });

  it("describes the indexes a template declares", async () => {
    // Given a template declaring a global and a local secondary index.
    const simAws = new SimAws();

    // When the template is deployed.
    await deployIndexedOrders(simAws);

    // Then the table describes both, the way an SDK caller's table does.
    const described = await simAws
      .dynamoDb()
      .describeTable(new DescribeTableCommand({ TableName: "orders" }));

    assertNonNullable(described.Table);
    assertArrayLength(described.Table.GlobalSecondaryIndexes, 1);
    assertArrayLength(described.Table.LocalSecondaryIndexes, 1);

    const global = described.Table.GlobalSecondaryIndexes[0];
    assertIdentical(global.IndexName, "byStatus");
    assertIdentical(global.IndexStatus, "ACTIVE");
    assertIdentical(global.KeySchema?.at(0)?.AttributeName, "status");
    assertIdentical(global.Projection?.ProjectionType, "ALL");
    assertIdentical(
      global.IndexArn,
      `${described.Table.TableArn ?? ""}/index/byStatus`,
    );

    const local = described.Table.LocalSecondaryIndexes[0];
    assertIdentical(local.IndexName, "byTotal");
    assertIdentical(local.KeySchema?.at(1)?.AttributeName, "total");
  });

  it("queries the global secondary index a template declared", async () => {
    // Given a deployed indexed table holding two orders.
    const simAws = new SimAws();
    await deployIndexedOrders(simAws);

    // When the global index is queried by the partition key it has of its own.
    const shipped = await simAws.dynamoDb().query(
      new QueryCommand({
        TableName: "orders",
        IndexName: "byStatus",
        KeyConditionExpression: "#status = :status",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":status": { S: "SHIPPED" } },
      }),
    );

    // Then it answers with the order in that status alone.
    assertIdentical(shipped.Count, 1);
    assertIdentical(shipped.Items?.[0]?.["orderId"]?.S, "order-2");
  });

  it("queries the local secondary index a template declared", async () => {
    // Given the same deployed table.
    const simAws = new SimAws();
    await deployIndexedOrders(simAws);

    // When the local index is queried, which sorts the customer's orders by
    // total rather than by order ID.
    const byTotal = await simAws.dynamoDb().query(
      new QueryCommand({
        TableName: "orders",
        IndexName: "byTotal",
        KeyConditionExpression: "customerId = :customerId",
        ExpressionAttributeValues: { ":customerId": { S: "customer-1" } },
      }),
    );

    // Then both orders come back in total order, cheapest first.
    assertIdentical(byTotal.Count, 2);
    assertIdentical(byTotal.Items?.[0]?.["orderId"]?.S, "order-2");
    assertIdentical(byTotal.Items[1]?.["orderId"]?.S, "order-1");
  });

  it("projects the attributes a template's index names", async () => {
    // Given a template whose global index projects named attributes rather
    // than the whole item.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersTable: simCfnDynamoDbTableResourceFactory.make({
            tableName: "orders",
            partitionKeyName: "orderId",
            properties: {
              AttributeDefinitions: [
                { AttributeName: "orderId", AttributeType: "S" },
                { AttributeName: "status", AttributeType: "S" },
              ],
              GlobalSecondaryIndexes: [
                {
                  IndexName: "byStatus",
                  KeySchema: [{ AttributeName: "status", KeyType: "HASH" }],
                  Projection: {
                    ProjectionType: "INCLUDE",
                    NonKeyAttributes: ["total"],
                  },
                },
              ],
            },
          }),
        },
      },
    });
    await stack.waitForDeployComplete();
    await simAws.backgroundTasksComplete();

    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: "orders",
        Item: {
          orderId: { S: "order-1" },
          status: { S: "OPEN" },
          total: { N: "42" },
          note: { S: "Gift wrap" },
        },
      }),
    );

    // When the index is read.
    const open = await simAws.dynamoDb().query(
      new QueryCommand({
        TableName: "orders",
        IndexName: "byStatus",
        KeyConditionExpression: "#status = :status",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":status": { S: "OPEN" } },
      }),
    );

    // Then it answers with the named attribute and not with the rest of the
    // item, so the template's Projection reached the index.
    assertIdentical(open.Items?.[0]?.["total"]?.N, "42");
    assertUndefined(open.Items[0]["note"]);
  });

  it("provisions the capacity a template gives a global index", async () => {
    // Given a provisioned table whose global index is provisioned separately,
    // as a provisioned table's index has to be.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersTable: simCfnDynamoDbIndexedTableResourceFactory.make({
            properties: {
              BillingMode: "PROVISIONED",
              ProvisionedThroughput: {
                ReadCapacityUnits: 5,
                WriteCapacityUnits: 3,
              },
              GlobalSecondaryIndexes: [
                {
                  IndexName: "byStatus",
                  KeySchema: [{ AttributeName: "status", KeyType: "HASH" }],
                  Projection: { ProjectionType: "KEYS_ONLY" },
                  ProvisionedThroughput: {
                    ReadCapacityUnits: 2,
                    WriteCapacityUnits: 1,
                  },
                },
              ],
            },
          }),
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the index reports the capacity of its own that the template gave it.
    const described = await simAws
      .dynamoDb()
      .describeTable(new DescribeTableCommand({ TableName: "orders" }));

    const throughput =
      described.Table?.GlobalSecondaryIndexes?.[0]?.ProvisionedThroughput;
    assertIdentical(throughput?.ReadCapacityUnits, 2);
    assertIdentical(throughput.WriteCapacityUnits, 1);
  });
});
