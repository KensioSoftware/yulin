import { CreateEventSourceMappingCommand } from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  makeConsumerFunction,
  makePollingRole,
  makeSourceQueue,
  recordingHandler,
} from "../../../../../test/lambda/event-source-fixture.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";
import { SimLambda } from "../../sim-lambda.js";
import type { SimCreateEventSourceMappingCommandInput } from "./event-source-mapping.command.js";

interface MappableSimAws {
  readonly simAws: SimAws;
  readonly queueArn: string;
  readonly functionName: string;
}

async function simAwsReadyToMap(): Promise<MappableSimAws> {
  const simAws = new SimAws();
  const { queueArn } = await makeSourceQueue(simAws);
  const roleArn = await makePollingRole(simAws, queueArn);
  const functionName = await makeConsumerFunction(
    simAws,
    roleArn,
    recordingHandler().handler,
  );

  return { simAws, queueArn, functionName };
}

/**
 * Try to create a mapping with an input, and answer with what it was refused
 * with.
 */
async function refusedMapping(
  ready: MappableSimAws,
  input: Partial<SimCreateEventSourceMappingCommandInput>,
): Promise<Error> {
  return await assertThrowsErrorAsync(async () => {
    await ready.simAws.lambda().createEventSourceMapping({
      input: {
        EventSourceArn: ready.queueArn,
        FunctionName: ready.functionName,
        ...input,
      },
    });
  });
}

describe("sim Lambda CreateEventSourceMapping validation", () => {
  it("requires an event source ARN", async () => {
    // Given a queue and a function.
    const ready = await simAwsReadyToMap();

    // When a mapping names no event source.
    const error = await refusedMapping(ready, { EventSourceArn: undefined });

    // Then the request is refused as invalid.
    assertIdentical(error.name, "ValidationException");
    assertStringIncludes(error.message, "eventSourceArn");
  });

  it("requires a function name", async () => {
    // Given a queue and a function.
    const ready = await simAwsReadyToMap();

    // When a mapping names no function.
    const error = await refusedMapping(ready, { FunctionName: undefined });

    // Then the request is refused as invalid.
    assertIdentical(error.name, "ValidationException");
    assertStringIncludes(error.message, "functionName");
  });

  it("refuses an event source that is not an SQS queue", async () => {
    // Given a queue and a function.
    const ready = await simAwsReadyToMap();

    // When a mapping names a DynamoDB stream.
    const error = await refusedMapping(ready, {
      EventSourceArn:
        "arn:aws:dynamodb:eu-west-2:111111111111:table/orders/stream/2026-07-30T00:00:00.000",
    });

    // Then it is refused rather than accepted and never delivered from.
    assertIdentical(error.name, "InvalidParameterValueException");
    assertStringIncludes(error.message, "is not an SQS queue ARN");
  });

  it("refuses a queue in another Account or Region", async () => {
    // Given a queue and a function.
    const ready = await simAwsReadyToMap();

    // When a mapping names a queue belonging to another Account.
    const error = await refusedMapping(ready, {
      EventSourceArn: "arn:aws:sqs:eu-west-2:222222222222:orders",
    });

    // Then it is refused, as a queue can only feed a function beside it.
    assertStringIncludes(error.message, "its own Account and Region");
  });

  it("refuses a batch size larger than a queue with no batching window gives", async () => {
    // Given a queue and a function.
    const ready = await simAwsReadyToMap();

    // When a mapping asks for a batch of fifty.
    const error = await refusedMapping(ready, { BatchSize: 50 });

    // Then it is refused rather than delivering ten.
    assertStringIncludes(error.message, "BatchSize 50 is out of range");
  });

  it("refuses a batching window, which nothing here would wait out", async () => {
    // Given a queue and a function.
    const ready = await simAwsReadyToMap();

    // When a mapping asks to batch for five seconds.
    const error = await refusedMapping(ready, {
      MaximumBatchingWindowInSeconds: 5,
    });

    // Then it is refused rather than silently ignored.
    assertStringIncludes(error.message, "MaximumBatchingWindowInSeconds");
  });

  it("refuses a function response type Lambda does not have", async () => {
    // Given a queue and a function.
    const ready = await simAwsReadyToMap();

    // When a mapping names a response type that is not a Lambda one.
    const error = await refusedMapping(ready, {
      FunctionResponseTypes: ["ReportEverything"],
    });

    // Then it is refused.
    assertIdentical(error.name, "ValidationException");
    assertStringIncludes(error.message, "ReportEverything");
  });

  it("refuses filter criteria, which would change what the function sees", async () => {
    // Given a queue and a function.
    const ready = await simAwsReadyToMap();

    // When a mapping asks for event filtering.
    const error = await refusedMapping(ready, {
      FilterCriteria: { Filters: [{ Pattern: "{}" }] },
    });

    // Then it is refused rather than delivering everything.
    assertStringIncludes(error.message, "FilterCriteria");
    assertStringIncludes(error.message, "not simulated");
  });

  it("refuses a mapping on a standalone simulated Lambda with no queues", async () => {
    // Given a simulated Lambda constructed outside SimAws.
    const lambda = new SimLambda({
      accountRegionScope: {
        accountId: "111111111111" as SimAwsAccountId,
        regionName: "eu-west-2",
      },
    });

    await lambda.createFunction({
      input: {
        FunctionName: "order-consumer",
        Role: "arn:aws:iam::111111111111:role/OrderConsumerRole",
        Code: { ZipFile: makeLambdaZipFileInput(recordingHandler().handler) },
      },
    });

    // When a mapping is created on it.
    const error = await assertThrowsErrorAsync(async () => {
      await lambda.createEventSourceMapping(
        new CreateEventSourceMappingCommand({
          EventSourceArn: "arn:aws:sqs:eu-west-2:111111111111:orders",
          FunctionName: "order-consumer",
        }),
      );
    });

    // Then it says there is no simulated SQS to poll.
    assertStringIncludes(error.message, "no simulated SQS to poll");
  });
});
