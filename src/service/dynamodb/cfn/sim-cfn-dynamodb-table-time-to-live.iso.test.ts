import {
  DescribeTimeToLiveCommand,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { SimFixedClock } from "../../../util/clock/sim-clock.js";
import { simCfnDynamoDbTableResourceFactory } from "./table/sim-cfn-dynamodb-table-resource.factory.js";

/**
 * The instant this suite starts from.
 */
const startedAt = new Date("2026-08-01T09:00:00.000Z");

/**
 * That instant as the epoch seconds a TTL attribute carries.
 */
const startedAtSeconds = String(Math.floor(startedAt.getTime() / 1000));

describe("DynamoDB CloudFormation Table time to live", () => {
  it("deploys a table that expires items by the attribute the template names", async () => {
    // Given a template setting a time to live attribute, as a CDK table with
    // timeToLiveAttribute set emits.
    const simAws = new SimAws({ clock: new SimFixedClock(startedAt) });

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "sessions-stack",
      template: {
        Resources: {
          SessionsTable: simCfnDynamoDbTableResourceFactory.make({
            tableName: "sessions",
            partitionKeyName: "sessionId",
            properties: {
              TimeToLiveSpecification: {
                AttributeName: "expiresAt",
                Enabled: true,
              },
            },
          }),
        },
      },
    });
    await stack.waitForDeployComplete();
    await simAws.backgroundTasksComplete();

    // Then DescribeTimeToLive reports the attribute, as it would for a table
    // an SDK caller had updated.
    const described = await simAws
      .dynamoDb()
      .describeTimeToLive(
        new DescribeTimeToLiveCommand({ TableName: "sessions" }),
      );
    assertIdentical(
      described.TimeToLiveDescription?.TimeToLiveStatus,
      "ENABLED",
    );
    assertIdentical(described.TimeToLiveDescription.AttributeName, "expiresAt");

    // And the deployed table really expires items, rather than only reporting
    // that it would.
    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: "sessions",
        Item: {
          sessionId: { S: "abc" },
          expiresAt: { N: startedAtSeconds },
        },
      }),
    );

    await simAws.clock().advanceBy({ days: 3 });

    const read = await simAws.dynamoDb().getItem(
      new GetItemCommand({
        TableName: "sessions",
        Key: { sessionId: { S: "abc" } },
      }),
    );
    assertUndefined(read.Item);
  });

  it("deploys a table whose template switches time to live off", async () => {
    // Given a template naming an attribute but leaving time to live off.
    const simAws = new SimAws();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "sessions-stack",
      template: {
        Resources: {
          SessionsTable: simCfnDynamoDbTableResourceFactory.make({
            tableName: "sessions",
            partitionKeyName: "sessionId",
            properties: {
              TimeToLiveSpecification: {
                AttributeName: "expiresAt",
                Enabled: false,
              },
            },
          }),
        },
      },
    });
    await stack.waitForDeployComplete();
    await simAws.backgroundTasksComplete();

    // Then the table is there, expiring nothing.
    const described = await simAws
      .dynamoDb()
      .describeTimeToLive(
        new DescribeTimeToLiveCommand({ TableName: "sessions" }),
      );
    assertNonNullable(described.TimeToLiveDescription);
    assertIdentical(
      described.TimeToLiveDescription.TimeToLiveStatus,
      "DISABLED",
    );
  });
});
