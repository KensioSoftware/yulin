import { DescribeTableCommand, QueryCommand } from "@aws-sdk/client-dynamodb";
import {
  assertArrayEquals,
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

describe("Sim CDK DynamoDB multi-attribute index key local integration", () => {
  it("deploys an index CDK keys by several attributes, and queries it", async () => {
    // Given a CDK stack with a TableV2 whose index takes partitionKeys and
    // sortKeys.
    const cdkProject = new TestCdkProject();
    await cdkProject.writeCdkAppFile(
      `
import * as cdk from "aws-cdk-lib/core";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";

const app = new cdk.App();
const stack = new cdk.Stack(app, "TestStack", {
  env: { account: "111111111111", region: "eu-west-2" },
});

const ordersTable = new dynamodb.TableV2(stack, "OrdersTable", {
  partitionKey: { name: "orderId", type: dynamodb.AttributeType.STRING },
  globalSecondaryIndexes: [
    {
      indexName: "byWarehouse",
      partitionKeys: [
        { name: "region", type: dynamodb.AttributeType.STRING },
        { name: "warehouse", type: dynamodb.AttributeType.STRING },
      ],
      sortKeys: [
        { name: "status", type: dynamodb.AttributeType.STRING },
        { name: "priority", type: dynamodb.AttributeType.NUMBER },
      ],
    },
  ],
});

new cdk.CfnOutput(stack, "OrdersTableName", {
  value: ordersTable.tableName,
});

app.synth();
      `,
    );
    const cdkOutDirectory = await cdkProject.synth();

    // When the synthesized template is deployed and orders are written.
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

    await Promise.all(
      [
        { orderId: "order-1", priority: "10" },
        { orderId: "order-2", priority: "9" },
      ].map(async ({ orderId, priority }) =>
        scoped.dynamoDb().putItem({
          input: {
            TableName: tableName,
            Item: {
              orderId: { S: orderId },
              region: { S: "north" },
              warehouse: { S: "w1" },
              status: { S: "OPEN" },
              priority: { N: priority },
            },
          },
        }),
      ),
    );

    // Then the table describes the index with every key attribute.
    const described = await scoped
      .dynamoDb()
      .describeTable(new DescribeTableCommand({ TableName: tableName }));
    const index = described.Table?.GlobalSecondaryIndexes?.at(0);
    assertNonNullable(index);
    assertArrayEquals(
      (index.KeySchema ?? []).map((element) => element.AttributeName),
      ["region", "warehouse", "status", "priority"],
    );

    // And a query naming the whole partition key reads the orders in sort key
    // order, the lower priority first.
    const page = await scoped.dynamoDb().query(
      new QueryCommand({
        TableName: tableName,
        IndexName: "byWarehouse",
        KeyConditionExpression:
          "#region = :region AND warehouse = :warehouse AND #status = :status",
        ExpressionAttributeNames: { "#region": "region", "#status": "status" },
        ExpressionAttributeValues: {
          ":region": { S: "north" },
          ":warehouse": { S: "w1" },
          ":status": { S: "OPEN" },
        },
      }),
    );
    assertArrayEquals(
      (page.Items ?? []).map((item) => item["orderId"]?.S),
      ["order-2", "order-1"],
    );
  });
});
