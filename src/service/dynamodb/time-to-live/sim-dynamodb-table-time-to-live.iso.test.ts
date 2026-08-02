import {
  DeleteItemCommand,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
  UpdateTimeToLiveCommand,
} from "@aws-sdk/client-dynamodb";
import { assertNonNullable, assertUndefined } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { SimFixedClock } from "../../../util/clock/sim-clock.js";
import { simDynamoDbCreatedTableFactory } from "../table/sim-dynamodb-created-table.factory.js";
import { simDynamoDbExpiringTableFactory } from "./sim-dynamodb-expiring-table.factory.js";

/**
 * The instant every test here starts from.
 */
const startedAt = new Date("2026-08-01T09:00:00.000Z");

/**
 * Epoch seconds a TTL attribute carries, a number of hours from the start.
 */
function ttlHours(offsetHours: number): string {
  return String(Math.floor(startedAt.getTime() / 1000) + offsetHours * 60 * 60);
}

/**
 * Write a session expiring at a TTL timestamp.
 */
async function putSession(
  simAws: SimAws,
  sessionId: string,
  expiresAt: string,
): Promise<void> {
  await simAws.dynamoDb().putItem(
    new PutItemCommand({
      TableName: "Sessions",
      Item: { sessionId: { S: sessionId }, expiresAt: { N: expiresAt } },
    }),
  );
}

/**
 * Read a session back, if the table still holds it.
 */
async function getSession(
  simAws: SimAws,
  sessionId: string,
): Promise<Record<string, unknown> | undefined> {
  const read = await simAws.dynamoDb().getItem(
    new GetItemCommand({
      TableName: "Sessions",
      Key: { sessionId: { S: sessionId } },
    }),
  );

  return read.Item;
}

