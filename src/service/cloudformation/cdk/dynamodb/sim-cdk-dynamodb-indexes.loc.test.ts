import {
  DescribeTableCommand,
  PutItemCommand,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertTypeString,
} from "@kensio/smartass";
import path from "node:path";
import { describe, it } from "vitest";

/**
 * Slower local integration test. Calls the real CDK CLI to synth the output
 * template file to pass to sim CloudFormation, so the template under test is
 * one CDK actually produced rather than one written by hand.
 */
import { SimAws } from "../../../aws/sim-aws.js";
import { TestCdkProject } from "../../../../util/filesystem/test-cdk-project.js";

const accountIdOneOnes = "111111111111";

describe("Sim CDK DynamoDB secondary index deployment local integration", () => {
  it("deploys a CDK table an SDK caller then queries both indexes of", async () => {
    // Given a CDK stack with a table carrying one global and one local
    // secondary index, added the way CDK adds them.
    const cdkProject = new TestCdkProject();
    await cdkProject.writeCdkAppFile(
      `
import * as cdk from "aws-cdk-lib/core";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";

const app = new cdk.App();
const stack = new cdk.Stack(app, "TestStack", {
  env: { account: "111111111111", region: "eu-west-2" },
});

const ordersTable = new dynamodb.Table(stack, "OrdersTable", {
  partitionKey: { name: "customerId", type: dynamodb.AttributeType.STRING },
  sortKey: { name: "orderId", type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
});

ordersTable.addGlobalSecondaryIndex({
  indexName: "byStatus",
  partitionKey: { name: "status", type: dynamodb.AttributeType.STRING },
  sortKey: { name: "orderId", type: dynamodb.AttributeType.STRING },
});

ordersTable.addLocalSecondaryIndex({
  indexName: "byTotal",
  sortKey: { name: "total", type: dynamodb.AttributeType.NUMBER },
});

new cdk.CfnOutput(stack, "OrdersTableName", {
  value: ordersTable.tableName,
});

app.synth();
      `,
    );

    // And we synth the CDK template.
    const cdkOutDirectory = await cdkProject.synth();

    // When we deploy the synthesized template, with no hand-editing of the
    // GlobalSecondaryIndexes and LocalSecondaryIndexes properties CDK emits.
    const simAws = new SimAws();
    const scoped = simAws.account(accountIdOneOnes).region("eu-west-2");
    const stack = await scoped
      .cloudFormation()
      .deployTemplateFile(
        path.join(cdkOutDirectory, "TestStack.template.json"),
      );
    await simAws.backgroundTasksComplete();

    const tableName = stack.outputs.get("OrdersTableName")?.value;
    assertTypeString(tableName);

    // Then the deployed table describes both indexes.
    const described = await scoped
      .dynamoDb()
      .describeTable(new DescribeTableCommand({ TableName: tableName }));

    assertNonNullable(described.Table);
    assertArrayLength(described.Table.GlobalSecondaryIndexes, 1);
    assertArrayLength(described.Table.LocalSecondaryIndexes, 1);
    assertIdentical(
      described.Table.GlobalSecondaryIndexes[0].IndexName,
      "byStatus",
    );
    assertIdentical(
      described.Table.GlobalSecondaryIndexes[0].IndexStatus,
      "ACTIVE",
    );
    assertIdentical(
      described.Table.LocalSecondaryIndexes[0].IndexName,
      "byTotal",
    );

    // And two orders written to it are found through both indexes.
    await scoped.dynamoDb().putItem(
      new PutItemCommand({
        TableName: tableName,
        Item: {
          customerId: { S: "customer-1" },
          orderId: { S: "order-1" },
          status: { S: "OPEN" },
          total: { N: "42" },
        },
      }),
    );
    await scoped.dynamoDb().putItem(
      new PutItemCommand({
        TableName: tableName,
        Item: {
          customerId: { S: "customer-1" },
          orderId: { S: "order-2" },
          status: { S: "SHIPPED" },
          total: { N: "7" },
        },
      }),
    );

    const shipped = await scoped.dynamoDb().query(
      new QueryCommand({
        TableName: tableName,
        IndexName: "byStatus",
        KeyConditionExpression: "#status = :status",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":status": { S: "SHIPPED" } },
      }),
    );

    assertIdentical(shipped.Count, 1);
    assertIdentical(shipped.Items?.[0]?.["orderId"]?.S, "order-2");

    // The local index sorts the customer's orders by total rather than by
    // order ID, so the cheaper order comes first.
    const byTotal = await scoped.dynamoDb().query(
      new QueryCommand({
        TableName: tableName,
        IndexName: "byTotal",
        KeyConditionExpression: "customerId = :customerId",
        ExpressionAttributeValues: { ":customerId": { S: "customer-1" } },
      }),
    );

    assertIdentical(byTotal.Count, 2);
    assertIdentical(byTotal.Items?.[0]?.["orderId"]?.S, "order-2");
    assertIdentical(byTotal.Items[1]?.["orderId"]?.S, "order-1");

    await simAws.backgroundTasksComplete();
  });
});
