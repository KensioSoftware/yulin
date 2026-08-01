import {
  DescribeTableCommand,
  ListTagsOfResourceCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertArrayLength,
  assertInstanceOf,
  assertNonNullable,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import { simCfnDynamoDbTableResourceFactory } from "./table/sim-cfn-dynamodb-table-resource.factory.js";

describe("DynamoDB CloudFormation Table tagging", () => {
  it("creates a table carrying the tags the template puts on it", async () => {
    // Given a template tagging its table, as a CDK app applying Tags.of does.
    const simAws = new SimAws();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersTable: simCfnDynamoDbTableResourceFactory.make({
            tableName: "orders",
            properties: {
              Tags: [
                { Key: "Environment", Value: "test" },
                { Key: "Owner", Value: "platform" },
              ],
            },
          }),
        },
      },
    });
    await stack.waitForDeployComplete();
    await simAws.backgroundTasksComplete();

    // Then the tags are on the table an SDK caller reads.
    const described = await simAws
      .dynamoDb()
      .describeTable(new DescribeTableCommand({ TableName: "orders" }));
    assertNonNullable(described.Table?.TableArn);

    const output = await simAws.dynamoDb().listTagsOfResource(
      new ListTagsOfResourceCommand({
        ResourceArn: described.Table.TableArn,
      }),
    );

    assertArrayLength(output.Tags, 2);
    assertObjectEquals(output.Tags[0], { Key: "Environment", Value: "test" });
    assertObjectEquals(output.Tags[1], { Key: "Owner", Value: "platform" });
  });

  it("fails the Resource for a tag DynamoDB would refuse", async () => {
    // Given a template tagging its table under the reserved aws: prefix.
    const simAws = new SimAws();

    // When the template is deployed.
    const error = await assertThrowsErrorAsync(async () => {
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: {
          Resources: {
            OrdersTable: simCfnDynamoDbTableResourceFactory.make({
              tableName: "orders",
              properties: { Tags: [{ Key: "aws:owner", Value: "platform" }] },
            }),
          },
        },
      });

      await stack.waitForDeployComplete();
    });

    // Then the table fails rather than being skipped, since the template is
    // wrong rather than the simulation stopping short. CreateTable is what
    // refuses it, so the reason is the one an SDK caller would read.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "begins with the reserved aws: prefix");
  });
});
