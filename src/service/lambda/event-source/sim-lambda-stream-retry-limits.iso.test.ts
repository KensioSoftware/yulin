import {
  CreateEventSourceMappingCommand,
  GetEventSourceMappingCommand,
  ListEventSourceMappingsCommand,
} from "@aws-sdk/client-lambda";
import {
  assertArrayLength,
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { simAwsWithSqsEventSource } from "../../../../test/lambda/event-source-fixture.js";
import {
  makeSourceStream,
  makeStreamPollingRole,
} from "../../../../test/lambda/stream-event-source-fixture.js";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimCreateEventSourceMappingCommandOutput } from "../command/event-source-mapping/event-source-mapping.command.js";
import { makeLambdaZipFileInput } from "../function/code/lambda-zip-file-input.js";

/**
 * The failed-batch limits a request can ask a stream mapping for.
 */
interface RetryLimitsRequest {
  readonly MaximumRetryAttempts?: number;
  readonly MaximumRecordAgeInSeconds?: number;
}

/**
 * One simulated AWS with a stream and a function, ready to be mapped.
 */
interface MappableStream {
  readonly simAws: SimAws;
  readonly streamArn: string;
}

async function simAwsReadyToMap(): Promise<MappableStream> {
  const simAws = new SimAws();
  const { streamArn } = await makeSourceStream(simAws);
  const roleArn = await makeStreamPollingRole(simAws, streamArn);

  await simAws.lambda().createFunction({
    input: {
      FunctionName: "order-projector",
      Role: roleArn,
      Code: { ZipFile: makeLambdaZipFileInput((): undefined => undefined) },
    },
  });

  return { simAws, streamArn };
}

/**
 * Create a stream mapping asking for failed-batch limits.
 */
async function createStreamMapping(
  ready: MappableStream,
  request: RetryLimitsRequest,
): Promise<SimCreateEventSourceMappingCommandOutput> {
  return await ready.simAws.lambda().createEventSourceMapping(
    new CreateEventSourceMappingCommand({
      EventSourceArn: ready.streamArn,
      FunctionName: "order-projector",
      StartingPosition: "TRIM_HORIZON",
      ...request,
    }),
  );
}

/**
 * Try to create a stream mapping, and answer with what it was refused with.
 */
async function refusedStreamMapping(
  request: RetryLimitsRequest,
): Promise<Error> {
  const ready = await simAwsReadyToMap();

  return await assertThrowsErrorAsync(async () => {
    await createStreamMapping(ready, request);
  });
}

describe("the failed-batch limits a stream event source mapping is created with", () => {
  it("reports the limits the request asked for", async () => {
    // Given a stream and a function to map it to.
    const ready = await simAwsReadyToMap();

    // When a mapping is created with a retry quota and a record age.
    const created = await createStreamMapping(ready, {
      MaximumRetryAttempts: 3,
      MaximumRecordAgeInSeconds: 120,
    });

    // Then the mapping reports both back rather than the defaults.
    assertIdentical(created.MaximumRetryAttempts, 3);
    assertIdentical(created.MaximumRecordAgeInSeconds, 120);
  });

  it("reports the limits through Get and List", async () => {
    // Given a mapping created with a retry quota and a record age.
    const ready = await simAwsReadyToMap();
    const created = await createStreamMapping(ready, {
      MaximumRetryAttempts: 3,
      MaximumRecordAgeInSeconds: 120,
    });

    // When the mapping is read back and listed.
    const read = await ready.simAws
      .lambda()
      .getEventSourceMapping(
        new GetEventSourceMappingCommand({ UUID: created.UUID }),
      );
    const listed = await ready.simAws
      .lambda()
      .listEventSourceMappings(
        new ListEventSourceMappingsCommand({ EventSourceArn: ready.streamArn }),
      );

    // Then both report what the mapping was created with.
    assertIdentical(read.MaximumRetryAttempts, 3);
    assertIdentical(read.MaximumRecordAgeInSeconds, 120);
    assertArrayLength(listed.EventSourceMappings, 1);
    assertIdentical(
      listed.EventSourceMappings[0].MaximumRecordAgeInSeconds,
      120,
    );
  });

  it("reports no limit for a mapping that asked for neither", async () => {
    // Given a stream and a function to map it to.
    const ready = await simAwsReadyToMap();

    // When a mapping is created without either limit.
    const created = await createStreamMapping(ready, {});

    // Then it reports Lambda's own -1 for both, which is what a stream mapping
    // on AWS reports when nothing has been asked for.
    assertIdentical(created.MaximumRetryAttempts, -1);
    assertIdentical(created.MaximumRecordAgeInSeconds, -1);
  });

  it("leaves both out of a queue mapping, which has neither", async () => {
    // Given a mapping between a queue and a function.
    const { simAws, uuid } = await simAwsWithSqsEventSource();

    // When it is read back.
    const read = await simAws
      .lambda()
      .getEventSourceMapping(new GetEventSourceMappingCommand({ UUID: uuid }));

    // Then neither limit is reported, because a message the function never
    // handles is left to the queue rather than counted by the mapping.
    assertUndefined(read.MaximumRetryAttempts);
    assertUndefined(read.MaximumRecordAgeInSeconds);
  });

  it("refuses more retries than Lambda takes", async () => {
    // Given a stream and a function.
    // When a mapping asks for more retries than Lambda's maximum.
    const error = await refusedStreamMapping({ MaximumRetryAttempts: 10_001 });

    // Then it is refused rather than promising a quota nothing would honour.
    assertIdentical(error.name, "ValidationException");
    assertStringIncludes(error.message, "maximumRetryAttempts");
  });

  it("refuses a record age older than Lambda takes", async () => {
    // Given a stream and a function.
    // When a mapping asks to carry records for longer than Lambda's maximum.
    const error = await refusedStreamMapping({
      MaximumRecordAgeInSeconds: 604_801,
    });

    // Then it is refused, naming the setting that is out of range.
    assertIdentical(error.name, "ValidationException");
    assertStringIncludes(error.message, "maximumRecordAgeInSeconds");
  });

  it("refuses a limit below the -1 that means no limit", async () => {
    // Given a stream and a function.
    // When a mapping asks for a negative quota that is not Lambda's -1.
    const error = await refusedStreamMapping({ MaximumRetryAttempts: -2 });

    // Then it is refused rather than read as no limit at all.
    assertIdentical(error.name, "ValidationException");
  });

  it("refuses a limit that is not a whole number", async () => {
    // Given a stream and a function.
    // When a mapping asks for a fractional record age.
    const error = await refusedStreamMapping({
      MaximumRecordAgeInSeconds: 90.5,
    });

    // Then it is refused here rather than deciding later what half a second of
    // record age means.
    assertIdentical(error.name, "ValidationException");
  });
});
