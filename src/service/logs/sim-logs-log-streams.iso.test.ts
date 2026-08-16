import {
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  DescribeLogStreamsCommand,
  PutLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  assertArrayEquals,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimFixedClock } from "../../util/clock/sim-clock.js";
import { SimAws } from "../aws/sim-aws.js";
import {
  SimLogsInvalidParameterException,
  SimLogsResourceAlreadyExistsException,
  SimLogsResourceNotFoundException,
} from "./error/sim-logs.error.js";
import type { SimLogs } from "./sim-logs.js";

const logGroupName = "/aws/lambda/orders";
const createdAt = new Date("2026-08-16T09:00:00.000Z");

async function logsWithStreams(
  logStreamNames: readonly string[],
  clock?: SimFixedClock,
): Promise<SimLogs> {
  const logs = new SimAws(clock === undefined ? {} : { clock }).logs();

  await logs.createLogGroup(new CreateLogGroupCommand({ logGroupName }));

  for (const logStreamName of logStreamNames) {
    await logs.createLogStream(
      new CreateLogStreamCommand({ logGroupName, logStreamName }),
    );
  }

  return logs;
}

describe("SimLogs log streams", () => {
  it("creates a stream in a log group and describes it", async () => {
    // Given a log group with one stream.
    const logs = await logsWithStreams(["stream-a"], new SimFixedClock(createdAt));

    // When its streams are described.
    const described = await logs.describeLogStreams(
      new DescribeLogStreamsCommand({ logGroupName }),
    );
    const stream = described.logStreams?.at(0);

    // Then it carries the time it was made and its own ARN, and reports no
    // events yet.
    assertNonNullable(stream);
    assertIdentical(stream.logStreamName, "stream-a");
    assertIdentical(stream.creationTime, createdAt.getTime());
    assertUndefined(stream.firstEventTimestamp);
    assertUndefined(stream.lastEventTimestamp);
    assertUndefined(stream.lastIngestionTime);
    assertUndefined(stream.uploadSequenceToken);
    assertIdentical(
      stream.arn.endsWith(`log-group:${logGroupName}:log-stream:stream-a`),
      true,
    );
  });

  it("reports zero stored bytes per stream, as real CloudWatch Logs has since 2019", async () => {
    // Given a stream that has taken an event.
    const logs = await logsWithStreams(["stream-a"]);

    await logs.putLogEvents(
      new PutLogEventsCommand({
        logGroupName,
        logStreamName: "stream-a",
        logEvents: [{ timestamp: 1, message: "something happened" }],
      }),
    );

    // When the streams and the group are described.
    const streams = await logs.describeLogStreams(
      new DescribeLogStreamsCommand({ logGroupName }),
    );

    // Then the stream reports nothing stored and the group reports the bytes.
    assertIdentical(streams.logStreams?.at(0)?.storedBytes, 0);
    assertIdentical(logs.findLogGroup(logGroupName)?.storedBytes, 44);
  });

  it("refuses a stream that already exists", async () => {
    // Given a log group with one stream.
    const logs = await logsWithStreams(["stream-a"]);

    // When the same stream name is created again.
    const error = await assertThrowsErrorAsync(
      async () =>
        await logs.createLogStream(
          new CreateLogStreamCommand({
            logGroupName,
            logStreamName: "stream-a",
          }),
        ),
    );

    // Then it fails rather than answering with the stream that is there.
    assertInstanceOf(error, SimLogsResourceAlreadyExistsException);
  });

  it("refuses a stream in a log group that is not there", async () => {
    // Given a simulated CloudWatch Logs holding nothing.
    const logs = new SimAws().logs();

    // When a stream is created in a group that was never made.
    const error = await assertThrowsErrorAsync(
      async () =>
        await logs.createLogStream(
          new CreateLogStreamCommand({
            logGroupName,
            logStreamName: "stream-a",
          }),
        ),
    );

    // Then it fails as an unknown log group.
    assertInstanceOf(error, SimLogsResourceNotFoundException);
  });

  it("refuses a stream name real CloudWatch Logs would refuse", async () => {
    // Given a log group.
    const logs = await logsWithStreams([]);

    // When names carrying the characters an ARN and a policy need are given.
    const colon = await assertThrowsErrorAsync(
      async () =>
        await logs.createLogStream(
          new CreateLogStreamCommand({
            logGroupName,
            logStreamName: "2026/08/16:stream",
          }),
        ),
    );
    const star = await assertThrowsErrorAsync(
      async () =>
        await logs.createLogStream(
          new CreateLogStreamCommand({
            logGroupName,
            logStreamName: "stream-*",
          }),
        ),
    );
    const empty = await assertThrowsErrorAsync(
      async () =>
        await logs.createLogStream(
          new CreateLogStreamCommand({ logGroupName, logStreamName: "" }),
        ),
    );
    const tooLong = await assertThrowsErrorAsync(
      async () =>
        await logs.createLogStream(
          new CreateLogStreamCommand({
            logGroupName,
            logStreamName: "a".repeat(513),
          }),
        ),
    );

    // Then each is refused as an invalid parameter.
    assertInstanceOf(colon, SimLogsInvalidParameterException);
    assertInstanceOf(star, SimLogsInvalidParameterException);
    assertInstanceOf(empty, SimLogsInvalidParameterException);
    assertInstanceOf(tooLong, SimLogsInvalidParameterException);
  });

  it("describes streams by name, under a prefix, and in reverse", async () => {
    // Given three streams made out of name order.
    const logs = await logsWithStreams(["b-stream", "a-stream", "other"]);

    // When they are described by name, by prefix, and descending.
    const byName = await logs.describeLogStreams(
      new DescribeLogStreamsCommand({ logGroupName }),
    );
    const byPrefix = await logs.describeLogStreams(
      new DescribeLogStreamsCommand({
        logGroupName,
        logStreamNamePrefix: "a-",
      }),
    );
    const descending = await logs.describeLogStreams(
      new DescribeLogStreamsCommand({ logGroupName, descending: true }),
    );

    // Then name order is the default, the prefix narrows it, and descending
    // turns it around.
    assertArrayEquals(
      byName.logStreams?.map((stream) => stream.logStreamName),
      ["a-stream", "b-stream", "other"],
    );
    assertArrayEquals(
      byPrefix.logStreams?.map((stream) => stream.logStreamName),
      ["a-stream"],
    );
    assertArrayEquals(
      descending.logStreams?.map((stream) => stream.logStreamName),
      ["other", "b-stream", "a-stream"],
    );
  });

  it("describes streams by when they last had an event", async () => {
    // Given two streams whose newest events are in the opposite order to their
    // names, and one that has never had an event.
    const logs = await logsWithStreams(["a-stream", "b-stream", "quiet"]);

    await logs.putLogEvents(
      new PutLogEventsCommand({
        logGroupName,
        logStreamName: "a-stream",
        logEvents: [{ timestamp: 2000, message: "later" }],
      }),
    );
    await logs.putLogEvents(
      new PutLogEventsCommand({
        logGroupName,
        logStreamName: "b-stream",
        logEvents: [{ timestamp: 1000, message: "earlier" }],
      }),
    );

    // When they are ordered by last event time.
    const described = await logs.describeLogStreams(
      new DescribeLogStreamsCommand({ logGroupName, orderBy: "LastEventTime" }),
    );

    // Then the stream that has never had one sorts before both.
    assertArrayEquals(
      described.logStreams?.map((stream) => stream.logStreamName),
      ["quiet", "b-stream", "a-stream"],
    );
  });

  it("refuses an ordering it cannot honour alongside a prefix", async () => {
    // Given a log group with a stream.
    const logs = await logsWithStreams(["a-stream"]);

    // When last event time ordering is asked for with a name prefix, and when
    // an ordering that does not exist is asked for.
    const both = await assertThrowsErrorAsync(
      async () =>
        await logs.describeLogStreams(
          new DescribeLogStreamsCommand({
            logGroupName,
            orderBy: "LastEventTime",
            logStreamNamePrefix: "a-",
          }),
        ),
    );
    // The SDK's own types will not express this one, so it arrives the way it
    // would from JavaScript that never saw them.
    const unknown = await assertThrowsErrorAsync(
      async () =>
        await logs.describeLogStreams({
          input: { logGroupName, orderBy: "CreationTime" },
        }),
    );

    // Then both are refused, as real CloudWatch Logs refuses them.
    assertInstanceOf(both, SimLogsInvalidParameterException);
    assertInstanceOf(unknown, SimLogsInvalidParameterException);
  });

  it("pages describing streams", async () => {
    // Given three streams.
    const logs = await logsWithStreams(["a-stream", "b-stream", "c-stream"]);

    // When they are described two at a time.
    const first = await logs.describeLogStreams(
      new DescribeLogStreamsCommand({ logGroupName, limit: 2 }),
    );
    const second = await logs.describeLogStreams(
      new DescribeLogStreamsCommand({
        logGroupName,
        limit: 2,
        nextToken: first.nextToken,
      }),
    );

    // Then the second page carries on from the first.
    assertArrayEquals(
      first.logStreams?.map((stream) => stream.logStreamName),
      ["a-stream", "b-stream"],
    );
    assertArrayEquals(
      second.logStreams?.map((stream) => stream.logStreamName),
      ["c-stream"],
    );
    assertUndefined(second.nextToken);
  });

  it("refuses describing the streams of a log group that is not there", async () => {
    // Given a simulated CloudWatch Logs holding nothing.
    const logs = new SimAws().logs();

    // When the streams of a group that was never made are described.
    const error = await assertThrowsErrorAsync(
      async () =>
        await logs.describeLogStreams(
          new DescribeLogStreamsCommand({ logGroupName }),
        ),
    );

    // Then it fails as an unknown log group.
    assertInstanceOf(error, SimLogsResourceNotFoundException);
  });
});
