import {
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { simCfnDynamoDbTableResourceFactory } from "./table/sim-cfn-dynamodb-table-resource.factory.js";

describe("DynamoDB CloudFormation Table validation", () => {
  it("fails a table the CreateTable rules refuse", async () => {
    // Given a template naming a key attribute it never defines, which
    // CreateTable refuses for an SDK caller too.
    const simAws = new SimAws();

    // When the template is deployed, then the deployment fails.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: {
          Resources: {
            OrdersTable: simCfnDynamoDbTableResourceFactory.make({
              tableName: "orders",
              properties: {
                AttributeDefinitions: [
                  { AttributeName: "customerId", AttributeType: "S" },
                ],
              },
            }),
          },
        },
      });
    });

    // And the failure is the one CreateTable gives, because the Resource is
    // created by calling it.
    assertStringIncludes(
      error.message,
      "The KeySchema names the attribute id, which has no AttributeDefinition",
    );

    const stack = simAws.cloudFormation().getStackByName("orders-stack");
    assertNonNullable(stack);
    assertIdentical(stack.getResource("OrdersTable")?.status, "CREATE_FAILED");
    assertUndefined(simAws.dynamoDb().findTable("orders"));
  });

  it("skips a table with a property that is not simulated", async () => {
    // Given a template asking for a time to live, which is not simulated, in a
    // stack with another Resource in it.
    const simAws = new SimAws();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersTable: simCfnDynamoDbTableResourceFactory.make({
            tableName: "orders",
            properties: {
              TimeToLiveSpecification: {
                AttributeName: "expiresAt",
                Enabled: true,
              },
            },
          }),
          OrdersBucket: { Type: "AWS::S3::Bucket" },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the table is skipped, with a reason naming the property, rather
    // than created without the behaviour the template asked for.
    const resource = stack.getResource("OrdersTable");
    assertNonNullable(resource);
    assertTrue(resource.skipped);
    assertStringIncludes(
      resource.skippedReason ?? "",
      "TimeToLiveSpecification is a real AWS::DynamoDB::Table property that " +
        "simulated DynamoDB does not simulate",
    );
    assertUndefined(simAws.dynamoDb().findTable("orders"));

    // And the rest of the stack still deploys.
    assertTrue(stack.getResource("OrdersBucket")?.deployed);
  });

  it("skips a global table rather than creating an ordinary one", async () => {
    // Given a template with an AWS::DynamoDB::GlobalTable in it, which
    // replicates across regions.
    const simAws = new SimAws();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersTable: {
            ...simCfnDynamoDbTableResourceFactory.make({
              tableName: "orders",
            }),
            Type: "AWS::DynamoDB::GlobalTable",
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then it is skipped, naming the Resource type, and no table is created.
    const resource = stack.getResource("OrdersTable");
    assertNonNullable(resource);
    assertTrue(resource.skipped);
    assertStringIncludes(
      resource.skippedReason ?? "",
      "Unsupported sim DynamoDB CloudFormation Resource GlobalTable",
    );
    assertUndefined(simAws.dynamoDb().findTable("orders"));
  });

  it("leaves a table unprotected when a Parameter says so", async () => {
    // Given a template taking its deletion protection from a Parameter, which
    // resolves to a string rather than the boolean a literal property carries.
    const simAws = new SimAws();

    // When the template is deployed with a value for it.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      parameters: { TableProtected: "false" },
      template: {
        Parameters: { TableProtected: { Type: "String" } },
        Resources: {
          OrdersTable: simCfnDynamoDbTableResourceFactory.make({
            tableName: "orders",
            properties: {
              DeletionProtectionEnabled: { Ref: "TableProtected" },
            },
          }),
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the table carries the value the Parameter named.
    assertFalse(
      simAws.dynamoDb().findTable("orders")?.deletionProtectionEnabled,
    );
  });

  it("protects a table a Parameter asks to protect", async () => {
    // Given the same template with the Parameter set the other way.
    const simAws = new SimAws();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      parameters: { TableProtected: "true" },
      template: {
        Parameters: { TableProtected: { Type: "String" } },
        Resources: {
          OrdersTable: simCfnDynamoDbTableResourceFactory.make({
            tableName: "orders",
            properties: {
              DeletionProtectionEnabled: { Ref: "TableProtected" },
            },
          }),
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the table is protected from deletion.
    assertTrue(
      simAws.dynamoDb().findTable("orders")?.deletionProtectionEnabled,
    );
  });
});
