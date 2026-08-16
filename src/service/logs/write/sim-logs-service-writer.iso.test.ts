import {
  assertArrayEquals,
  assertArrayLength,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimLogs } from "../sim-logs.js";

const logGroupName = "/aws/lambda/orders";
const logStreamName = "2026/08/16/[$LATEST]abc";

function messagesIn(logs: SimLogs): readonly string[] {
  return (
    logs
      .findLogGroup(logGroupName)
      ?.findStream(logStreamName)
      ?.events.map((event) => event.message) ?? []
  );
}

describe("SimLogsServiceWriter", () => {
  it("makes the group and the stream on the way", () => {
    // Given a simulated CloudWatch Logs holding nothing.
    const logs = new SimAws().logs();

    // When a simulated service writes to a group nothing created.
    logs.serviceWriter().write(logGroupName, logStreamName, ["a line"]);

    // Then both were made rather than the write being refused, which is what
    // lets a Lambda function log without a test creating anything first.
    assertArrayEquals(messagesIn(logs), ["a line"]);
  });

  it("opens a stream without writing to it", () => {
    // Given a simulated CloudWatch Logs holding nothing.
    const logs = new SimAws().logs();

    // When a stream is opened, twice.
    logs.serviceWriter().openStream(logGroupName, logStreamName);
    logs.serviceWriter().openStream(logGroupName, logStreamName);

    // Then it is there once and holds nothing, so an execution environment
    // that logged nothing still shows the stream it ran in.
    const group = logs.findLogGroup(logGroupName);

    assertNonNullable(group);
    assertArrayLength(group.streams, 1);
    assertArrayLength(group.streams.at(0)?.events ?? [], 0);
  });

  it("writes nothing for no lines", () => {
    // Given a simulated CloudWatch Logs holding nothing.
    const logs = new SimAws().logs();

    // When a write carries no lines at all.
    logs.serviceWriter().write(logGroupName, logStreamName, []);

    // Then nothing is made for it: a write with nothing in it should not be
    // what brings a log group into existence.
    assertUndefined(logs.findLogGroup(logGroupName));
  });

  it("appends to the stream a later write names again", () => {
    // Given a stream that has been written to.
    const logs = new SimAws().logs();

    logs.serviceWriter().write(logGroupName, logStreamName, ["first"]);

    // When more lines are written to the same stream.
    logs
      .serviceWriter()
      .write(logGroupName, logStreamName, ["second", "third"]);

    // Then they join the ones already there rather than replacing them.
    assertArrayEquals(messagesIn(logs), ["first", "second", "third"]);
  });
});
