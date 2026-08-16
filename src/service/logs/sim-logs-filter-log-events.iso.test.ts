import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertSetSize,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  simLogsFilter,
  simLogsWithTwoStreams,
  simLogsWithWrittenStreams,
} from "../../../test/logs/log-group-fixture.js";

describe("SimLogs FilterLogEvents", () => {
  it("searches every stream in a log group, oldest first", async () => {
    // Given a log group whose events are spread over two streams.
    const logs = await simLogsWithTwoStreams();

    // When the group is searched with no pattern.
    const found = await simLogsFilter(logs);

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
    assertArrayEquals(
      found.events.map((event) => event.logStreamName),
      ["stream-cold", "stream-warm", "stream-cold", "stream-warm"],
    );
  });

  it("finds what a handler logged without the test knowing which stream wrote it", async () => {
    // Given the same log group.
    const logs = await simLogsWithTwoStreams();

    // When it is searched for one line.
    const found = await simLogsFilter(logs, {
      filterPattern: '"order has no items"',
    });

    // Then exactly that event is found, with an ID of its own.
    assertArrayLength(found.events ?? [], 1);

    const event = found.events?.at(0);

    assertNonNullable(event);
    assertIdentical(event.message, "ERROR order has no items");
    assertIdentical(event.logStreamName, "stream-cold");
    assertIdentical(event.timestamp, 3000);
    assertTypeString(event.eventId);
  });

  it("gives every event its own identifier", async () => {
    // Given a log group whose events are spread over two streams.
    const logs = await simLogsWithTwoStreams();

    // When everything is searched for.
    const found = await simLogsFilter(logs);

    // Then no two events share an ID, across streams as well as within one.
    assertSetSize(new Set(found.events?.map((event) => event.eventId)), 4);
  });

  it("keeps two events sharing a timestamp in the order they arrived", async () => {
    // Given two streams that each logged at the same millisecond, which two
    // execution environments handling a burst of requests do.
    const logs = await simLogsWithWrittenStreams({
      "stream-second": [[1000, "from the second stream"]],
      "stream-first": [[1000, "from the first stream"]],
    });

    // When the group is searched.
    const found = await simLogsFilter(logs);

    // Then ingestion order decides between them rather than the stream name.
    assertArrayEquals(
      found.events?.map((event) => event.logStreamName),
      ["stream-second", "stream-first"],
    );
  });
});
