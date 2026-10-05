import { PutItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";
import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
  assertTypeString,
} from "@kensio/smartass";
import path from "node:path";
import { describe, it } from "vitest";

/**
 * Slower local integration test. Calls the real CDK CLI to synth the output
 * template file to pass to sim CloudFormation, so the grant policies under
 * test are the ones CDK actually writes.
 */
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { TestCdkProject } from "../../../../util/filesystem/test-cdk-project.js";

describe("Sim CDK DynamoDB index grant local integration", () => {
  it("lets a grant on a table with indexes query one, and refuses a grant on the table imported by name", async () => {
    // Given a CDK stack with a table carrying a global secondary index, one
    // Role granted read access on that table, and another granted it on the
    // same table imported by name, which CDK cannot know has indexes.
    const cdkProject = new TestCdkProject();
    await cdkProject.writeCdkAppFile(
      `
import * as cdk from "aws-cdk-lib/core";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";

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
});

const indexedReader = new iam.Role(stack, "IndexedReader", {
  assumedBy: new iam.AccountRootPrincipal(),
});
ordersTable.grantReadData(indexedReader);

const importedReader = new iam.Role(stack, "ImportedReader", {
  assumedBy: new iam.AccountRootPrincipal(),
});
dynamodb.Table.fromTableName(stack, "ImportedOrders", ordersTable.tableName)
  .grantReadData(importedReader);

new cdk.CfnOutput(stack, "OrdersTableName", { value: ordersTable.tableName });
new cdk.CfnOutput(stack, "IndexedReaderArn", { value: indexedReader.roleArn });
new cdk.CfnOutput(stack, "ImportedReaderArn", { value: importedReader.roleArn });

app.synth();
      `,
    );
    const cdkOutDirectory = await cdkProject.synth();

    // And the synthesized template deployed, with one order written.
    const simAws = new SimAws();
    const scoped = simAws.account("111111111111").region("eu-west-2");
    const stack = await scoped
      .cloudFormation()
      .deployTemplateFile(
        path.join(cdkOutDirectory, "TestStack.template.json"),
      );
    await simAws.backgroundTasksComplete();

    const tableName = stack.outputs.get("OrdersTableName")?.value;
    const indexedReaderArn = stack.outputs.get("IndexedReaderArn")?.value;
    const importedReaderArn = stack.outputs.get("ImportedReaderArn")?.value;
    assertTypeString(tableName);
    assertTypeString(indexedReaderArn);
    assertTypeString(importedReaderArn);

    await scoped.dynamoDb().putItem(
      new PutItemCommand({
        TableName: tableName,
        Item: {
          customerId: { S: "customer-1" },
          orderId: { S: "order-1" },
          status: { S: "OPEN" },
        },
      }),
    );

    const openOrders = new QueryCommand({
      TableName: tableName,
      IndexName: "byStatus",
      KeyConditionExpression: "#status = :status",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":status": { S: "OPEN" } },
    });

    // When each Role queries the index.
    const indexed = await scoped.dynamoDb().query(openOrders, {
      caller: { kind: "arn", arn: indexedReaderArn },
    });
    const imported = await assertThrowsErrorAsync(async () =>
      scoped.dynamoDb().query(openOrders, {
        caller: { kind: "arn", arn: importedReaderArn },
      }),
    );

    // Then the grant CDK wrote with `<table ARN>/index/*` reaches the index.
    assertIdentical(indexed.Count, 1);

    // And the grant on the imported table, which names the table ARN alone, is
    // refused against the index ARN, as it is on AWS.
    assertInstanceOf(imported, SimIamAccessDenied);
    assertIdentical(
      imported.resource,
      `arn:aws:dynamodb:eu-west-2:111111111111:table/${tableName}/index/byStatus`,
    );

    await simAws.backgroundTasksComplete();
  });
});
