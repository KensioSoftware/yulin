import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringEndsWith,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  simLogsCreateStream,
  simLogsGroupName,
  simLogsPutEvent,
  simLogsWithStreams,
} from "../../../test/logs/log-group-fixture.js";
import { SimFixedClock } from "../../util/clock/sim-clock.js";
import { SimAws } from "../aws/sim-aws.js";
import {
  SimLogsInvalidParameterException,
  SimLogsResourceAlreadyExistsException,
  SimLogsResourceNotFoundException,
} from "./error/sim-logs.error.js";

const createdAt = new Date("2026-08-16T09:00:00.000Z");

describe("SimLogs log streams", () => {
  it("creates a stream in a log group and describes it", async () => {
    // Given a log group with one stream.
    const logs = await simLogsWithStreams(
      ["stream-a"],
      new SimFixedClock(createdAt),
    );

    // When that stream is read back.
    const stream = logs.findLogGroup(simLogsGroupName)?.findStream("stream-a");

    // Then it carries the time it was made and its own ARN, and reports no
    // events yet.
    assertNonNullable(stream);
    assertIdentical(stream.creationTime, createdAt.getTime());
    assertUndefined(stream.firstEventTimestamp);
    assertUndefined(stream.lastEventTimestamp);
    assertUndefined(stream.lastIngestionTime);
    assertUndefined(stream.uploadSequenceToken);
    assertStringEndsWith(
      stream.arn,
      `log-group:${simLogsGroupName}:log-stream:stream-a`,
    );
  });

  it("counts stored bytes on the group, not the stream", async () => {
    // Given a stream that has taken an event.
    const logs = await simLogsWithStreams(["stream-a"]);

    await simLogsPutEvent(logs, "stream-a", 1, "something happened");

    // Then the group reports the bytes it holds: the message, plus the
    // per-event overhead AWS counts.
    assertIdentical(logs.findLogGroup(simLogsGroupName)?.storedBytes, 44);
  });

  it("refuses a stream that already exists", async () => {
    // Given a log group with one stream.
    const logs = await simLogsWithStreams(["stream-a"]);

    // When the same stream name is created again.
    const error = await assertThrowsErrorAsync(async () => {
      await simLogsCreateStream(logs, "stream-a");
    });

    // Then it fails rather than answering with the stream that is there.
    assertInstanceOf(error, SimLogsResourceAlreadyExistsException);
  });

  it("refuses a stream in a log group that is not there", async () => {
    // Given a simulated CloudWatch Logs holding nothing.
    const logs = new SimAws().logs();

    // When a stream is created in a group that was never made.
    const error = await assertThrowsErrorAsync(async () => {
      await simLogsCreateStream(logs, "stream-a");
    });

    // Then it fails as an unknown log group.
    assertInstanceOf(error, SimLogsResourceNotFoundException);
  });

  it("refuses a stream name real CloudWatch Logs would refuse", async () => {
    // Given a log group.
    const logs = await simLogsWithStreams([]);

    // When names are given carrying the two characters an ARN and a policy
    // need, along with one that is empty and one that is too long.
    const refusals = await Promise.all(
      ["2026/08/16:stream", "stream-*", "", "a".repeat(513)].map(
        async (logStreamName) =>
          await assertThrowsErrorAsync(async () => {
            await simLogsCreateStream(logs, logStreamName);
          }),
      ),
    );

    // Then each is refused as an invalid parameter.
    for (const refusal of refusals) {
      assertInstanceOf(refusal, SimLogsInvalidParameterException);
    }
  });
});
