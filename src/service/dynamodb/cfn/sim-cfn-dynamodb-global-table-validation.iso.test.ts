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
import { simCfnDynamoDbGlobalTableResourceFactory } from "./global-table/sim-cfn-dynamodb-global-table-resource.factory.js";

describe("DynamoDB CloudFormation GlobalTable validation", () => {
  it("creates a global table replicating between regions in its own region", async () => {
    // Given a template naming two replica regions, which genuinely replicates,
    // in a stack with another Resource in it.
    const simAws = new SimAws();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersTable: simCfnDynamoDbGlobalTableResourceFactory.make({
            tableName: "orders",
            replicaRegions: ["us-east-1", "eu-west-2"],
          }),
          OrdersBucket: { Type: "AWS::S3::Bucket" },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the table is created as an ordinary table in the region the stack
    // is deploying into, and the replication nothing performs is recorded with
    // the regions it named.
    const resource = stack.getResource("OrdersTable");
    assertNonNullable(resource);
    assertTrue(resource.deployed);
    assertNonNullable(simAws.dynamoDb().findTable("orders"));

    const ignored = resource.ignoredProperties[0];
    assertNonNullable(ignored);
    assertIdentical(ignored.path, "Replicas");
    assertStringIncludes(
      ignored.reason,
      "Replicas names us-east-1, eu-west-2, and replicating a table between " +
        "regions is not simulated",
    );

    // And the rest of the stack still deploys.
    assertTrue(stack.getResource("OrdersBucket")?.deployed);
  });

  it("fails a global table replicating nowhere near the stack's own region", async () => {
    // Given a template naming two replica regions, neither of which is where
    // the stack is deploying. Real CloudFormation refuses that template too.
    const simAws = new SimAws();

    // When the template is deployed, then the deployment fails rather than
    // creating a table in a region no replica asked for.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: {
          Resources: {
            OrdersTable: simCfnDynamoDbGlobalTableResourceFactory.make({
              tableName: "orders",
              replicaRegions: ["eu-west-2", "eu-west-1"],
            }),
          },
        },
      });
    });

    assertStringIncludes(
      error.message,
      "Replicas names eu-west-2, eu-west-1, and the stack is deploying into " +
        "us-east-1",
    );
    assertUndefined(simAws.dynamoDb().findTable("orders"));
  });

  it("fails a global table with no replicas at all", async () => {
    // Given a template leaving Replicas out, which real CloudFormation refuses
    // too since the property is required. Written out rather than built, since
    // this is the one global table here that has no replica to build.
    const simAws = new SimAws();

    // When the template is deployed, then the deployment fails.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: {
          Resources: {
            OrdersTable: {
              Type: "AWS::DynamoDB::GlobalTable",
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
        },
      });
    });

    assertStringIncludes(
      error.message,
      "Invalid AWS::DynamoDB::GlobalTable Resource OrdersTable: Replicas " +
        "must name at least one region",
    );

    const stack = simAws.cloudFormation().getStackByName("orders-stack");
    assertNonNullable(stack);
    assertIdentical(stack.getResource("OrdersTable")?.status, "CREATE_FAILED");
    assertUndefined(simAws.dynamoDb().findTable("orders"));
  });

  it("fails a global table whose one replica is somewhere else", async () => {
    // Given a template whose only replica names a region the stack is not
    // deploying into, which real CloudFormation refuses too.
    const simAws = new SimAws();

    // When the template is deployed, then the deployment fails.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: {
          Resources: {
            OrdersTable: simCfnDynamoDbGlobalTableResourceFactory.make({
              tableName: "orders",
              replicaRegions: ["eu-west-2"],
            }),
          },
        },
      });
    });

    // And the failure names both regions, since either one of them could be
    // the one the template got wrong.
    assertStringIncludes(
      error.message,
      "Replicas.0.Region is eu-west-2, and the stack is deploying into " +
        "us-east-1",
    );
    assertUndefined(simAws.dynamoDb().findTable("orders"));
  });

  it("creates a global table without a replica setting that is not simulated", async () => {
    // Given a template asking for point in time recovery, which a global table
    // asks for on its replica and which is not simulated either way.
    const simAws = new SimAws();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersTable: simCfnDynamoDbGlobalTableResourceFactory.make({
            tableName: "orders",
            replicaProperties: {
              PointInTimeRecoverySpecification: {
                PointInTimeRecoveryEnabled: true,
              },
            },
          }),
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the table exists, and the record names the whole path to the
    // property, so it says which replica asked for it.
    const resource = stack.getResource("OrdersTable");
    assertNonNullable(resource);
    assertTrue(resource.deployed);
    assertNonNullable(simAws.dynamoDb().findTable("orders"));

    const ignored = resource.ignoredProperties[0];
    assertNonNullable(ignored);
    assertIdentical(
      ignored.path,
      "Replicas.0.PointInTimeRecoverySpecification",
    );
    assertStringIncludes(
      ignored.reason,
      "Replicas.0.PointInTimeRecoverySpecification is a real " +
        "AWS::DynamoDB::GlobalTable property that simulated DynamoDB does " +
        "not simulate",
    );
  });

  it("creates a global table asking for capacity that scales with load", async () => {
    // Given a template asking for autoscaled capacity on both halves, which is
    // what CDK's Capacity.autoscaled synthesises and which nothing here scales.
    const simAws = new SimAws();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersTable: simCfnDynamoDbGlobalTableResourceFactory.make({
            tableName: "orders",
            billingMode: "PROVISIONED",
            properties: {
              WriteProvisionedThroughputSettings: {
                WriteCapacityAutoScalingSettings: {
                  MinCapacity: 2,
                  MaxCapacity: 10,
                },
              },
            },
            replicaProperties: {
              ReadProvisionedThroughputSettings: {
                ReadCapacityAutoScalingSettings: {
                  MinCapacity: 3,
                  MaxCapacity: 30,
                },
              },
            },
          }),
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the table exists at the capacity autoscaling would have started it
    // at, rather than the deployment failing for want of a capacity, and the
    // scaling nothing performs is recorded on both halves.
    const resource = stack.getResource("OrdersTable");
    assertNonNullable(resource);
    assertTrue(resource.deployed);

    const table = simAws.dynamoDb().findTable("orders");
    assertNonNullable(table);
    const throughput = table.billing.throughputDescription();
    assertIdentical(throughput.WriteCapacityUnits, 2);
    assertIdentical(throughput.ReadCapacityUnits, 3);

    assertIdentical(
      resource.ignoredProperties
        .map((entry) => entry.path)
        .toSorted((first, second) => first.localeCompare(second))
        .join(", "),
      "Replicas.0.ReadProvisionedThroughputSettings." +
        "ReadCapacityAutoScalingSettings, " +
        "WriteProvisionedThroughputSettings.WriteCapacityAutoScalingSettings",
    );
  });

  it("creates a global table with a property the Resource type does not have", async () => {
    // Given a template putting an AWS::DynamoDB::Table property on a global
    // table, which states that one on its replica instead.
    const simAws = new SimAws();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersTable: simCfnDynamoDbGlobalTableResourceFactory.make({
            tableName: "orders",
            properties: { TableClass: "STANDARD_INFREQUENT_ACCESS" },
          }),
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the table is created in the default class, with the property that
    // belongs on the replica recorded where it was written instead.
    const resource = stack.getResource("OrdersTable");
    assertNonNullable(resource);
    assertTrue(resource.deployed);
    assertNonNullable(simAws.dynamoDb().findTable("orders"));

    const ignored = resource.ignoredProperties[0];
    assertNonNullable(ignored);
    assertStringIncludes(
      ignored.reason,
      "TableClass is not an AWS::DynamoDB::GlobalTable property simulated " +
        "DynamoDB knows about",
    );
  });

  it("fails a global table whose one replica names no region", async () => {
    // Given a template whose replica says nothing about where it is, which
    // real CloudFormation refuses too since Region is required.
    const simAws = new SimAws();

    // When the template is deployed, then the deployment fails.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: {
          Resources: {
            OrdersTable: simCfnDynamoDbGlobalTableResourceFactory.make({
              tableName: "orders",
              properties: { Replicas: [{}] },
            }),
          },
        },
      });
    });

    assertStringIncludes(error.message, "Replicas.0.Region is required");
    assertUndefined(simAws.dynamoDb().findTable("orders"));
  });

  it("fails a global table whose index names itself nowhere", async () => {
    // Given a template declaring an index with no IndexName, and a replica
    // provisioning the reads of an index it does not name either, so there is
    // nothing to match the two by.
    const simAws = new SimAws();

    // When the template is deployed, then the deployment fails.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: {
          Resources: {
            OrdersTable: simCfnDynamoDbGlobalTableResourceFactory.make({
              tableName: "orders",
              properties: {
                GlobalSecondaryIndexes: [
                  {
                    KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
                    Projection: { ProjectionType: "ALL" },
                  },
                ],
              },
              replicaProperties: {
                GlobalSecondaryIndexes: [
                  { ReadProvisionedThroughputSettings: {} },
                ],
              },
            }),
          },
        },
      });
    });

    // And the failure is the one CreateTable gives an unnamed index.
    assertStringIncludes(error.message, "A secondary index has no IndexName");
  });

  it("fails a global table the CreateTable rules refuse", async () => {
    // Given a template naming a key attribute it never defines, which
    // CreateTable refuses for an SDK caller too.
    const simAws = new SimAws();

    // When the template is deployed, then the deployment fails.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: {
          Resources: {
            OrdersTable: simCfnDynamoDbGlobalTableResourceFactory.make({
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

    // And the failure is the one CreateTable gives, because a global table is
    // created by calling it, as an ordinary table is.
    assertStringIncludes(
      error.message,
      "The KeySchema names the attribute id, which has no AttributeDefinition",
    );
  });
});
