import {
  CreateEventSourceMappingCommand,
  type EventSourcePosition,
} from "@aws-sdk/client-lambda";
import { assertStringIncludes, assertThrowsErrorAsync } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import {
  makeSourceStream,
  makeStreamPollingRole,
  simAwsWithStreamEventSource,
  streamPollingActions,
} from "../../../../test/lambda/stream-event-source-fixture.js";
import { makeLambdaZipFileInput } from "../function/code/lambda-zip-file-input.js";

interface StreamMappingRequest {
  readonly StartingPosition?: EventSourcePosition;
  readonly StartingPositionTimestamp?: Date;
  readonly BatchSize?: number;
  readonly FunctionResponseTypes?: "ReportBatchItemFailures"[];
}

/**
 * Try to create a stream mapping, with a role allowed to read the stream.
 */
async function createStreamMapping(
  request: StreamMappingRequest,
  roleActions: readonly string[] = streamPollingActions,
): Promise<Error> {
  const simAws = new SimAws();
  const { streamArn } = await makeSourceStream(simAws);
  const roleArn = await makeStreamPollingRole(simAws, streamArn, roleActions);

  await simAws.lambda().createFunction({
    input: {
      FunctionName: "order-projector",
      Role: roleArn,
      Code: { ZipFile: makeLambdaZipFileInput((): undefined => undefined) },
    },
  });

  return await assertThrowsErrorAsync(async () => {
    await simAws.lambda().createEventSourceMapping(
      new CreateEventSourceMappingCommand({
        EventSourceArn: streamArn,
        FunctionName: "order-projector",
        ...request,
      }),
    );
  });
}

describe("sim Lambda DynamoDB stream event source mapping validation", () => {
  it("refuses a stream mapping that says nothing about where to start", async () => {
    // Given a stream and a function.
    // When a mapping is created without a starting position.
    const error = await createStreamMapping({});

    // Then it is refused, because there is no sensible default between
    // replaying the stream and taking only what happens next.
    assertStringIncludes(
      error.message,
      "StartingPosition is required for a DynamoDB stream",
    );
  });

  it("refuses AT_TIMESTAMP by name", async () => {
    // Given a stream and a function.
    // When a mapping asks to start at a timestamp.
    const error = await createStreamMapping({
      StartingPosition: "AT_TIMESTAMP",
      StartingPositionTimestamp: new Date("2026-08-04T09:00:00.000Z"),
    });

    // Then it is refused, saying which source that position belongs to.
    assertStringIncludes(error.message, "AT_TIMESTAMP is for a Kinesis stream");
  });

  it("refuses a starting position timestamp on its own", async () => {
    // Given a stream and a function.
    // When a mapping gives a timestamp with a position that has no use for one.
    const error = await createStreamMapping({
      StartingPosition: "LATEST",
      StartingPositionTimestamp: new Date("2026-08-04T09:00:00.000Z"),
    });

    // Then it is refused rather than the timestamp being ignored.
    assertStringIncludes(
      error.message,
      "StartingPositionTimestamp only goes with",
    );
  });

  it("refuses a batch size larger than a stream delivers", async () => {
    // Given a stream and a function.
    // When a mapping asks for a batch bigger than a stream hands out.
    const error = await createStreamMapping({
      StartingPosition: "TRIM_HORIZON",
      BatchSize: 10_001,
    });

    // Then it is refused, saying what a stream does deliver.
    assertStringIncludes(error.message, "a DynamoDB stream delivers");
  });

  it("refuses a batch item failure report from a stream mapping", async () => {
    // Given a stream and a function.
    // When a mapping says the function reports its own batch item failures.
    const error = await createStreamMapping({
      StartingPosition: "TRIM_HORIZON",
      FunctionResponseTypes: ["ReportBatchItemFailures"],
    });

    // Then it is refused rather than accepted and ignored: a stream retries
    // from the record a report names, which is not what a failing batch does
    // here.
    assertStringIncludes(
      error.message,
      "FunctionResponseTypes on a DynamoDB stream event source mapping is " +
        "not simulated",
    );
  });

  it("refuses a mapping whose execution role cannot read the stream", async () => {
    // Given a role allowed only to describe the stream.
    // When a mapping is created for it.
    const error = await createStreamMapping(
      { StartingPosition: "TRIM_HORIZON" },
      ["dynamodb:DescribeStream"],
    );

    // Then it is refused at creation, naming the operation it cannot call,
    // rather than being created and delivering nothing.
    assertStringIncludes(
      error.message,
      "does not have permissions to call GetRecords on DynamoDB Streams",
    );
  });

  it("refuses a mapping to a stream that is not there", async () => {
    // Given a table, and a role allowed to read any stream in the Account.
    const simAws = new SimAws();
    const { streamArn } = await makeSourceStream(simAws);
    const roleArn = await makeStreamPollingRole(simAws, "*");

    await simAws.lambda().createFunction({
      input: {
        FunctionName: "order-projector",
        Role: roleArn,
        Code: { ZipFile: makeLambdaZipFileInput((): undefined => undefined) },
      },
    });

    // When a mapping names a stream label no table ever had.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.lambda().createEventSourceMapping(
        new CreateEventSourceMappingCommand({
          EventSourceArn: streamArn.replace(/[^/]+$/u, "2020-01-01T00:00:00.0"),
          FunctionName: "order-projector",
          StartingPosition: "TRIM_HORIZON",
        }),
      );
    });

    // Then it is refused at creation rather than at the first poll.
    assertStringIncludes(error.message, "No DynamoDB Stream with ARN");
  });

  it("refuses a mapping to a stream in another Account", async () => {
    // Given a simulated AWS with a stream mapped to a function.
    const { simAws, functionName } = await simAwsWithStreamEventSource();

    // When a mapping names a stream belonging to a different Account.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.lambda().createEventSourceMapping(
        new CreateEventSourceMappingCommand({
          EventSourceArn:
            "arn:aws:dynamodb:eu-west-2:222222222222:table/orders/stream/2026-08-04T09:00:00.000",
          FunctionName: functionName,
          StartingPosition: "TRIM_HORIZON",
        }),
      );
    });

    // Then it is refused, as it is on AWS.
    assertStringIncludes(
      error.message,
      "only be mapped to an event source in its own Account and Region",
    );
  });
});
