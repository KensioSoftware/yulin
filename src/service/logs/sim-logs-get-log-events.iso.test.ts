import {
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  GetLogEventsCommand,
  PutLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  assertArrayEmpty,
  assertArrayEquals,
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import {
  SimLogsInvalidParameterException,
  SimLogsResourceNotFoundException,
} from "./error/sim-logs.error.js";
import type { SimLogs } from "./sim-logs.js";

const logGroupName = "/aws/lambda/orders";
const logStreamName = "2026/08/16/[$LATEST]abc";

/**
 * A stream carrying one event per second, numbered from one.
 */
async function logsWithEvents(count: number): Promise<SimLogs> {
  const logs = new SimAws().logs();

  await logs.createLogGroup(new CreateLogGroupCommand({ logGroupName }));
  await logs.createLogStream(
    new CreateLogStreamCommand({ logGroupName, logStreamName }),
  );
  await logs.putLogEvents(
    new PutLogEventsCommand({
      logGroupName,
      logStreamName,
      logEvents: Array.from({ length: count }, (_, index) => ({
        timestamp: (index + 1) * 1000,
        message: `line ${index + 1}`,
      })),
    }),
  );

  return logs;
}

describe("SimLogs GetLogEvents", () => {
  it("reads the newest events first, and the oldest when asked from the head", async () => {
    // Given a stream with five events.
    const logs = await logsWithEvents(5);

    // When two are read from each end.
    const tail = await logs.getLogEvents(
      new GetLogEventsCommand({ logGroupName, logStreamName, limit: 2 }),
    );
    const head = await logs.getLogEvents(
      new GetLogEventsCommand({
        logGroupName,
        logStreamName,
        limit: 2,
        startFromHead: true,
      }),
    );

    // Then an unpaged read answers with the end of the stream, as real
    // CloudWatch Logs does, and startFromHead answers with the beginning.
    assertArrayEquals(
      tail.events?.map((event) => event.message),
      ["line 4", "line 5"],
    );
    assertArrayEquals(
      head.events?.map((event) => event.message),
      ["line 1", "line 2"],
    );
  });

  it("walks forwards through a stream with the forward token", async () => {
    // Given a stream with five events, read two at a time from the head.
    const logs = await logsWithEvents(5);
    const first = await logs.getLogEvents(
      new GetLogEventsCommand({
        logGroupName,
        logStreamName,
        limit: 2,
        startFromHead: true,
      }),
    );

    // When the forward token is followed twice more.
    const second = await logs.getLogEvents(
      new GetLogEventsCommand({
        logGroupName,
        logStreamName,
        limit: 2,
        nextToken: first.nextForwardToken,
      }),
    );
    const third = await logs.getLogEvents(
      new GetLogEventsCommand({
        logGroupName,
        logStreamName,
        limit: 2,
        nextToken: second.nextForwardToken,
      }),
    );
    const past = await logs.getLogEvents(
      new GetLogEventsCommand({
        logGroupName,
        logStreamName,
        limit: 2,
        nextToken: third.nextForwardToken,
      }),
    );

    // Then the walk reaches the end and then answers with nothing, giving the
    // same token back so a caller polling the stream knows to keep it.
    assertArrayEquals(
      second.events?.map((event) => event.message),
      ["line 3", "line 4"],
    );
    assertArrayEquals(
      third.events?.map((event) => event.message),
      ["line 5"],
    );
    assertArrayEmpty(past.events ?? []);
    assertIdentical(past.nextForwardToken, third.nextForwardToken);
  });

  it("walks backwards through a stream with the backward token", async () => {
    // Given a stream with five events, read two from the end.
    const logs = await logsWithEvents(5);
    const first = await logs.getLogEvents(
      new GetLogEventsCommand({ logGroupName, logStreamName, limit: 2 }),
    );

    // When the backward token is followed.
    const second = await logs.getLogEvents(
      new GetLogEventsCommand({
        logGroupName,
        logStreamName,
        limit: 2,
        nextToken: first.nextBackwardToken,
      }),
    );

    // Then it reaches the events before the page just read.
    assertArrayEquals(
      second.events?.map((event) => event.message),
      ["line 2", "line 3"],
    );
  });

  it("reads a half open time window", async () => {
    // Given a stream with five events, one per second.
    const logs = await logsWithEvents(5);

    // When a window is read from the second event up to the fourth.
    const read = await logs.getLogEvents(
      new GetLogEventsCommand({
        logGroupName,
        logStreamName,
        startTime: 2000,
        endTime: 4000,
        startFromHead: true,
      }),
    );

    // Then the start is included and the end is not, as AWS documents it.
    assertArrayEquals(
      read.events?.map((event) => event.message),
      ["line 2", "line 3"],
    );
  });

  it("refuses a token it did not issue and a limit it does not offer", async () => {
    // Given a stream with one event.
    const logs = await logsWithEvents(1);

    // When a made-up token and an out-of-range limit are sent.
    const token = await assertThrowsErrorAsync(
      async () =>
        await logs.getLogEvents(
          new GetLogEventsCommand({
            logGroupName,
            logStreamName,
            nextToken: "f/nowhere",
          }),
        ),
    );
    const limit = await assertThrowsErrorAsync(
      async () =>
        await logs.getLogEvents(
          new GetLogEventsCommand({ logGroupName, logStreamName, limit: 0 }),
        ),
    );

    // Then both are refused rather than quietly reinterpreted.
    assertInstanceOf(token, SimLogsInvalidParameterException);
    assertInstanceOf(limit, SimLogsInvalidParameterException);
  });

  it("refuses a read of a stream that is not there", async () => {
    // Given a log group with one stream.
    const logs = await logsWithEvents(1);

    // When another stream is read.
    const error = await assertThrowsErrorAsync(
      async () =>
        await logs.getLogEvents(
          new GetLogEventsCommand({
            logGroupName,
            logStreamName: "never-created",
          }),
        ),
    );

    // Then it fails as an unknown log stream.
    assertInstanceOf(error, SimLogsResourceNotFoundException);
  });
});
