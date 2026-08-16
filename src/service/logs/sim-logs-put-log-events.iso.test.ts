import {
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  DescribeLogStreamsCommand,
  GetLogEventsCommand,
  PutLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  assertArrayEquals,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimFixedClock } from "../../util/clock/sim-clock.js";
import { SimAws } from "../aws/sim-aws.js";
import {
  SimLogsInvalidParameterException,
  SimLogsResourceNotFoundException,
} from "./error/sim-logs.error.js";
import type { SimLogs } from "./sim-logs.js";

const logGroupName = "/aws/lambda/orders";
const logStreamName = "2026/08/16/[$LATEST]abc";
const ingestedAt = new Date("2026-08-16T09:00:00.000Z");

async function logsWithStream(clock?: SimFixedClock): Promise<SimLogs> {
  const logs = new SimAws(clock === undefined ? {} : { clock }).logs();

  await logs.createLogGroup(new CreateLogGroupCommand({ logGroupName }));
  await logs.createLogStream(
    new CreateLogStreamCommand({ logGroupName, logStreamName }),
  );

  return logs;
}

describe("SimLogs PutLogEvents", () => {
  it("writes events to a stream and reads them back", async () => {
    // Given a log group with a stream, and a clock stopped at ingestion.
    const logs = await logsWithStream(new SimFixedClock(ingestedAt));

    // When a batch is written.
    await logs.putLogEvents(
      new PutLogEventsCommand({
        logGroupName,
        logStreamName,
        logEvents: [
          { timestamp: 1000, message: "starting" },
          { timestamp: 2000, message: "ValidationError: order has no items" },
        ],
      }),
    );

    // Then both events are on the stream, carrying the time they were taken.
    const read = await logs.getLogEvents(
      new GetLogEventsCommand({ logGroupName, logStreamName }),
    );

    assertArrayEquals(
      read.events?.map((event) => event.message),
      ["starting", "ValidationError: order has no items"],
    );
    assertIdentical(read.events.at(0)?.ingestionTime, ingestedAt.getTime());
  });

  it("answers with a sequence token, and reports it on the stream", async () => {
    // Given a stream that has taken no batch.
    const logs = await logsWithStream();

    // When two batches are written.
    const first = await logs.putLogEvents(
      new PutLogEventsCommand({
        logGroupName,
        logStreamName,
        logEvents: [{ timestamp: 1000, message: "one" }],
      }),
    );
    const second = await logs.putLogEvents(
      new PutLogEventsCommand({
        logGroupName,
        logStreamName,
        // Real CloudWatch Logs has ignored this since 2023, and so does this.
        sequenceToken: first.nextSequenceToken,
        logEvents: [{ timestamp: 2000, message: "two" }],
      }),
    );

    // Then each answers with a token a caller can chain, and describing the
    // stream reports the latest one.
    const described = await logs.describeLogStreams(
      new DescribeLogStreamsCommand({ logGroupName }),
    );

    assertNonNullable(first.nextSequenceToken);
    assertNonNullable(second.nextSequenceToken);
    assertIdentical(
      described.logStreams?.at(0)?.uploadSequenceToken,
      second.nextSequenceToken,
    );
  });

  it("refuses a batch whose events are not in chronological order", async () => {
    // Given a log group with a stream.
    const logs = await logsWithStream();

    // When a batch is written with an older event after a newer one, which is
    // what collecting lines from several places and sending them produces.
    const error = await assertThrowsErrorAsync(
      async () =>
        await logs.putLogEvents(
          new PutLogEventsCommand({
            logGroupName,
            logStreamName,
            logEvents: [
              { timestamp: 2000, message: "later" },
              { timestamp: 1000, message: "earlier" },
            ],
          }),
        ),
    );

    // Then it is refused, as an account would refuse it.
    assertInstanceOf(error, SimLogsInvalidParameterException);
    assertStringIncludes(error.message, "chronological order");
  });

  it("takes a later batch carrying older events, and reads them back in order", async () => {
    // Given a stream that has taken one batch.
    const logs = await logsWithStream();

    await logs.putLogEvents(
      new PutLogEventsCommand({
        logGroupName,
        logStreamName,
        logEvents: [{ timestamp: 2000, message: "later" }],
      }),
    );

    // When a second batch carries an event older than the first batch's, which
    // real CloudWatch Logs allows because the rule is per batch.
    await logs.putLogEvents(
      new PutLogEventsCommand({
        logGroupName,
        logStreamName,
        logEvents: [{ timestamp: 1000, message: "earlier" }],
      }),
    );

    // Then reading the stream puts them back in timestamp order.
    const read = await logs.getLogEvents(
      new GetLogEventsCommand({ logGroupName, logStreamName }),
    );

    assertArrayEquals(
      read.events?.map((event) => event.message),
      ["earlier", "later"],
    );
  });

  it("refuses a batch with nothing in it, or an event missing its parts", async () => {
    // Given a log group with a stream.
    const logs = await logsWithStream();

    // When an empty batch and events missing a timestamp or a message are sent.
    const empty = await assertThrowsErrorAsync(
      async () =>
        await logs.putLogEvents(
          new PutLogEventsCommand({
            logGroupName,
            logStreamName,
            logEvents: [],
          }),
        ),
    );
    // The SDK's own types require both fields, so these two arrive the way
    // they would from JavaScript that never saw them.
    const noTimestamp = await assertThrowsErrorAsync(
      async () =>
        await logs.putLogEvents({
          input: {
            logGroupName,
            logStreamName,
            logEvents: [{ message: "no timestamp" }],
          },
        }),
    );
    const emptyMessage = await assertThrowsErrorAsync(
      async () =>
        await logs.putLogEvents(
          new PutLogEventsCommand({
            logGroupName,
            logStreamName,
            logEvents: [{ timestamp: 1000, message: "" }],
          }),
        ),
    );
    const noMessage = await assertThrowsErrorAsync(
      async () =>
        await logs.putLogEvents({
          input: {
            logGroupName,
            logStreamName,
            logEvents: [{ timestamp: 1000 }],
          },
        }),
    );

    // Then each is refused as an invalid parameter.
    assertInstanceOf(empty, SimLogsInvalidParameterException);
    assertInstanceOf(noTimestamp, SimLogsInvalidParameterException);
    assertInstanceOf(emptyMessage, SimLogsInvalidParameterException);
    assertInstanceOf(noMessage, SimLogsInvalidParameterException);
  });

  it("refuses a batch over the limits real CloudWatch Logs enforces", async () => {
    // Given a log group with a stream.
    const logs = await logsWithStream();

    // When a batch carries more events than one request may, and when one
    // carries more bytes than one request may.
    const tooMany = await assertThrowsErrorAsync(
      async () =>
        await logs.putLogEvents(
          new PutLogEventsCommand({
            logGroupName,
            logStreamName,
            logEvents: Array.from({ length: 10_001 }, (_, index) => ({
              timestamp: index,
              message: "line",
            })),
          }),
        ),
    );
    const tooBig = await assertThrowsErrorAsync(
      async () =>
        await logs.putLogEvents(
          new PutLogEventsCommand({
            logGroupName,
            logStreamName,
            logEvents: [{ timestamp: 1000, message: "a".repeat(1_048_577) }],
          }),
        ),
    );

    // Then both are refused, counting the per-event overhead AWS counts.
    assertInstanceOf(tooMany, SimLogsInvalidParameterException);
    assertInstanceOf(tooBig, SimLogsInvalidParameterException);
    assertStringIncludes(tooBig.message, "1048576 byte limit");
  });

  it("refuses a write to a group or stream that was never made", async () => {
    // Given a log group with one stream.
    const logs = await logsWithStream();

    // When events are written to another stream, and to another group.
    const unknownStream = await assertThrowsErrorAsync(
      async () =>
        await logs.putLogEvents(
          new PutLogEventsCommand({
            logGroupName,
            logStreamName: "never-created",
            logEvents: [{ timestamp: 1000, message: "line" }],
          }),
        ),
    );
    const unknownGroup = await assertThrowsErrorAsync(
      async () =>
        await logs.putLogEvents(
          new PutLogEventsCommand({
            logGroupName: "/aws/lambda/billing",
            logStreamName,
            logEvents: [{ timestamp: 1000, message: "line" }],
          }),
        ),
    );

    // Then neither is made on the way, as real CloudWatch Logs makes neither.
    assertInstanceOf(unknownStream, SimLogsResourceNotFoundException);
    assertInstanceOf(unknownGroup, SimLogsResourceNotFoundException);
  });
});
