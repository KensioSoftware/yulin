import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimLambdaError } from "../../../error/sim-lambda.error.js";
import { SimLambdaNoKinesisStreams } from "./sim-lambda-no-kinesis-streams.js";

const streamArn = "arn:aws:kinesis:eu-west-2:111111111111:stream/orders";

const request = { streamArn, caller: { kind: "arn", arn: "role" } } as const;

describe("a sim Lambda with no simulated Kinesis behind it", () => {
  it("says how to reach a stream when asked for its shards", async () => {
    // Given a SimLambda built on its own, outside SimAws.
    const streams = new SimLambdaNoKinesisStreams();

    // When a mapping asks which shards the stream has.
    const error = await assertThrowsErrorAsync(async () => {
      await streams.shardIds(request);
    });

    // Then it says what is missing and how to supply it, rather than reporting
    // a stream with no shards.
    assertInstanceOf(error, SimLambdaError);
    assertStringIncludes(error.message, "no simulated Kinesis to poll");
    assertStringIncludes(error.message, "Create the event source mapping");
  });

  it("says how to reach a stream when asked to read one", async () => {
    // Given a SimLambda built on its own.
    const streams = new SimLambdaNoKinesisStreams();

    // When a poll reads a shard.
    const error = await assertThrowsErrorAsync(async () => {
      await streams.read({
        ...request,
        shardId: "shardId-000000000000",
        position: { kind: "starting", start: { position: "TRIM_HORIZON" } },
        batchSize: 10,
      });
    });

    // Then it says the same thing.
    assertStringIncludes(error.message, streamArn);
  });

  it("watches nothing, since there is no stream to watch", () => {
    // Given a SimLambda built on its own.
    const streams = new SimLambdaNoKinesisStreams();

    // When a poller watches and stops watching.
    // Then neither does anything, and neither raises.
    streams.watch();
    streams.unwatch();
  });
});
