import {
  CreateStreamCommand,
  DeleteStreamCommand,
} from "@aws-sdk/client-kinesis";
import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { SimKinesisInvalidArgumentException } from "../error/sim-kinesis.error.js";
import { simKinesisStreamFactory } from "../stream/sim-kinesis-stream.factory.js";

/**
 * The error a call raised, as the assertions here want it.
 */
async function refusalFrom(
  call: () => Promise<unknown>,
): Promise<SimKinesisInvalidArgumentException> {
  const error = await assertThrowsErrorAsync(call);
  assertInstanceOf(error, SimKinesisInvalidArgumentException);

  return error;
}

describe("What simulated Kinesis refuses of a stream request", () => {
  it("refuses a stream created with no name", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a stream is created with an empty name.
    const error = await refusalFrom(async () => {
      await simAws
        .kinesis()
        .createStream(new CreateStreamCommand({ StreamName: "" }));
    });

    // Then it is refused.
    assertStringIncludes(error.message, "StreamName is required");
  });

  it("refuses a stream name Kinesis would not accept", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a stream is created with a slash in its name.
    const error = await refusalFrom(async () => {
      await simAws
        .kinesis()
        .createStream(new CreateStreamCommand({ StreamName: "orders/live" }));
    });

    // Then it is refused, saying which characters a name may hold.
    assertStringIncludes(error.message, "letters, digits");
  });

  it("refuses a stream name longer than Kinesis accepts", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a stream is created with a name of 129 characters.
    const error = await refusalFrom(async () => {
      await simAws
        .kinesis()
        .createStream(new CreateStreamCommand({ StreamName: "o".repeat(129) }));
    });

    // Then it is refused.
    assertStringIncludes(error.message, "128");
  });

  it("refuses a shard count that is not a whole number of shards", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a stream is created with no shards.
    const error = await refusalFrom(async () => {
      await simAws
        .kinesis()
        .createStream(
          new CreateStreamCommand({ StreamName: "orders", ShardCount: 0 }),
        );
    });

    // Then it is refused.
    assertStringIncludes(error.message, "ShardCount 0");
  });

  it("refuses more shards than Kinesis creates a stream with", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a stream is created with more than a hundred thousand shards.
    const error = await refusalFrom(async () => {
      await simAws.kinesis().createStream(
        new CreateStreamCommand({
          StreamName: "orders",
          ShardCount: 100_001,
        }),
      );
    });

    // Then it is refused.
    assertStringIncludes(error.message, "100000 shards");
  });

  it("refuses a stream mode Kinesis does not have", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a stream is created in a mode that is neither of the two. The SDK's
    // own types refuse to build this command, so the request is made
    // structurally.
    const error = await refusalFrom(async () => {
      await simAws.kinesis().createStream({
        input: {
          StreamName: "orders",
          StreamModeDetails: { StreamMode: "SOMETIMES" },
        },
      });
    });

    // Then it is refused.
    assertStringIncludes(error.message, "PROVISIONED");
  });

  it("refuses a shard count on an on-demand stream", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a stream is created in on-demand mode with a shard count.
    const error = await refusalFrom(async () => {
      await simAws.kinesis().createStream(
        new CreateStreamCommand({
          StreamName: "orders",
          ShardCount: 2,
          StreamModeDetails: { StreamMode: "ON_DEMAND" },
        }),
      );
    });

    // Then it is refused, as real Kinesis refuses both together.
    assertStringIncludes(error.message, "ON_DEMAND");
  });

  it("refuses a request naming neither a stream name nor a stream ARN", async () => {
    // Given a stream.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({}, simAws);

    // When a stream is deleted without being named.
    const error = await refusalFrom(async () => {
      await simAws.kinesis().deleteStream(new DeleteStreamCommand({}));
    });

    // Then it is refused.
    assertStringIncludes(error.message, "StreamName or by StreamARN");
  });
});