describe("DynamoDB table expiry", () => {
  it("keeps an item overwritten with a later TTL", async () => {
    // Given a session that expired on the hour it was written.
    const simAws = new SimAws({ clock: new SimFixedClock(startedAt) });
    await simDynamoDbExpiringTableFactory.make({}, simAws);
    await putSession(simAws, "abc", ttlHours(0));

    // And it is written again, expiring a week later, before its window runs
    // out.
    await putSession(simAws, "abc", ttlHours(24 * 7));

    // When the clock passes the window the first write would have gone in.
    await simAws.clock().advanceBy({ days: 3 });

    // Then the session is still there. The scheduled removal found an item
    // that is no longer expired and left it alone.
    assertNonNullable(await getSession(simAws, "abc"));

    // And it goes once the second TTL's own window runs out.
    await simAws.clock().advanceBy({ days: 7 });
    assertUndefined(await getSession(simAws, "abc"));
  });

  it("keeps an item once time to live is switched off", async () => {
    // Given a session that expired on the hour it was written.
    const simAws = new SimAws({ clock: new SimFixedClock(startedAt) });
    await simDynamoDbExpiringTableFactory.make({}, simAws);
    await putSession(simAws, "abc", ttlHours(0));

    // And time to live is switched off an hour later, before the window runs
    // out.
    await simAws.clock().advanceBy({ hours: 1 });
    await simAws.dynamoDb().updateTimeToLive(
      new UpdateTimeToLiveCommand({
        TableName: "Sessions",
        TimeToLiveSpecification: { Enabled: false, AttributeName: "expiresAt" },
      }),
    );
    await simAws.backgroundTasksComplete();

    // When the clock passes the window.
    await simAws.clock().advanceBy({ days: 3 });

    // Then the session is still there.
    assertNonNullable(await getSession(simAws, "abc"));
  });

  it("expires items that were already there when time to live was switched on", async () => {
    // Given a table with items written before time to live meant anything.
    const simAws = new SimAws({ clock: new SimFixedClock(startedAt) });
    await simDynamoDbCreatedTableFactory.make(
      { tableName: "Sessions", partitionKeyName: "sessionId" },
      simAws,
    );
    await putSession(simAws, "abc", ttlHours(0));

    // When time to live is switched on, and the clock passes the window.
    await simAws.dynamoDb().updateTimeToLive(
      new UpdateTimeToLiveCommand({
        TableName: "Sessions",
        TimeToLiveSpecification: { Enabled: true, AttributeName: "expiresAt" },
      }),
    );
    await simAws.backgroundTasksComplete();
    await simAws.clock().advanceBy({ days: 3 });

    // Then the item that was already there has gone. Its TTL attribute was
    // only inert while time to live was off.
    assertUndefined(await getSession(simAws, "abc"));
  });

  it("leaves an item whose TTL attribute was taken off it", async () => {
    // Given a session that expired on the hour it was written.
    const simAws = new SimAws({ clock: new SimFixedClock(startedAt) });
    await simDynamoDbExpiringTableFactory.make({}, simAws);
    await putSession(simAws, "abc", ttlHours(0));

    // And the expiry attribute is taken off it before the window runs out.
    await simAws.dynamoDb().updateItem(
      new UpdateItemCommand({
        TableName: "Sessions",
        Key: { sessionId: { S: "abc" } },
        UpdateExpression: "REMOVE expiresAt",
      }),
    );

    // When the clock passes the window.
    await simAws.clock().advanceBy({ days: 3 });

    // Then the session is still there. An item with no TTL attribute expires by
    // nothing, however it came to have none.
    assertNonNullable(await getSession(simAws, "abc"));
  });

  it("finds nothing to remove when the item has already gone", async () => {
    // Given a session the application deleted before its window ran out.
    const simAws = new SimAws({ clock: new SimFixedClock(startedAt) });
    await simDynamoDbExpiringTableFactory.make({}, simAws);
    await putSession(simAws, "abc", ttlHours(0));
    await simAws.dynamoDb().deleteItem(
      new DeleteItemCommand({
        TableName: "Sessions",
        Key: { sessionId: { S: "abc" } },
      }),
    );

    // When the clock passes the window.
    await simAws.clock().advanceBy({ days: 3 });

    // Then the scheduled removal had nothing to do, rather than failing on a
    // key holding nothing.
    assertUndefined(await getSession(simAws, "abc"));
  });

  it("leaves a deleted item's expiry with nothing to do", async () => {
    // Given a session that has already been deleted by the application.
    const simAws = new SimAws({ clock: new SimFixedClock(startedAt) });
    await simDynamoDbExpiringTableFactory.make({}, simAws);
    await putSession(simAws, "abc", ttlHours(0));
    await simAws.dynamoDb().deleteItem(
      new DeleteItemCommand({
        TableName: "Sessions",
        Key: { sessionId: { S: "abc" } },
      }),
    );

    // And a new session written under the same key, expiring much later.
    await putSession(simAws, "abc", ttlHours(24 * 7));

    // When the clock passes the deleted session's window.
    await simAws.clock().advanceBy({ days: 3 });

    // Then the new session is untouched, rather than taken by the removal the
    // deleted one had scheduled.
    assertNonNullable(await getSession(simAws, "abc"));
  });

  it("expires items in due order as one advance passes each window", async () => {
    // Given two sessions expiring a day apart.
    const simAws = new SimAws({ clock: new SimFixedClock(startedAt) });
    await simDynamoDbExpiringTableFactory.make({}, simAws);
    await putSession(simAws, "first", ttlHours(0));
    await putSession(simAws, "second", ttlHours(24));

    // When the clock moves past the first window but not the second.
    await simAws.clock().advanceBy({ hours: 49 });

    // Then only the first has gone.
    assertUndefined(await getSession(simAws, "first"));
    assertNonNullable(await getSession(simAws, "second"));

    // And the second goes on the advance that reaches its own window.
    await simAws.clock().advanceBy({ hours: 24 });
    assertUndefined(await getSession(simAws, "second"));
  });
});
