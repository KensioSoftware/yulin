import { assertArrayLength, assertUndefined } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimLogsLogStream } from "./sim-logs-log-stream.js";

describe("SimLogsLogStream", () => {
  it("takes nothing from an empty batch", () => {
    // Given a stream that has never taken a batch.
    const stream = new SimLogsLogStream({
      logStreamName: "stream-a",
      arn: "arn:aws:logs:us-east-1:111111111111:log-group:orders:log-stream:stream-a",
      creationTime: 1000,
    });

    // When an empty batch is appended.
    stream.append([], 2000);

    // Then the stream is left as it was, rather than looking like it took a
    // batch it has nothing from.
    assertArrayLength(stream.events, 0);
    assertUndefined(stream.lastIngestionTime);
    assertUndefined(stream.uploadSequenceToken);
  });
});
