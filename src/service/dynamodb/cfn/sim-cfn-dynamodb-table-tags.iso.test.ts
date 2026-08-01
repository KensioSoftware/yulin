import { ListTagsOfResourceCommand } from "@aws-sdk/client-dynamodb";
import {
  assertArrayLength,
  assertInstanceOf,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";

const accountIdOneOnes = "111111111111" as SimAwsAccountId;

function simAwsInEuWest2(): SimAws {
  return new SimAws({
    defaultAccountId: accountIdOneOnes,
    defaultRegionName: "eu-west-2",
  });
}

/**
 * A table Resource with the properties every one of these tests needs.
 */
function tableProperties(
  tags: SimCfnTemplateValueRecord[],
): SimCfnTemplateValueRecord {
  return {
    TableName: "orders",
    KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
    Tags: tags,
  };
}

describe("DynamoDB CloudFormation Table tagging", () => {
  it("creates a table carrying the tags the template puts on it", async () => {
    // Given a template tagging its table, as a CDK app applying Tags.of does.
    const simAws = simAwsInEuWest2();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersTable: {
            Type: "AWS::DynamoDB::Table",
            Properties: tableProperties([
              { Key: "Environment", Value: "test" },
              { Key: "Owner", Value: "platform" },
            ]),
          },
        },
      },
    });
    await stack.waitForDeployComplete();
    await simAws.backgroundTasksComplete();

    // Then the tags are on the table an SDK caller reads.
    const output = await simAws.dynamoDb().listTagsOfResource(
      new ListTagsOfResourceCommand({
        ResourceArn: "arn:aws:dynamodb:eu-west-2:111111111111:table/orders",
      }),
    );

    assertArrayLength(output.Tags, 2);
    assertObjectEquals(output.Tags[0], { Key: "Environment", Value: "test" });
    assertObjectEquals(output.Tags[1], { Key: "Owner", Value: "platform" });
  });

  it("fails the Resource for a tag DynamoDB would refuse", async () => {
    // Given a template tagging its table under the reserved aws: prefix.
    const simAws = simAwsInEuWest2();

    // When the template is deployed.
    const error = await assertThrowsErrorAsync(async () => {
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: {
          Resources: {
            OrdersTable: {
              Type: "AWS::DynamoDB::Table",
              Properties: tableProperties([
                { Key: "aws:owner", Value: "platform" },
              ]),
            },
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
