import { assertStringIncludes, assertThrowsErrorAsync } from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  kinesisPollingActions,
  makeKinesisPollingRole,
} from "../../../../test/lambda/kinesis-event-source-fixture.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simKinesisStreamFactory } from "../../kinesis/stream/sim-kinesis-stream.factory.js";
import { makeLambdaZipFileInput } from "../function/code/lambda-zip-file-input.js";

/**
 * A simulated AWS with a stream and a function whose role may poll it.
 */
async function simAwsWithStreamAndFunction(
  roleActions: readonly string[] = kinesisPollingActions,
  roleResource?: string,
): Promise<{ readonly simAws: SimAws; readonly streamArn: string }> {
  const simAws = new SimAws();
  const stream = await simKinesisStreamFactory.make({}, simAws);
  const roleArn = await makeKinesisPollingRole(
    simAws,
    roleResource ?? stream.arn,
    roleActions,
  );

  await simAws.lambda().createFunction({
    input: {
      FunctionName: "order-projector",
      Role: roleArn,
      Code: { ZipFile: makeLambdaZipFileInput((): undefined => undefined) },
    },
  });

  return { simAws, streamArn: stream.arn };
}

/**
 * Create a mapping, giving back whatever it was refused with.
 */
async function refusalFrom(
  simAws: SimAws,
  input: {
    readonly EventSourceArn: string;
    readonly StartingPosition?: string;
  },
): Promise<Error> {
  return await assertThrowsErrorAsync(async () => {
    await simAws.lambda().createEventSourceMapping({
      input: { ...input, FunctionName: "order-projector" },
    });
  });
}

describe("sim Lambda Kinesis stream event source mapping validation", () => {
  it("refuses a mapping whose role may not read the stream", async () => {
    // Given a function whose role may describe the stream but not read it.
    const { simAws, streamArn } = await simAwsWithStreamAndFunction([
      "kinesis:DescribeStream",
      "kinesis:GetShardIterator",
    ]);

    // When a mapping is created on that stream.
    const error = await refusalFrom(simAws, {
      EventSourceArn: streamArn,
      StartingPosition: "TRIM_HORIZON",
    });

    // Then it is refused at creation, naming the operation it cannot call,
    // rather than being created and delivering nothing.
    assertStringIncludes(
      error.message,
      "does not have permissions to call GetRecords on Kinesis Data Streams",
    );
  });

  it("refuses a mapping to a stream that is not there", async () => {
    // Given a function whose role may read any stream in the Account.
    const { simAws } = await simAwsWithStreamAndFunction(
      kinesisPollingActions,
      "*",
    );

    // When a mapping is created on a stream nothing made.
    const error = await refusalFrom(simAws, {
      EventSourceArn: `arn:aws:kinesis:${simAws.defaultRegionName}:${simAws.defaultAccountId}:stream/nowhere`,
      StartingPosition: "TRIM_HORIZON",
    });

    // Then it is refused rather than left subscribed to nothing.
    assertStringIncludes(error.message, "does not exist");
  });

  it("refuses a mapping on a stream with no starting position", async () => {
    // Given a stream and a function.
    const { simAws, streamArn } = await simAwsWithStreamAndFunction();

    // When a mapping is created without saying where to start.
    const error = await refusalFrom(simAws, { EventSourceArn: streamArn });

    // Then it is refused, since replaying the stream and taking only what
    // arrives next are both reasonable and neither is a default.
    assertStringIncludes(
      error.message,
      "StartingPosition is required for a Kinesis stream",
    );
  });

  it("refuses an AT_TIMESTAMP mapping with no timestamp", async () => {
    // Given a stream and a function.
    const { simAws, streamArn } = await simAwsWithStreamAndFunction();

    // When a mapping is created to start at an instant it does not name.
    const error = await refusalFrom(simAws, {
      EventSourceArn: streamArn,
      StartingPosition: "AT_TIMESTAMP",
    });

    // Then it is refused.
    assertStringIncludes(error.message, "requires a StartingPositionTimestamp");
  });

  it("refuses a mapping naming an enhanced fan-out consumer", async () => {
    // Given a stream and a function.
    const { simAws, streamArn } = await simAwsWithStreamAndFunction();

    // When a mapping is created on a consumer of that stream.
    const error = await refusalFrom(simAws, {
      EventSourceArn: `${streamArn}/consumer/projector:1756000000`,
      StartingPosition: "TRIM_HORIZON",
    });

    // Then it is refused, since enhanced fan-out is unsimulated and a consumer
    // ARN is not the stream ARN with something harmless on the end.
    assertStringIncludes(error.message, "names no simulated Lambda event");
    assertStringIncludes(error.message, "Kinesis stream ARN is");
  });
});
