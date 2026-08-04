import {
  PutItemCommand,
  UpdateTimeToLiveCommand,
} from "@aws-sdk/client-dynamodb";
import { assertIdentical, assertObjectEquals } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { SimFixedClock } from "../../../util/clock/sim-clock.js";
import { assertDefined } from "../../../util/type-guard/defined.js";
import { simDynamoDbStreamedTableFactory } from "./sim-dynamodb-streamed-table.factory.js";

/**
 * The instant this test starts from, and the epoch seconds of it.
 */
const startedAt = new Date("2026-08-04T09:00:00.000Z");
const startedAtSeconds = String(Math.floor(startedAt.getTime() / 1000));

describe("DynamoDB stream capture of a time to live expiry", () => {
  it("says DynamoDB made the removal, not the application", async () => {
    // Given a streamed table expiring its items, holding one that is due.
    const simAws = new SimAws({ clock: new SimFixedClock(startedAt) });
    const table = await simDynamoDbStreamedTableFactory.make({}, simAws);
    await simAws.dynamoDb().updateTimeToLive(
      new UpdateTimeToLiveCommand({
        TableName: "orders",
        TimeToLiveSpecification: { Enabled: true, AttributeName: "expiresAt" },
      }),
    );
    await simAws.backgroundTasksComplete();
    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: "orders",
        Item: {
          orderId: { S: "order-1" },
          expiresAt: { N: startedAtSeconds },
        },
      }),
    );

    // When the clock passes the deletion window.
    await simAws.clock().advanceBy({ days: 3 });

    // Then the removal carries the identity that tells an expiry from a
    // deletion the application asked for.
    const record = table.stream.latest?.records.at(1);
    assertDefined(record, "DynamoDB stream record");
    assertIdentical(record.eventName, "REMOVE");
    assertObjectEquals(record.userIdentity, {
      type: "Service",
      principalId: "dynamodb.amazonaws.com",
    });
  });
});
