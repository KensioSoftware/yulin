import {
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  FilterLogEventsCommand,
  PutLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import {
  SimLogsInvalidParameterException,
  SimLogsResourceNotFoundException,
} from "./error/sim-logs.error.js";
import type { SimLogs } from "./sim-logs.js";

const logGroupName = "/aws/lambda/orders";

/**
 * A log group whose two execution environments each wrote two lines, so that
 * the newest and oldest events are on different streams.
 */
async function logsWithTwoStreams(): Promise<SimLogs> {
  const logs = new SimAws().logs();

  await logs.createLogGroup(new CreateLogGroupCommand({ logGroupName }));

  const written: Record<string, readonly [number, string][]> = {
    "stream-cold": [
      [1000, "INFO starting up"],
      [3000, "ERROR order has no items"],
    ],
    "stream-warm": [
      [2000, "INFO handling order-2"],
      [4000, "WARN retrying downstream call"],
    ],
  };

  for (const [logStreamName, lines] of Object.entries(written)) {
    await logs.createLogStream(
      new CreateLogStreamCommand({ logGroupName, logStreamName }),
    );
    await logs.putLogEvents(
      new PutLogEventsCommand({
        logGroupName,
        logStreamName,
        logEvents: lines.map(([timestamp, message]) => ({
          timestamp,
          message,
        })),
      }),
    );
  }

  return logs;
}

describe("SimLogs FilterLogEvents", () => {
  it("searches every stream in a log group, oldest first", async () => {
    // Given a log group whose events are spread over two streams.
    const logs = await logsWithTwoStreams();

    // When the group is searched with no pattern.
    const found = await logs.filterLogEvents(
      new FilterLogEventsCommand({ logGroupName }),
    );

    // Then the events come back in timestamp order across both streams, each
    // saying which stream it came from.
    assertArrayEquals(
      found.events?.map((event) => event.message),
      [
        "INFO starting up",
        "INFO handling order-2",
        "ERROR order has no items",
        "WARN retrying downstream call",
      ],
    );
    assertIdentical(found.events?.at(0)?.logStreamName, "stream-cold");
    assertIdentical(found.events?.at(1)?.logStreamName, "stream-warm");
  });

  it("finds what a handler logged without the test knowing which stream wrote it", async () => {
    // Given the same log group.
    const logs = await logsWithTwoStreams();

    // When it is searched for one line.
    const found = await logs.filterLogEvents(
      new FilterLogEventsCommand({
        logGroupName,
        filterPattern: '"order has no items"',
      }),
    );

    // Then exactly that event is found, with an ID of its own.
    assertArrayLength(found.events ?? [], 1);

    const event = found.events?.at(0);

    assertNonNullable(event);
    assertIdentical(event.message, "ERROR order has no items");
    assertIdentical(event.logStreamName, "stream-cold");
    assertIdentical(event.timestamp, 3000);
    assertIdentical(typeof event.eventId, "string");
  });

  it("gives every event its own identifier", async () => {
    // Given a log group whose events are spread over two streams.
    const logs = await logsWithTwoStreams();

    // When everything is searched for.
    const found = await logs.filterLogEvents(
      new FilterLogEventsCommand({ logGroupName }),
    );

    // Then no two events share an ID, across streams as well as within one.
    const eventIds = new Set(found.events?.map((event) => event.eventId));

    assertIdentical(eventIds.size, 4);
  });

  it("keeps two events sharing a timestamp in the order they arrived", async () => {
    // Given two streams that each logged at the same millisecond, which two
    // execution environments handling a burst of requests do.
    const logs = new SimAws().logs();

    await logs.createLogGroup(new CreateLogGroupCommand({ logGroupName }));

    for (const logStreamName of ["stream-second", "stream-first"]) {
      await logs.createLogStream(
        new CreateLogStreamCommand({ logGroupName, logStreamName }),
      );
      await logs.putLogEvents(
        new PutLogEventsCommand({
          logGroupName,
          logStreamName,
          logEvents: [{ timestamp: 1000, message: `from ${logStreamName}` }],
        }),
      );
    }

    // When the group is searched.
    const found = await logs.filterLogEvents(
      new FilterLogEventsCommand({ logGroupName }),
    );

    // Then ingestion order decides between them rather than the stream name.
    assertArrayEquals(
      found.events?.map((event) => event.logStreamName),
      ["stream-second", "stream-first"],
    );
  });

  it("narrows a search to a half open time window", async () => {
    // Given the same log group.
    const logs = await logsWithTwoStreams();

    // When a window is searched from the second event up to the fourth.
    const found = await logs.filterLogEvents(
      new FilterLogEventsCommand({
        logGroupName,
        startTime: 2000,
        endTime: 4000,
      }),
    );

    // Then the start is included and the end is not.
    assertArrayEquals(
      found.events?.map((event) => event.timestamp),
      [2000, 3000],
    );
  });

  it("searches named streams, or streams under a prefix", async () => {
    // Given the same log group.
    const logs = await logsWithTwoStreams();

    // When one stream is named, and then a prefix is used.
    const named = await logs.filterLogEvents(
      new FilterLogEventsCommand({
        logGroupName,
        logStreamNames: ["stream-warm", "never-created"],
      }),
    );
    const prefixed = await logs.filterLogEvents(
      new FilterLogEventsCommand({
        logGroupName,
        logStreamNamePrefix: "stream-c",
      }),
    );

    // Then only those streams are searched, and a name nothing has simply
    // contributes nothing rather than failing.
    assertArrayEquals(
      named.events?.map((event) => event.logStreamName),
      ["stream-warm", "stream-warm"],
    );
    assertArrayEquals(
      prefixed.events?.map((event) => event.logStreamName),
      ["stream-cold", "stream-cold"],
    );
  });

  it("refuses both stream selectors at once", async () => {
    // Given the same log group.
    const logs = await logsWithTwoStreams();

    // When named streams and a name prefix are both given.
    const error = await assertThrowsErrorAsync(
      async () =>
        await logs.filterLogEvents(
          new FilterLogEventsCommand({
            logGroupName,
            logStreamNames: ["stream-warm"],
            logStreamNamePrefix: "stream-",
          }),
        ),
    );

    // Then it is refused rather than one of them quietly winning.
    assertInstanceOf(error, SimLogsInvalidParameterException);
  });

  it("pages a search", async () => {
    // Given a log group with four events.
    const logs = await logsWithTwoStreams();

    // When they are searched three at a time.
    const first = await logs.filterLogEvents(
      new FilterLogEventsCommand({ logGroupName, limit: 3 }),
    );
    const second = await logs.filterLogEvents(
      new FilterLogEventsCommand({
        logGroupName,
        limit: 3,
        nextToken: first.nextToken,
      }),
    );

    // Then the second page carries on from the first and ends the walk.
    assertArrayLength(first.events ?? [], 3);
    assertArrayEquals(
      second.events?.map((event) => event.message),
      ["WARN retrying downstream call"],
    );
    assertUndefined(second.nextToken);
  });

  it("refuses a search of a log group that is not there", async () => {
    // Given a simulated CloudWatch Logs holding nothing.
    const logs = new SimAws().logs();

    // When a group that was never made is searched.
    const error = await assertThrowsErrorAsync(
      async () =>
        await logs.filterLogEvents(
          new FilterLogEventsCommand({ logGroupName }),
        ),
    );

    // Then it fails as an unknown log group.
    assertInstanceOf(error, SimLogsResourceNotFoundException);
  });
});
