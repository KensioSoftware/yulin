import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../../aws/sim-aws.js";
import type { SimAwsAccountId } from "../../../../aws/sim-aws-account.js";
import type { CfnTemplateBodyRecord } from "../../../template/sim-cfn-template.js";

const accountIdOneOnes = "111111111111" as SimAwsAccountId;

/**
 * A template referencing its table by one attribute, so a test only has to say
 * which one.
 */
function tableAttributeTemplate(attributeName: string): CfnTemplateBodyRecord {
  return {
    Resources: {
      OrdersTable: {
        Type: "AWS::DynamoDB::Table",
        Properties: {
          TableName: "orders",
          KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
          AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
          BillingMode: "PAY_PER_REQUEST",
        },
      },
    },
    Outputs: {
      TableAttribute: {
        Value: { "Fn::GetAtt": ["OrdersTable", attributeName] },
      },
    },
  };
}

describe("AWS::DynamoDB::Table CloudFormation values", () => {
  it("refuses Fn::GetAtt StreamArn on a table with no stream", async () => {
    // Given a template asking for the stream ARN of a table it declared no
    // StreamSpecification on, so the table has no stream.
    const simAws = new SimAws({
      defaultAccountId: accountIdOneOnes,
      defaultRegionName: "eu-west-2",
    });

    // When the template is deployed, then it fails rather than inventing an
    // ARN that would read as a working stream.
    const error = await assertThrowsErrorAsync(async () => {
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: tableAttributeTemplate("StreamArn"),
      });

      await stack.waitForDeployComplete();
    });

    // And the refusal names the table it was asked of.
    assertStringIncludes(
      error.message,
      "Unsupported AWS::DynamoDB::Table attribute StreamArn: table orders " +
        "has no StreamSpecification",
    );
  });

  it("refuses an attribute AWS::DynamoDB::Table does not have", async () => {
    // Given a template asking for an attribute the Resource type has no such
    // thing as.
    const simAws = new SimAws({
      defaultAccountId: accountIdOneOnes,
      defaultRegionName: "eu-west-2",
    });

    // When the template is deployed, then the refusal names the attribute.
    const error = await assertThrowsErrorAsync(async () => {
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: tableAttributeTemplate("TableSizeBytes"),
      });

      await stack.waitForDeployComplete();
    });

    assertStringIncludes(
      error.message,
      "Unsupported AWS::DynamoDB::Table attribute TableSizeBytes",
    );
  });

  it("answers a Ref for a table another Resource depends on", async () => {
    // Given a template handing the table name to a Lambda function through its
    // environment, which is what a Ref is for.
    const simAws = new SimAws({
      defaultAccountId: accountIdOneOnes,
      defaultRegionName: "eu-west-2",
    });

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersTable: {
            Type: "AWS::DynamoDB::Table",
            Properties: {
              TableName: "orders",
              KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
              AttributeDefinitions: [
                { AttributeName: "id", AttributeType: "S" },
              ],
              BillingMode: "PAY_PER_REQUEST",
            },
          },
        },
        Outputs: {
          TableRef: {
            Value: {
              "Fn::Join": ["", ["table:", { Ref: "OrdersTable" }]],
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the Ref resolved to the table name where it was used.
    assertIdentical(stack.outputs.get("TableRef")?.value, "table:orders");
  });
});
