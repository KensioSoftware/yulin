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

describe("Sim CDK DynamoDB Table deployment local integration", () => {
  it("deploys a CDK table an SDK caller then writes to and reads from", async () => {
    // Given a CDK stack with an unnamed on-demand table with a partition and a
    // sort key, and a tag applied to everything in the stack.
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

cdk.Tags.of(stack).add("Environment", "test");

new cdk.CfnOutput(stack, "OrdersTableName", {
  value: ordersTable.tableName,
});

new cdk.CfnOutput(stack, "OrdersTableArn", {
  value: ordersTable.tableArn,
});

app.synth();
      `,
    );

    // And we synth the CDK template.
    const cdkOutDirectory = await cdkProject.synth();

    // When we deploy the synthesized template into the account and region the
    // CDK app declares, with no hand-editing of the AWS::DynamoDB::Table
    // Resource CDK emits.
    const simAws = new SimAws();
    const scoped = simAws.account(accountIdOneOnes).region("eu-west-2");
    const stack = await scoped
      .cloudFormation()
      .deployTemplateFile(
        path.join(cdkOutDirectory, "TestStack.template.json"),
      );
    await simAws.backgroundTasksComplete();

    // Then the table name the CDK output carries is the deployed table, named
    // after the stack and the logical ID because the template did not name it.
    const tableName = stack.outputs.get("OrdersTableName")?.value;
    assertTypeString(tableName);
    assertStringStartsWith(tableName, "TestStack-OrdersTable");

    const described = await scoped
      .dynamoDb()
      .describeTable(new DescribeTableCommand({ TableName: tableName }));

    assertNonNullable(described.Table);
    assertNonNullable(described.Table.KeySchema);
    assertIdentical(described.Table.TableStatus, "ACTIVE");
    assertIdentical(
      described.Table.BillingModeSummary?.BillingMode,
      "PAY_PER_REQUEST",
    );
    assertIdentical(
      described.Table.KeySchema.at(0)?.AttributeName,
      "customerId",
    );
    assertIdentical(described.Table.KeySchema.at(1)?.AttributeName, "orderId");
    assertIdentical(
      stack.outputs.get("OrdersTableArn")?.value,
      described.Table.TableArn,
    );

    // And the tag the stack applied is on the table, since CDK puts it on
    // every taggable Resource in the template.
    const tags = await scoped.dynamoDb().listTagsOfResource(
      new ListTagsOfResourceCommand({
        ResourceArn: described.Table.TableArn,
      }),
    );
    assertArrayLength(tags.Tags, 1);
    assertObjectEquals(tags.Tags[0], { Key: "Environment", Value: "test" });

    // And an item written to it reads back off it.
    await scoped.dynamoDb().putItem(
      new PutItemCommand({
        TableName: tableName,
        Item: {
          customerId: { S: "customer-1" },
          orderId: { S: "order-1" },
          total: { N: "42.5" },
        },
      }),
    );

    const read = await scoped.dynamoDb().getItem(
      new GetItemCommand({
        TableName: tableName,
        Key: { customerId: { S: "customer-1" }, orderId: { S: "order-1" } },
      }),
    );

    assertIdentical(read.Item?.["total"]?.N, "42.5");

    await simAws.backgroundTasksComplete();
  });
});
