import { assertStringIncludes, assertThrowsErrorAsync } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimLambdaNoEventSourceStreams } from "./sim-lambda-event-source-streams.js";

const streamArn =
  "arn:aws:dynamodb:eu-west-2:111111111111:table/orders/stream/2026-08-04T09:00:00.000";
const request = {
  streamArn,
  caller: { kind: "arn", arn: "arn:aws:iam::111111111111:role/Projector" },
} as const;

describe("sim Lambda event source streams with no simulated DynamoDB", () => {
  it("refuses every read operation, saying how to reach a stream", async () => {
    // Given a simulated Lambda with no simulated DynamoDB behind it.
    const streams = new SimLambdaNoEventSourceStreams();

    // When each polling operation is attempted.
    const errors = await Promise.all([
      assertThrowsErrorAsync(async () => {
        await streams.tableName(request);
      }),
      assertThrowsErrorAsync(async () => {
        await streams.read({
          ...request,
          position: { kind: "starting", start: { position: "TRIM_HORIZON" } },
          batchSize: 100,
        });
      }),
    ]);

    // Then each says there is nothing to poll, and how to fix it.
    for (const error of errors) {
      assertStringIncludes(error.message, "no simulated DynamoDB to poll");
      assertStringIncludes(error.message, streamArn);
    }
  });

  it("watches nothing, because there is no stream to watch", () => {
    // Given a simulated Lambda with no simulated DynamoDB behind it.
    const streams = new SimLambdaNoEventSourceStreams();

    // When a poller watches a stream and then stops.
    streams.watch();
    streams.unwatch();

    // Then nothing happened, and nothing threw.
  });
});
