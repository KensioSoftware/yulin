import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import { simCfnDynamoDbIndexedTableResourceFactory } from "./table/sim-cfn-dynamodb-indexed-table-resource.factory.js";

/**
 * Deploy an indexed table whose Resource carries the properties given, and give
 * back the stack whatever came of it.
 */
async function deployIndexedTable(
  simAws: SimAws,
  properties: SimCfnTemplateValueRecord,
): Promise<void> {
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "orders-stack",
    template: {
      Resources: {
        OrdersTable: simCfnDynamoDbIndexedTableResourceFactory.make({
          properties,
        }),
        OrdersBucket: { Type: "AWS::S3::Bucket" },
      },
    },
  });
  await stack.waitForDeployComplete();
}

describe("DynamoDB CloudFormation Table secondary index validation", () => {
  it("fails an index whose key attribute has no AttributeDefinition", async () => {
    // Given a template whose index is keyed by an attribute the table never
    // defines, which CreateTable refuses for an SDK caller too.
    const simAws = new SimAws();

    // When the template is deployed, then the deployment fails.
    const error = await assertThrowsErrorAsync(async () => {
      await deployIndexedTable(simAws, {
        GlobalSecondaryIndexes: [
          {
            IndexName: "byWarehouse",
            KeySchema: [{ AttributeName: "warehouseId", KeyType: "HASH" }],
            Projection: { ProjectionType: "ALL" },
          },
        ],
      });
    });

    // And the failure is the one CreateTable gives, because the Resource is
    // created by calling it.
    assertStringIncludes(
      error.message,
      "The KeySchema for index byWarehouse names the attribute warehouseId, " +
        "which has no AttributeDefinition",
    );

    const stack = simAws.cloudFormation().getStackByName("orders-stack");
    assertIdentical(stack?.getResource("OrdersTable")?.status, "CREATE_FAILED");
    assertUndefined(simAws.dynamoDb().findTable("orders"));
  });

  it("fails a local index that does not share the table's partition key", async () => {
    // Given a template whose local index is keyed by an attribute of its own
    // rather than by the table's partition key.
    const simAws = new SimAws();

    // When the template is deployed, then the deployment fails with the rule
    // that makes an index local, rather than with anything read here.
    const error = await assertThrowsErrorAsync(async () => {
      await deployIndexedTable(simAws, {
        LocalSecondaryIndexes: [
          {
            IndexName: "byTotal",
            KeySchema: [
              { AttributeName: "status", KeyType: "HASH" },
              { AttributeName: "total", KeyType: "RANGE" },
            ],
            Projection: { ProjectionType: "ALL" },
          },
        ],
      });
    });

    assertStringIncludes(error.message, "shares the table's partition key");
  });

  it("fails an index the template gives no Projection", async () => {
    // Given a template whose index says nothing about which attributes it
    // carries.
    const simAws = new SimAws();

    // When the template is deployed, then the deployment fails in the words
    // CreateTable refuses the same index in.
    const error = await assertThrowsErrorAsync(async () => {
      await deployIndexedTable(simAws, {
        GlobalSecondaryIndexes: [
          {
            IndexName: "byStatus",
            KeySchema: [{ AttributeName: "status", KeyType: "HASH" }],
          },
        ],
      });
    });

    assertStringIncludes(error.message, "Index byStatus has no Projection");
  });

  it("skips a table whose index asks for something not simulated", async () => {
    // Given a template asking for warm throughput on one index, which is not
    // simulated, in a stack with another Resource in it.
    const simAws = new SimAws();

    // When the template is deployed.
    await deployIndexedTable(simAws, {
      GlobalSecondaryIndexes: [
        {
          IndexName: "byStatus",
          KeySchema: [{ AttributeName: "status", KeyType: "HASH" }],
          Projection: { ProjectionType: "ALL" },
          WarmThroughput: { ReadUnitsPerSecond: 12_000 },
        },
      ],
    });

    // Then the whole table is skipped, with a reason naming the index the
    // setting was on, rather than deployed with an index that ignores it.
    const stack = simAws.cloudFormation().getStackByName("orders-stack");
    const resource = stack?.getResource("OrdersTable");
    assertNonNullable(resource);
    assertTrue(resource.skipped);
    assertStringIncludes(
      resource.skippedReason ?? "",
      "GlobalSecondaryIndexes.0.WarmThroughput is a real " +
        "AWS::DynamoDB::Table property that simulated DynamoDB does not " +
        "simulate",
    );
    assertUndefined(simAws.dynamoDb().findTable("orders"));

    // And the rest of the stack still deploys.
    assertTrue(stack?.getResource("OrdersBucket")?.deployed);
  });

  it("fails an index carrying something that is not an index property", async () => {
    // Given a template naming something on its index that AWS::DynamoDB::Table
    // has no such property for.
    const simAws = new SimAws();

    // When the template is deployed, then the deployment fails rather than
    // skipping, since real CloudFormation would refuse this template too.
    const error = await assertThrowsErrorAsync(async () => {
      await deployIndexedTable(simAws, {
        GlobalSecondaryIndexes: [
          {
            IndexName: "byStatus",
            KeySchema: [{ AttributeName: "status", KeyType: "HASH" }],
            Projection: { ProjectionType: "ALL" },
            Sorted: true,
          },
        ],
      });
    });

    assertStringIncludes(
      error.message,
      "GlobalSecondaryIndexes.0.Sorted is not an AWS::DynamoDB::Table " +
        "GlobalSecondaryIndex property",
    );
  });

  it("fails a local index the template provisions capacity for", async () => {
    // Given a template provisioning capacity for a local secondary index,
    // which has no such property: it reads out of the table's own capacity.
    const simAws = new SimAws();

    // When the template is deployed, then the deployment fails naming the
    // property.
    const error = await assertThrowsErrorAsync(async () => {
      await deployIndexedTable(simAws, {
        LocalSecondaryIndexes: [
          {
            IndexName: "byTotal",
            KeySchema: [
              { AttributeName: "customerId", KeyType: "HASH" },
              { AttributeName: "total", KeyType: "RANGE" },
            ],
            Projection: { ProjectionType: "ALL" },
            ProvisionedThroughput: {
              ReadCapacityUnits: 2,
              WriteCapacityUnits: 1,
            },
          },
        ],
      });
    });

    assertStringIncludes(
      error.message,
      "LocalSecondaryIndexes.0.ProvisionedThroughput is not an " +
        "AWS::DynamoDB::Table LocalSecondaryIndex property",
    );
  });

  it("fails an index property list the template did not write as a list", async () => {
    // Given a template holding one index object where the list of them belongs.
    const simAws = new SimAws();

    // When the template is deployed, then the deployment fails naming the
    // property that was the wrong shape.
    const error = await assertThrowsErrorAsync(async () => {
      await deployIndexedTable(simAws, {
        GlobalSecondaryIndexes: {
          IndexName: "byStatus",
          KeySchema: [{ AttributeName: "status", KeyType: "HASH" }],
          Projection: { ProjectionType: "ALL" },
        },
      });
    });

    assertStringIncludes(
      error.message,
      "GlobalSecondaryIndexes must be a list",
    );
  });

  it("fails a projection naming something other than attribute names", async () => {
    // Given a template whose NonKeyAttributes holds a number.
    const simAws = new SimAws();

    // When the template is deployed, then the deployment fails naming the
    // entry that was not an attribute name.
    const error = await assertThrowsErrorAsync(async () => {
      await deployIndexedTable(simAws, {
        GlobalSecondaryIndexes: [
          {
            IndexName: "byStatus",
            KeySchema: [{ AttributeName: "status", KeyType: "HASH" }],
            Projection: {
              ProjectionType: "INCLUDE",
              NonKeyAttributes: ["total", 7],
            },
          },
        ],
      });
    });

    assertStringIncludes(
      error.message,
      "GlobalSecondaryIndexes.0.Projection.NonKeyAttributes.1 must be a string",
    );
  });

  it("fails a projection whose NonKeyAttributes is not a list", async () => {
    // Given a template naming one attribute where the list of them belongs.
    const simAws = new SimAws();

    // When the template is deployed, then the deployment fails naming the
    // property that was the wrong shape.
    const error = await assertThrowsErrorAsync(async () => {
      await deployIndexedTable(simAws, {
        GlobalSecondaryIndexes: [
          {
            IndexName: "byStatus",
            KeySchema: [{ AttributeName: "status", KeyType: "HASH" }],
            Projection: {
              ProjectionType: "INCLUDE",
              NonKeyAttributes: "total",
            },
          },
        ],
      });
    });

    assertStringIncludes(
      error.message,
      "GlobalSecondaryIndexes.0.Projection.NonKeyAttributes must be a list",
    );
  });
});
