import { DescribeLogStreamsCommand } from "@aws-sdk/client-cloudwatch-logs";
import {
  assertArrayEquals,
  assertInstanceOf,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  simLogsGroupName,
  simLogsPutEvent,
  simLogsStreamNames,
  simLogsWithStreams,
} from "../../../test/logs/log-group-fixture.js";
import { SimAws } from "../aws/sim-aws.js";
import {
  SimLogsInvalidParameterException,
  SimLogsResourceNotFoundException,
} from "./error/sim-logs.error.js";

describe("SimLogs DescribeLogStreams", () => {
  it("describes streams by name, under a prefix, and in reverse", async () => {
    // Given three streams made out of name order.
    const logs = await simLogsWithStreams(["b-stream", "a-stream", "other"]);

    // When they are described by name, by prefix, and descending.
    const byName = await simLogsStreamNames(logs);
    const byPrefix = await simLogsStreamNames(logs, {
      logStreamNamePrefix: "a-",
    });
    const descending = await simLogsStreamNames(logs, { descending: true });

    // Then name order is the default, the prefix narrows it, and descending
    // turns it around.
    assertArrayEquals(byName.names, ["a-stream", "b-stream", "other"]);
    assertArrayEquals(byPrefix.names, ["a-stream"]);
    assertArrayEquals(descending.names, ["other", "b-stream", "a-stream"]);
  });

  it("describes streams by when they last had an event", async () => {
    // Given two streams whose newest events are in the opposite order to their
    // names, and one that has never had an event.
    const logs = await simLogsWithStreams(["a-stream", "b-stream", "quiet"]);

    await simLogsPutEvent(logs, "a-stream", 2000, "later");
    await simLogsPutEvent(logs, "b-stream", 1000, "earlier");

    // When they are ordered by last event time.
    const described = await simLogsStreamNames(logs, {
      orderBy: "LastEventTime",
    });

    // Then the stream that has never had one sorts before both.
    assertArrayEquals(described.names, ["quiet", "b-stream", "a-stream"]);
  });

  it("sorts a stream with no events before one holding the epoch", async () => {
    // Given a stream carrying an event at timestamp zero, and one carrying
    // nothing, made in that order.
    const logs = await simLogsWithStreams(["at-the-epoch", "quiet"]);

    await simLogsPutEvent(logs, "at-the-epoch", 0, "the beginning of time");

    // When they are ordered by last event time.
    const described = await simLogsStreamNames(logs, {
      orderBy: "LastEventTime",
    });

    // Then the empty stream still sorts first: zero is a real timestamp, so
    // the two must not tie and fall back to creation order.
    assertArrayEquals(described.names, ["quiet", "at-the-epoch"]);
  });

  it("refuses an ordering it cannot honour alongside a prefix", async () => {
    // Given a log group with a stream.
    const logs = await simLogsWithStreams(["a-stream"]);

    // When last event time ordering is asked for with a name prefix, and when
    // an ordering that does not exist is asked for. The SDK's own types will
    // not express the second, so it arrives the way it would from JavaScript
    // that never saw them.
    const both = await assertThrowsErrorAsync(
      async () =>
        await simLogsStreamNames(logs, {
          orderBy: "LastEventTime",
          logStreamNamePrefix: "a-",
        }),
    );
    const unknown = await assertThrowsErrorAsync(
      async () =>
        await logs.describeLogStreams({
          input: { logGroupName: simLogsGroupName, orderBy: "CreationTime" },
        }),
    );

    // Then both are refused, as real CloudWatch Logs refuses them.
    assertInstanceOf(both, SimLogsInvalidParameterException);
    assertInstanceOf(unknown, SimLogsInvalidParameterException);
  });

  it("pages describing streams", async () => {
    // Given three streams.
    const logs = await simLogsWithStreams(["a-stream", "b-stream", "c-stream"]);

    // When they are described two at a time.
    const first = await simLogsStreamNames(logs, { limit: 2 });
    const second = await simLogsStreamNames(logs, {
      limit: 2,
      nextToken: first.nextToken,
    });

    // Then the second page carries on from the first.
    assertArrayEquals(first.names, ["a-stream", "b-stream"]);
    assertArrayEquals(second.names, ["c-stream"]);
    assertUndefined(second.nextToken);
  });

  it("refuses describing the streams of a log group that is not there", async () => {
    // Given a simulated CloudWatch Logs holding nothing.
    const logs = new SimAws().logs();

    // When the streams of a group that was never made are described.
    const error = await assertThrowsErrorAsync(
      async () =>
        await logs.describeLogStreams(
          new DescribeLogStreamsCommand({ logGroupName: simLogsGroupName }),
        ),
    );

    // Then it fails as an unknown log group.
    assertInstanceOf(error, SimLogsResourceNotFoundException);
  });
});
