import {
  DescribeTimeToLiveCommand,
  UpdateTimeToLiveCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimDynamoDbResourceNotFoundException,
  SimDynamoDbValidationException,
} from "../../error/dynamodb.error.js";
import { simDynamoDbCreatedTableFactory } from "../../table/sim-dynamodb-created-table.factory.js";

/**
 * Read a table's time to live status.
 */
async function timeToLiveStatus(
  simAws: SimAws,
  tableName: string,
): Promise<string | undefined> {
  const described = await simAws
    .dynamoDb()
    .describeTimeToLive(
      new DescribeTimeToLiveCommand({ TableName: tableName }),
    );

  return described.TimeToLiveDescription?.TimeToLiveStatus;
}

describe("DynamoDB UpdateTimeToLiveCommand", () => {
  it("moves through ENABLING to ENABLED", async () => {
    // Given a table.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make(
      { tableName: "Sessions" },
      simAws,
    );

    // When time to live is switched on.
    const update = await simAws.dynamoDb().updateTimeToLive(
      new UpdateTimeToLiveCommand({
        TableName: "Sessions",
        TimeToLiveSpecification: { Enabled: true, AttributeName: "expiresAt" },
      }),
    );

    // Then the response carries what the request asked for.
    assertIdentical(update.TimeToLiveSpecification?.AttributeName, "expiresAt");
    assertTrue(update.TimeToLiveSpecification.Enabled);

    // And the table reports it as still enabling.
    assertIdentical(await timeToLiveStatus(simAws, "Sessions"), "ENABLING");

    // And it settles on ENABLED once the scheduled work has run.
    await simAws.backgroundTasksComplete();
    const settled = await simAws
      .dynamoDb()
      .describeTimeToLive(
        new DescribeTimeToLiveCommand({ TableName: "Sessions" }),
      );
    assertIdentical(settled.TimeToLiveDescription?.TimeToLiveStatus, "ENABLED");
    assertIdentical(settled.TimeToLiveDescription.AttributeName, "expiresAt");
  });

  it("moves through DISABLING to DISABLED", async () => {
    // Given a table with time to live switched on.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make(
      { tableName: "Sessions" },
      simAws,
    );
    await simAws.dynamoDb().updateTimeToLive(
      new UpdateTimeToLiveCommand({
        TableName: "Sessions",
        TimeToLiveSpecification: { Enabled: true, AttributeName: "expiresAt" },
      }),
    );
    await simAws.backgroundTasksComplete();

    // And an hour has passed, since DynamoDB takes one update per hour.
    await simAws.clock().advanceBy({ hours: 1 });

    // When time to live is switched off.
    await simAws.dynamoDb().updateTimeToLive(
      new UpdateTimeToLiveCommand({
        TableName: "Sessions",
        TimeToLiveSpecification: { Enabled: false, AttributeName: "expiresAt" },
      }),
    );

    // Then the table reports it as still disabling, by the same attribute.
    const disabling = await simAws
      .dynamoDb()
      .describeTimeToLive(
        new DescribeTimeToLiveCommand({ TableName: "Sessions" }),
      );
    assertIdentical(
      disabling.TimeToLiveDescription?.TimeToLiveStatus,
      "DISABLING",
    );
    assertIdentical(disabling.TimeToLiveDescription.AttributeName, "expiresAt");

    // And once it settles the table expires items by no attribute at all.
    await simAws.backgroundTasksComplete();
    const disabled = await simAws
      .dynamoDb()
      .describeTimeToLive(
        new DescribeTimeToLiveCommand({ TableName: "Sessions" }),
      );
    assertIdentical(
      disabled.TimeToLiveDescription?.TimeToLiveStatus,
      "DISABLED",
    );
    assertUndefined(disabled.TimeToLiveDescription.AttributeName);
  });

  it("takes one update per table per hour", async () => {
    // Given a table that has just had its time to live updated.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make(
      { tableName: "Sessions" },
      simAws,
    );
    const simDynamoDb = simAws.dynamoDb();
    await simDynamoDb.updateTimeToLive(
      new UpdateTimeToLiveCommand({
        TableName: "Sessions",
        TimeToLiveSpecification: { Enabled: true, AttributeName: "expiresAt" },
      }),
    );
    await simAws.backgroundTasksComplete();

    // When it is updated again inside the hour.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.updateTimeToLive(
        new UpdateTimeToLiveCommand({
          TableName: "Sessions",
          TimeToLiveSpecification: { Enabled: true, AttributeName: "goneAt" },
        }),
      ),
    );

    // Then it is refused, and the table keeps the attribute it had.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "one UpdateTimeToLive per table per hour",
    );

    // And an hour later the same update is taken.
    await simAws.clock().advanceBy({ hours: 1 });
    const later = await simDynamoDb.updateTimeToLive(
      new UpdateTimeToLiveCommand({
        TableName: "Sessions",
        TimeToLiveSpecification: { Enabled: true, AttributeName: "goneAt" },
      }),
    );
    assertIdentical(later.TimeToLiveSpecification?.AttributeName, "goneAt");
  });

  it("refuses an update to a table that is not there", async () => {
    // Given a simulated DynamoDB holding no tables.
    const simDynamoDb = new SimAws().dynamoDb();

    // When time to live is updated on a table that does not exist.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.updateTimeToLive(
        new UpdateTimeToLiveCommand({
          TableName: "Sessions",
          TimeToLiveSpecification: {
            Enabled: true,
            AttributeName: "expiresAt",
          },
        }),
      ),
    );

    // Then the missing table is reported.
    assertInstanceOf(error, SimDynamoDbResourceNotFoundException);
    assertStringIncludes(error.message, "No DynamoDB Table named Sessions");
  });
});

describe("DynamoDB DescribeTimeToLiveCommand", () => {
  it("reports a table that has never had time to live set as DISABLED", async () => {
    // Given a table nothing has set time to live on.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make(
      { tableName: "Sessions" },
      simAws,
    );

    // When its time to live is described.
    const described = await simAws
      .dynamoDb()
      .describeTimeToLive(
        new DescribeTimeToLiveCommand({ TableName: "Sessions" }),
      );

    // Then it is disabled, and expires items by no attribute.
    assertIdentical(
      described.TimeToLiveDescription?.TimeToLiveStatus,
      "DISABLED",
    );
    assertUndefined(described.TimeToLiveDescription.AttributeName);
  });

  it("refuses a describe of a table that is not there", async () => {
    // Given a simulated DynamoDB holding no tables.
    const simDynamoDb = new SimAws().dynamoDb();

    // When a table that does not exist is described.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.describeTimeToLive(
        new DescribeTimeToLiveCommand({ TableName: "Sessions" }),
      ),
    );

    // Then the missing table is reported.
    assertInstanceOf(error, SimDynamoDbResourceNotFoundException);
    assertStringIncludes(error.message, "No DynamoDB Table named Sessions");
  });
});
