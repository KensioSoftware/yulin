import { GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { assertNonNullable, assertUndefined } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimDynamoDbAttributeValue } from "../command/item/item.types.js";
import { SimFixedClock } from "../../../util/clock/sim-clock.js";
import { simDynamoDbCreatedTableFactory } from "../table/sim-dynamodb-created-table.factory.js";
import { simDynamoDbExpiringTableFactory } from "./sim-dynamodb-expiring-table.factory.js";

/**
 * The instant every test here starts from, so the arithmetic in each one is
 * against a known number rather than against whenever the suite ran.
 */
const startedAt = new Date("2026-08-01T09:00:00.000Z");

/**
 * A simulation holding one table that expires items by `expiresAt`.
 */
async function expiringSessions(): Promise<SimAws> {
  const simAws = new SimAws({ clock: new SimFixedClock(startedAt) });

  await simDynamoDbExpiringTableFactory.make({}, simAws);

  return simAws;
}

/**
 * Epoch seconds a TTL attribute carries, a number of seconds from the start.
 */
function ttlSeconds(offsetSeconds: number): string {
  return String(Math.floor(startedAt.getTime() / 1000) + offsetSeconds);
}

/**
 * Write a session, expiring by whatever the caller puts in `expiresAt`.
 */
async function putSession(
  simAws: SimAws,
  sessionId: string,
  expiresAt: SimDynamoDbAttributeValue | undefined,
): Promise<void> {
  await simAws.dynamoDb().putItem({
    input: {
      TableName: "Sessions",
      Item: {
        sessionId: { S: sessionId },
        ...(expiresAt !== undefined && { expiresAt }),
      },
    },
  });
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

describe("DynamoDB item expiry", () => {
  it("keeps returning an item whose TTL timestamp has passed", async () => {
    // Given a session that expires an hour from now.
    const simAws = await expiringSessions();
    await putSession(simAws, "abc", { N: ttlSeconds(3600) });

    // When the clock moves an hour past that.
    await simAws.clock().advanceBy({ hours: 2 });

    // Then the session is still readable, as it would be on AWS: DynamoDB
    // deletes an expired item within about 48 hours rather than on the
    // timestamp.
    assertNonNullable(await getSession(simAws, "abc"));
  });

  it("deletes an item once its deletion window has passed", async () => {
    // Given a session that expires an hour from now.
    const simAws = await expiringSessions();
    await putSession(simAws, "abc", { N: ttlSeconds(3600) });

    // When the clock moves past the window, with nothing else asked of the
    // simulation.
    await simAws.clock().advanceBy({ days: 3 });

    // Then the session has gone.
    assertUndefined(await getSession(simAws, "abc"));
  });

  it("measures the window as 48 hours from the TTL timestamp", async () => {
    // Given a session that expired on the hour it was written.
    const simAws = await expiringSessions();
    await putSession(simAws, "abc", { N: ttlSeconds(0) });

    // When the clock reaches a minute short of 48 hours after that.
    await simAws.clock().advanceBy({ hours: 47, minutes: 59 });

    // Then the session is still there.
    assertNonNullable(await getSession(simAws, "abc"));

    // And it goes on the 48th hour, measured from the timestamp rather than
    // from the write or from the advance.
    await simAws.clock().advanceBy({ minutes: 1 });
    assertUndefined(await getSession(simAws, "abc"));
  });

  it("leaves an item alone until the clock next moves", async () => {
    // Given a session written with a TTL that ran out long ago.
    const simAws = await expiringSessions();
    await putSession(simAws, "abc", { N: ttlSeconds(-7 * 24 * 60 * 60) });

    // Then a read straight after the write still finds it, since nothing
    // dispatches expiry until simulated time moves.
    assertNonNullable(await getSession(simAws, "abc"));

    // And the smallest movement of the clock takes it.
    await simAws.clock().advanceBy({ milliseconds: 1 });
    assertUndefined(await getSession(simAws, "abc"));
  });

  it("never expires an item with no TTL attribute", async () => {
    // Given a session carrying no expiry at all.
    const simAws = await expiringSessions();
    await putSession(simAws, "abc", undefined);

    // When the clock moves a long way on.
    await simAws.clock().advanceBy({ days: 400 });

    // Then the session is still there.
    assertNonNullable(await getSession(simAws, "abc"));
  });

  it("never expires an item whose TTL attribute is not a Number", async () => {
    // Given a session whose expiry was written as a String, which is the
    // ordinary way to get this wrong.
    const simAws = await expiringSessions();
    await putSession(simAws, "abc", { S: ttlSeconds(0) });

    // When the clock moves past when it would have expired.
    await simAws.clock().advanceBy({ days: 400 });

    // Then the session is still there, and that is not an error: real DynamoDB
    // skips an attribute it cannot read as epoch seconds.
    assertNonNullable(await getSession(simAws, "abc"));
  });

  it("never expires an item whose TTL is in the future", async () => {
    // Given a session that expires in a year.
    const simAws = await expiringSessions();
    await putSession(simAws, "abc", { N: ttlSeconds(365 * 24 * 60 * 60) });

    // When the clock moves on by less than that.
    await simAws.clock().advanceBy({ days: 200 });

    // Then the session is still there.
    assertNonNullable(await getSession(simAws, "abc"));
  });

  it("never expires an item whose TTL is too large to be an instant", async () => {
    // Given a session whose expiry holds a number far past any date.
    const simAws = await expiringSessions();
    await putSession(simAws, "abc", { N: "9".repeat(30) });

    // When the clock moves on.
    await simAws.clock().advanceBy({ days: 400 });

    // Then the session is still there rather than the simulation failing on an
    // unreadable instant.
    assertNonNullable(await getSession(simAws, "abc"));
  });

  it("expires nothing on a table with time to live switched off", async () => {
    // Given a table nothing has switched time to live on for.
    const simAws = new SimAws({ clock: new SimFixedClock(startedAt) });
    await simDynamoDbCreatedTableFactory.make(
      { tableName: "Sessions", partitionKeyName: "sessionId" },
      simAws,
    );
    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: "Sessions",
        Item: { sessionId: { S: "abc" }, expiresAt: { N: ttlSeconds(0) } },
      }),
    );

    // When the clock moves a long way past the TTL timestamp.
    await simAws.clock().advanceBy({ days: 400 });

    // Then the item is still there. The attribute means nothing until an
    // UpdateTimeToLive says it does.
    assertNonNullable(await getSession(simAws, "abc"));
  });
});
